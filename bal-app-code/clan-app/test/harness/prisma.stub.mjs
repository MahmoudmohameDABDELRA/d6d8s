/**
 * Prisma بذاكرة حقيقية — لتشغيل السيرفر بلا Postgres.
 * بيخزّن ويقرا فعلاً عشان نمشي فلو المستخدم كامل.
 */
export const calls = [];
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

const matches = (row, where = {}) => {
  for (const [k, v] of Object.entries(where)) {
    if (k === 'AND') { if (!v.every((w) => matches(row, w))) return false; continue; }
    if (k === 'OR')  { if (!v.some((w) => matches(row, w))) return false; continue; }
    if (k === 'NOT') { if (matches(row, v)) return false; continue; }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
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
          out[rel] = rel.endsWith('s')
            ? []
            : { id: `${rel}-1`, username: 'عضو', title: 'عنصر', profileImage: null };
        }
        return out;
      };

      if (op === 'findMany') return list.filter((r) => matches(r, args.where ?? {})).map(hydrate);
      if (op === 'count')    return list.filter((r) => matches(r, args.where ?? {})).length;
      if (op === 'findFirst') return hydrate(list.find((r) => matches(r, args.where ?? {})) ?? null);
      if (op === 'findUnique' || op === 'findUniqueOrThrow') {
        const hit = list.find((r) => matches(r, uniqueWhere(args.where)));
        if (!hit && op.endsWith('OrThrow')) throw new Error('NOT_FOUND');
        return hydrate(hit ?? null);
      }
      if (op === 'create') {
        const row = {
          id: `${name}-${++seq}`,
          createdAt: new Date(), updatedAt: new Date(),
          ...withDefaults(name, args.data ?? {}),
        };
        list.push(row);
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
        Object.assign(hit, args.data ?? args.update ?? {}, { updatedAt: new Date() });
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
