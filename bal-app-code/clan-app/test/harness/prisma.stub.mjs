/**
 * Prisma بذاكرة حقيقية — لتشغيل السيرفر بلا Postgres.
 * بيخزّن ويقرا فعلاً عشان نمشي فلو المستخدم كامل.
 */
export const calls = [];
export const DEBUG_DB = () => [...db.keys()];
const db = new Map();
let seq = 0;

/**
 * ️ الافتراضيات بتتقرا من schema.prisma نفسها.
 *
 *    من غير كده، حقل زي `isCompleted @default(false)` بيفضل
 *    undefined، والفلترة `where: { isCompleted: false }` بترجع
 *    صفر — فتبان كأنها مشكلة في الكود وهي مشكلة في المحاكاة.
 *    قِسناها فعلياً: المهمة كانت بتتعمل ومش بتظهر في القائمة.
 */
const DEFAULTS = new Map();
try {
  const { readFileSync } = await import('node:fs');
  const schema = readFileSync(
    new URL('../../prisma/schema.prisma', import.meta.url),
    'utf8',
  );
  let current = null;
  for (const raw of schema.split('\n')) {
    const line = raw.trim();
    const model = line.match(/^model\s+(\w+)\s*\{/);
    if (model) {
      current = model[1][0].toLowerCase() + model[1].slice(1);
      DEFAULTS.set(current, {});
      continue;
    }
    if (line === '}') { current = null; continue; }
    if (!current) continue;

    /**
     * ️ الحقول الاختيارية (`Type?`) بلا `@default`.
     *
     *  في Postgres دي بتبقى `NULL`. الستَب كان بيسيبها **غير
     *  معرّفة** (`undefined`)، والفرق مش شكلي:
     *
     *      where: { completedAt: null }   →  مش بيطابق undefined
     *
     *  الأثر اللي اتمسك: `listGoals` بيفلتر بـ`completedAt: null`،
     *  فالهدف اللي المستخدم وافق عليه لسه **مش ظاهر في القايمة**
     *  — والفحص قال إن الموافقة مكسورة وهي شغالة تماماً.
     *
     *  خدت وقت أطول من اللازم عشان أفرّق: الكود سليم، الأداة هي
     *  اللي كانت بتكدب.
     */
    const optional = line.match(/^(\w+)\s+(\w+)\?(?!\[)/);
    if (optional && !line.includes('@default')) {
      /**
       * ️ التمييز بالحرف الكبير **مش شغّال**: أنواع Prisma
       *    الأساسية كلها بحرف كبير (`String`, `DateTime`, `Int`).
       *    الحارس اللي كتبته الأول استبعدهم كلهم كـ«علاقات»
       *    فالإصلاح ما عملش حاجة، والفلتر فضل مكسور.
       *
       *    القايمة الصريحة هي الطريقة الوحيدة الأكيدة.
       */
      const SCALARS = new Set([
        'String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json',
        'BigInt', 'Decimal', 'Bytes',
      ]);
      if (SCALARS.has(optional[2])) {
        DEFAULTS.get(current)[optional[1]] = null;
      }
      continue;
    }

    /** ️ `[^)]*` كان بيقص `now()` عند أول قوس → "now(" .
     *    الصيغة دي بتاخد الاستدعاء كامل. */
    const field = line.match(/^(\w+)\s+(\w+)(\[\])?\??\s+.*@default\((\w+\(\)|[^)]*)\)/);
    if (!field) continue;
    const [, name, type, isList, def] = field;

    let value;
    if (def === 'now()') value = () => new Date();
    else if (def === 'false') value = false;
    else if (def === 'true') value = true;
    else if (def.startsWith('uuid') || def.startsWith('cuid') || def.startsWith('autoincrement')) continue;
    else if (isList || def.startsWith('[')) value = [];
    else if (/^-?\d+(\.\d+)?$/.test(def)) value = Number(def);
    else if (def.startsWith('"')) value = def.slice(1, -1);
    else if (type !== 'String') value = def; // قيمة enum
    else value = def;

    DEFAULTS.get(current)[name] = value;
  }
} catch { /* الاسكيما مش متاحة — نكمل بلا افتراضيات */ }

const withDefaults = (name, data) => {
  const defs = DEFAULTS.get(name) ?? {};
  const out = {};
  for (const [k, v] of Object.entries(defs)) {
    out[k] = typeof v === 'function' ? v() : v;
  }
  return { ...out, ...data };
};
const rows = (m) => { if (!db.has(m)) db.set(m, []); return db.get(m); };

/** العلاقات اللي اسم جدولها مش مجرد صيغة المفرد */
/**
 * ️ `participants` غامضة: `Conversation.participants` بتروح
 *    لـ `conversationParticipant` و`FocusChallenge.participants`
 *    بتروح لـ `focusChallengeParticipant`. الخريطة المسطّحة
 *    مبتعرفش تفرّق، فالكتابة المتداخلة بتحتاج سياق الأب —
 *    شوف NESTED_TABLE تحت.
 */
const RELATION_TABLE = {
  participants: 'focusChallengeParticipant',
  players: 'gameRoomPlayer',
  members: 'clanMember',
  days: 'journeyDay',
  steps: 'goalStep',
  messages: 'message',
  notifications: 'notification',
  tasks: 'task',
};

/**
 * أسماء علاقات مش في RELATION_TABLE — بتستخدمها فلترة `some`.
 * ️ `participants` هنا بتروح لمحادثة لأن ده الاستخدام الوحيد
 *    في فلترة العلاقات (`findDirectConversation`).
 */
const NESTED_LOOKUP = {
  participants: 'conversationParticipant',
};

const matches = (row, where = {}) => {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!v.every((w) => matches(row, w))) return false; continue; }
    if (k === 'OR')  { if (!v.some((w) => matches(row, w))) return false; continue; }
    if (k === 'NOT') { if (matches(row, v)) return false; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      /**
       * ️ `path` لازم **قبل** `equals` — الاتنين موجودين في نفس
       *    الكائن: `data: { path: ['taskId'], equals: x }`. لو
       *    فحصنا equals الأول هنقارن كائن data كله بالقيمة ونفشل.
       *    ده اللي خلّى فحص «منع التكرار» يقول إنه مكسور وهو شغّال.
       */
      if ('path' in v && 'equals' in v) {
        let cur = row[k];
        for (const seg of v.path) cur = cur?.[seg];
        if (cur !== v.equals) return false;
        continue;
      }
      /**
       * ️ فلترة بعلاقة: `participants: { some: { userId: x } }`
       *
       *  الستَب القديم كان بيتجاهلها تماماً (بيوصل لـ `continue`
       *  في الآخر). النتيجة إن `findDirectConversation` كان
       *  بيرجّع **أول محادثة في الجدول** أياً كانت، حتى لو
       *  المستخدمين دول مش فيها. فالتطبيق كان بيبعت رسايل
       *  لمحادثة غريبة ويقع بـ 403 — وهو سليم تماماً.
       *
       *  بنحلّها بنفس منطق العلاقات في hydrate: أي حقل ينتهي
       *  بـ Id وقيمته = معرّف الصف الأب.
       */
      if ('some' in v || 'every' in v || 'none' in v) {
        const table = RELATION_TABLE[k] ?? NESTED_LOOKUP[k] ?? k;
        const kids = (db.get(table) ?? []).filter((kid) =>
          Object.entries(kid).some(
            ([key, val]) => key.endsWith('Id') && val === row.id,
          ),
        );

        if ('some' in v && !kids.some((kid) => matches(kid, v.some))) return false;
        if ('every' in v && !kids.every((kid) => matches(kid, v.every))) return false;
        if ('none' in v && kids.some((kid) => matches(kid, v.none))) return false;
        continue;
      }
      /**
       * ️ مقارنات النطاق — `gte`, `lt`, `gt`, `lte`
       *
       *  دي كانت **مفقودة تماماً** والستَب كان بيعدّي عليها
       *  بـ `continue`. يعني `createdAt: { lt: X }` كان بيتجاهَل
       *  ويرجّع كل الصفوف. أثرها أوسع من الشات بكتير: كل استعلام
       *  «النهاردة» (`startedAt >= todayStart`) كان بيرجّع كل
       *  السجل، فأي فحص لمهام اليوم أو حدود التاريخ كان **بيعدّي
       *  وهو مش بيفحص حاجة**.
       *
       *  بنحوّل للأرقام عشان المقارنة تشتغل على التواريخ والنصوص
       *  والأرقام بنفس الكود.
       */
      const RANGE = ['gte', 'gt', 'lte', 'lt'];
      if (RANGE.some((op2) => op2 in v)) {
        const norm = (x) => (x instanceof Date ? x.getTime()
          : typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? Date.parse(x)
          : x);

        const actual = norm(row[k]);
        if (actual === undefined || actual === null) return false;

        if ('gte' in v && !(actual >= norm(v.gte))) return false;
        if ('gt'  in v && !(actual >  norm(v.gt)))  return false;
        if ('lte' in v && !(actual <= norm(v.lte))) return false;
        if ('lt'  in v && !(actual <  norm(v.lt)))  return false;
        continue;
      }
      if ('in' in v)     { if (!v.in.includes(row[k])) return false; continue; }
      if ('not' in v)    { if (row[k] === v.not) return false; continue; }
      if ('equals' in v) { if (row[k] !== v.equals) return false; continue; }
      if ('contains' in v) {
        if (!String(row[k] ?? '').toLowerCase().includes(String(v.contains).toLowerCase())) return false;
        continue;
      }
      continue;
    }
    if (row[k] !== v) return false;
  }
  return true;
};

const uniqueWhere = (where = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) Object.assign(out, v);
    else out[k] = v;
  }
  return out;
};


/**
 * ═══════════════════════════════════════════════════════════
 *  الكتابة المتداخلة — nested writes
 *
 *  ️ ليه اتضافت:
 *
 *  `createDirectConversation` بيكتب كده:
 *
 *      prisma.conversation.create({
 *        data: {
 *          type: 'DIRECT',
 *          participants: { create: [{ userId: a }, { userId: b }] },
 *        },
 *      })
 *
 *  الستَب القديم كان بيحفظ `participants` كـ **حقل خام** على صف
 *  المحادثة، ومكانش بيعمل صفوف في `conversationParticipant`
 *  خالص. النتيجة إن `assertAccess` كان بيدوّر على المشارك
 *  وميلاقيهوش، فيرمي «أنت لست في هذه المحادثة» — والشات كله
 *  كان مستحيل يتفحص.
 *
 *  ️ ده كان **نقص في أداة الفحص**، مش باج في التطبيق. الفرق
 *    مهم: لو صدّقنا الستَب كنا هنروح نصلّح كود سليم.
 * ═══════════════════════════════════════════════════════════
 */

/** اسم الجدول للعلاقة، حسب الأب — `participants` غامضة لوحدها */
const NESTED_TABLE = {
  conversation: { participants: 'conversationParticipant' },
  focusChallenge: { participants: 'focusChallengeParticipant' },
  gameRoom: { players: 'gameRoomPlayer' },
  clan: { members: 'clanMember' },
  goal: { steps: 'goalStep' },
  journey: { days: 'journeyDay' },
};

/** المفتاح الأجنبي اللي بيربط الابن بالأب */
const FOREIGN_KEY = {
  conversationParticipant: 'conversationId',
  focusChallengeParticipant: 'challengeId',
  gameRoomPlayer: 'roomId',
  clanMember: 'clanId',
  goalStep: 'goalId',
  journeyDay: 'journeyId',
};

/** يفصل الحقول العادية عن الكتابات المتداخلة */
const splitNested = (data) => {
  const scalars = {};
  const nested = {};

  for (const [k, v] of Object.entries(data)) {
    const isNested =
      v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) &&
      ('create' in v || 'createMany' in v || 'connectOrCreate' in v);

    if (isNested) nested[k] = v;
    else scalars[k] = v;
  }
  return { scalars, nested };
};

/** ينفّذ الكتابات المتداخلة كصفوف حقيقية في جداولها */
const applyNested = (parentName, parentRow, nested) => {
  for (const [rel, spec] of Object.entries(nested)) {
    const table =
      NESTED_TABLE[parentName]?.[rel] ?? RELATION_TABLE[rel] ?? rel;
    const fk = FOREIGN_KEY[table] ?? `${parentName}Id`;

    let items = spec.create ?? spec.createMany?.data ?? spec.connectOrCreate;
    if (!items) continue;
    if (!Array.isArray(items)) items = [items];

    const childList = rows(table);
    for (const item of items) {
      const payload = item.create ?? item;
      const inner = splitNested(payload);
      const child = {
        id: `${table}-${++seq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        [fk]: parentRow.id,
        ...withDefaults(table, inner.scalars),
      };
      childList.push(child);
      applyNested(table, child, inner.nested);
    }
  }
};

const model = (name) => new Proxy({}, {
  get: (_, opRaw) => {
    const op = String(opRaw);
    return async (args = {}) => {
      calls.push(`${name}.${op}`);
      const list = rows(name);

      const hydrate = (row) => {
        if (!row || !args.include) return row;
        const out = { ...row };
        for (const [rel, cfg] of Object.entries(args.include)) {
          if (rel === '_count') {
            out._count = {};
            for (const f of Object.keys(cfg?.select ?? {})) out._count[f] = 0;
            continue;
          }
          /**
           * ️ العلاقة الجمع بتترجع من الجدول الحقيقي.
           *
           *    كانت بترجع `[]` دايماً، فالفحص كان بيقول
           *    «المشاركين: 0» و«اللاعبين: 0» رغم إن الانضمام
           *    نجح فعلاً — إنذار كاذب كان هيخفي مشكلة حقيقية
           *    لو حصلت.
           *
           *    بنخمّن اسم الجدول من اسم العلاقة، وبنربط بالمفتاح
           *    الأجنبي `<name>Id`.
           */
          if (rel.endsWith('s')) {
            const child = RELATION_TABLE[rel] ?? rel.slice(0, -1);
            const all = db.get(child) ?? [];

            /**
             * ️ اسم المفتاح الأجنبي مش دايماً `<model>Id`.
             *    `GameRoomPlayer` بيستخدم `roomId` مش `gameRoomId`،
             *    و`FocusChallengeParticipant` بيستخدم `challengeId`.
             *    فبدل ما نخمّن الاسم، بنقبل أي حقل ينتهي بـ Id
             *    وقيمته = معرّف الصف الأب.
             */
            let kids = all.filter((r2) =>
              Object.entries(r2).some(([key, val]) => key.endsWith('Id') && val === row.id),
            );
            if (cfg?.where) kids = kids.filter((r2) => matches(r2, cfg.where));

            /** include متداخل جوه العلاقة (user مثلاً) */
            out[rel] = kids.map((kid) => {
              if (!cfg?.include) return kid;
              const enriched = { ...kid };
              for (const sub of Object.keys(cfg.include)) {
                const subId = kid[`${sub}Id`];
                const subRows = db.get(sub) ?? [];
                enriched[sub] = subRows.find((x) => x.id === subId)
                  ?? { id: subId ?? `${sub}-1`, username: 'عضو' };
              }
              return enriched;
            });
            continue;
          }

          /** علاقة مفردة بـ include متداخل: clan: { include: { _count } } */
          if (cfg && typeof cfg === 'object' && cfg.include) {
            const inner = { id: `${rel}-1`, name: 'عنصر', title: 'عنصر' };
            for (const [ir, icfg] of Object.entries(cfg.include)) {
              if (ir === '_count') {
                inner._count = {};
                for (const f of Object.keys(icfg?.select ?? {})) inner._count[f] = 0;
              } else inner[ir] = ir.endsWith('s') ? [] : { id: `${ir}-1`, username: 'عضو' };
            }
            out[rel] = inner;
            continue;
          }

          /**
           * علاقة مفردة: الصف الحقيقي بالمفتاح الأجنبي.
           *
           * ️ الاسم مش دايماً `<rel>Id` — `journey.step` بيستخدم
           *    `goalStepId`. بنجرّب الاسم المباشر، وبعدين أي مفتاح
           *    ينتهي بـ Id وقيمته موجودة في جدول محتمل.
           */
          const direct = row[`${rel}Id`];
          const tables = [rel, RELATION_TABLE[rel + 's'], `${rel}Step`, 'goalStep'].filter(Boolean);
          let hit = null;
          for (const t of tables) {
            const rowsT = db.get(t) ?? [];
            hit = rowsT.find((x) => x.id === direct);
            if (hit) break;
            for (const [key, val] of Object.entries(row)) {
              if (!key.endsWith('Id') || typeof val !== 'string') continue;
              const cand = rowsT.find((x) => x.id === val);
              if (cand) { hit = cand; break; }
            }
            if (hit) break;
          }
          /**
           * نكمّل include المتداخل جوه الصف اللي لقيناه.
           *
           * ️ كان مستوى واحد بس، والكود الحقيقي بيوصل لمستويين:
           *
           *     step: { select: { goal: { select: { userId } } } }
           *     journeys.map(j => j.step.goal.userId)
           *
           *   المستوى التاني كان بيرجّع كائن بلا `userId`، فالنداء
           *   بيرمي `Cannot read properties of undefined`.
           *   ده كان بيمنع `generateTodayTasks` من الشغل خالص —
           *   يعني «المهام بتنزل تلقائي» (جوهر المنتج) كان بره
           *   التغطية.
           *
           *   الحل: دالة تكرارية بدل حلقة مستوى واحد.
           */
          const enrich = (target, includeCfg, depth = 0) => {
            if (!target || !includeCfg || depth > 4) return target;
            const copy = { ...target };

            for (const [sub, subCfg] of Object.entries(includeCfg)) {
              //  `select: { x: true }` مش include — نتخطاه
              if (subCfg === true) continue;

              const nested = subCfg?.select ?? subCfg?.include;
              const subId = copy[`${sub}Id`];

              let found = (db.get(sub) ?? []).find((x) => x.id === subId);

              //  مش لقيناه بالاسم؟ ندوّر بأي مفتاح أجنبي
              if (!found) {
                for (const [key, val] of Object.entries(copy)) {
                  if (!key.endsWith('Id') || typeof val !== 'string') continue;
                  const cand = (db.get(sub) ?? []).find((x) => x.id === val);
                  if (cand) { found = cand; break; }
                }
              }

              if (!found) {
                copy[sub] = subId
                  ? { id: subId, username: 'عضو', title: 'عنصر' }
                  : null;
                continue;
              }

              copy[sub] = nested
                ? enrich(found, nested, depth + 1)
                : { ...found };
            }
            return copy;
          };

          if (hit && (cfg?.include || cfg?.select)) {
            hit = enrich(hit, cfg.include ?? cfg.select);
          }
          /**
           * ️ العلاقة اللي مش موجودة لازم ترجّع `null`.
           *
           *  الستَب كان بيخترع كائن وهمي دايماً. النتيجة إن أي
           *  فحص «العلاقة دي موجودة ولا لأ» بيرجّع **موجودة**
           *  على طول:
           *
           *      include: { journey: { select: { id: true } } }
           *      if (step.journey) throw JOURNEY_EXISTS
           *
           *  فخطوة اتعملت للتو ومالهاش رحلة كانت بترمي
           *  «ليها رحلة بالفعل» — والإقلاع التلقائي بعد الموافقة
           *  على الجبل كان بيفشل **صامت** في كل مرة.
           *
           *  الاختراع بيتعمل بس لما يكون فيه مفتاح أجنبي فعلاً
           *  (يعني العلاقة مفروض تكون موجودة والصف ضايع من
           *  الستَب) — مش لما المفتاح نفسه فاضي.
           */
          out[rel] = hit
            ?? (direct
              ? { id: direct, username: 'عضو', title: 'عنصر', profileImage: null }
              : null);
        }
        return out;
      };

      if (op === 'findMany') {
        /**
         * ️ الترتيب والقص لازم يتطبّقوا فعلاً.
         *
         *  الستَب القديم كان بيرجّع **كل** الصفوف ويتجاهل
         *  `orderBy` و`take` و`skip`. النتيجة إن أي اختبار
         *  لترقيم الصفحات كان بيعدّي وهو مش بيفحص حاجة:
         *  `limit=20` كان بيرجّع ٥١ صف والاختبار يشوفهم
         *  «موجودين» فيعدّي. أسوأ من مفيش اختبار — اختبار
         *  بيدّي طمأنينة كاذبة.
         */
        let out = list.filter((r) => matches(r, args.where ?? {}));

        const order = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
        if (order) {
          const [field, dir] = Object.entries(order)[0] ?? [];
          if (field) {
            out = [...out].sort((a, b) => {
              const av = a[field];
              const bv = b[field];
              if (av === bv) return 0;
              if (av == null) return 1;
              if (bv == null) return -1;
              const cmp = av > bv ? 1 : -1;
              return dir === 'desc' ? -cmp : cmp;
            });
          }
        }

        if (Number.isFinite(args.skip)) out = out.slice(args.skip);
        if (Number.isFinite(args.take)) out = out.slice(0, args.take);

        return out.map(hydrate);
      }
      if (op === 'count')    return list.filter((r) => matches(r, args.where ?? {})).length;
      if (op === 'findFirst') return hydrate(list.find((r) => matches(r, args.where ?? {})) ?? null);
      if (op === 'findUnique' || op === 'findUniqueOrThrow') {
        const hit = list.find((r) => matches(r, uniqueWhere(args.where)));
        if (!hit && op.endsWith('OrThrow')) throw new Error('NOT_FOUND');
        return hydrate(hit ?? null);
      }
      if (op === 'create') {
        const { scalars, nested } = splitNested(args.data ?? {});
        const row = {
          id: `${name}-${++seq}`,
          createdAt: new Date(), updatedAt: new Date(),
          ...withDefaults(name, scalars),
        };
        list.push(row);
        applyNested(name, row, nested);
        return row;
      }
      if (op === 'createMany') {
        for (const d of args.data ?? []) list.push({ id: `${name}-${++seq}`, createdAt: new Date(), ...withDefaults(name, d) });
        return { count: (args.data ?? []).length };
      }
      if (op === 'update' || op === 'upsert') {
        const w = uniqueWhere(args.where ?? {});
        let hit = list.find((r) => matches(r, w));
        if (!hit) { hit = { id: `${name}-${++seq}`, createdAt: new Date(), ...w, ...(args.create ?? {}) }; list.push(hit); }
        const payload = args.data ?? args.update ?? {};
        const split = splitNested(payload);
        Object.assign(hit, split.scalars, { updatedAt: new Date() });
        applyNested(name, hit, split.nested);
        return hit;
      }
      if (op === 'updateMany') {
        const hits = list.filter((r) => matches(r, args.where ?? {}));
        hits.forEach((r) => Object.assign(r, args.data ?? {}));
        return { count: hits.length };
      }
      if (op === 'delete' || op === 'deleteMany') {
        const w = op === 'delete' ? uniqueWhere(args.where) : (args.where ?? {});
        const keep = list.filter((r) => !matches(r, w));
        const n = list.length - keep.length;
        db.set(name, keep);
        return op === 'delete' ? { id: 'deleted' } : { count: n };
      }
      if (op === 'aggregate') return { _sum: {}, _count: 0, _avg: {} };
      if (op === 'groupBy') return [];
      return null;
    };
  },
});

const prisma = new Proxy({}, {
  get: (_, k) => {
    const m = String(k);
    if (m === '$transaction') return async (fn) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn));
    if (m === '$connect' || m === '$disconnect') return async () => {};
    if (m === '$queryRaw' || m === '$executeRaw' || m === '$queryRawUnsafe') return async () => [];
    if (m === 'then' || m === 'catch') return undefined;
    return model(m);
  },
});
export default prisma;
