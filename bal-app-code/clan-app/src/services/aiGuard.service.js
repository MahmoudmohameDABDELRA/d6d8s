/**
 * ════════════════════════════════════════════════════════════
 *  حارس المرافق — الطبقة التي تفرض ما لا يضمنه البرومبت
 * ════════════════════════════════════════════════════════════
 *
 *  البرومبت رجاء. هذا الملف أمر.
 *
 *  بوابتان:
 *
 *   ┌─ inspectInput()  ──── قبل النداء ──── يوفّر مالاً ويحمي
 *   └─ inspectOutput() ──── بعد النداء ──── يقصّ ويعقّم
 *
 *  ️ ترتيب الفحوص في المدخل مقصود ولا يُغيَّر:
 *
 *    ١. الأزمة    — الأهم إنسانياً، وتتخطّى كل شيء
 *    ٢. الحقن     — أمني، قبل إنفاق أي مليم
 *    ٣. الطول     — الأرخص حسابياً، لكنه آخر ما يُهم
 *
 *    لو فحصنا الطول أولاً، رسالة أزمة طويلة تُرفض كـ"طويلة"
 *    بدل أن تُعالَج كأزمة. الترتيب هنا مسألة سلامة لا أناقة.
 */

import {
  AI_LIMITS,
  CRISIS,
  INJECTION,
  PRIVACY,
  RULE_CODES,
  TONE_RULES,
  TOOL_RULES,
} from '../config/aiRules.js';

// ════════════════════════════════════════════════
//  أدوات نصّية
// ════════════════════════════════════════════════

/**
 * تطبيع النصّ العربي قبل مطابقة الأنماط.
 *
 * ️ لماذا نحتاجه:
 *    "أنتحر" و"انتحر" و"إنتحر" ثلاث كتابات لكلمة واحدة.
 *    التشكيل والتطويل (ـــ) يكسران أي regex ساذج.
 *    محاولة تحايل بسيطة: "ا ن ت ح ر" بمسافات.
 */
export const normalize = (raw = '') =>
  String(raw)
    // التشكيل والشدة والتطويل
    .replace(/[\u0617-\u061A\u064B-\u0652\u0670\u0640]/g, '')
    // توحيد الألف
    .replace(/[أإآٱ]/g, 'ا')
    // توحيد الياء والتاء المربوطة
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    // مسافات متعددة → واحدة
    .replace(/\s+/g, ' ')
    .trim();

/**
 * فكّ التحايل بتفريق الحروف: "ا ن ت ح ر" → "انتحر"
 *
 * ️️ أخطر دالة في الملف. النسخة الأولى كانت تحذف **كل** المسافات
 *    فتلصق الكلمات ببعضها وتخترع كلمات غير موجودة:
 *
 *      "انت حر تعمل اللي انت عايزه"  →  "انتحرتعمل..."   إنذار كاذب
 *
 *    مستخدم يقول لصاحبه "انت حر" يتلقّى أرقام طوارئ انتحار.
 *    هذا يدمّر الثقة في الميزة كلها.
 *
 *  الحل: نلصق **فقط** تسلسلات الحروف المفردة المتباعدة
 *  (حرف · فاصل · حرف · فاصل · حرف ...) بطول ٣ حروف فأكثر.
 *  الكلمات الكاملة "انت" و"حر" لا تُلمس لأنها ليست حروفاً مفردة.
 */
const unstretch = (s = '') =>
  s.replace(
    /(?:[\p{L}][\s.\-_*|]+){2,}[\p{L}](?![\p{L}])/gu,
    (m) => m.replace(/[\s.\-_*|]/g, ''),
  );

/** عدّ الكلمات — يتجاهل الرموز المنفردة */
export const countWords = (text = '') =>
  String(text).trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * عدّ الإيموجي.
 *
 * ️ \p{Extended_Pictographic} أدقّ من \p{Emoji}:
 *    الأخيرة تعتبر الأرقام 0-9 إيموجي (لأنها أساس keycaps).
 *    جرّبناها فأعطت "عندك 3 مهام" = 1 إيموجي. خطأ صامت.
 */
export const countEmoji = (text = '') =>
  (String(text).match(/\p{Extended_Pictographic}/gu) ?? []).length;

// ════════════════════════════════════════════════
//  ١) كشف الأزمة
// ════════════════════════════════════════════════

/**
 * هل الرسالة إشارة إيذاء نفس؟
 *
 * المنطق: نمط خطر **و** لا استثناء عامّي.
 * الاستثناء يفوز دائماً — الإنذار الكاذب يكسر الثقة.
 *
 * @returns {{ isCrisis: boolean, matched?: string, suppressedBy?: string }}
 */
export const detectCrisis = (raw = '') => {
  const text = unstretch(normalize(raw));

  /**
   * ️ الكبح **موضعي** لا عامّي.
   *
   *  المنطق: نجد موضع نمط الخطر، ثم نسأل: هل يقع داخل تعبير آمن؟
   *
   *  لماذا؟ في أول نسخة كان أي استثناء في أي مكان يُلغي الرسالة كلها:
   *
   *    "اليوم ده قاتلني بجد … وبصراحة بقيت عايز اموت"
   *     └─ استثناء بريء ─┘              └─ أزمة حقيقية ─┘
   *
   *  فالنتيجة: كُبحت الأزمة. رسالة إنسان في خطر ذهبت للنموذج
   *  كأنها شكوى عادية. هذا أخطر فشل ممكن في هذا الملف.
   *
   *  الآن: الاستثناء يُبطل نمط الخطر فقط إن **تداخل معه**.
   */
  const safeSpans = [];
  for (const safe of CRISIS.FALSE_POSITIVES) {
    const re = new RegExp(safe.source, `${safe.flags.replace('g', '')}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      safeSpans.push([m.index, m.index + m[0].length]);
      if (m[0].length === 0) re.lastIndex += 1; // حماية من حلقة لا نهائية
    }
  }

  const insideSafe = (start, end) =>
    safeSpans.some(([s, e]) => start < e && end > s);

  for (const pattern of CRISIS.PATTERNS) {
    const re = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      if (!insideSafe(start, end)) {
        return { isCrisis: true, matched: String(pattern), phrase: m[0] };
      }
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }

  return { isCrisis: false };
};

// ════════════════════════════════════════════════
//  ٢) كشف محاولات الاختراق
// ════════════════════════════════════════════════

/**
 * @returns {{ level: 'NONE'|'SOFT'|'HARD', matched?: string }}
 */
export const detectInjection = (raw = '') => {
  const text = normalize(raw);

  for (const p of INJECTION.HARD) {
    if (p.test(text) || p.test(raw)) return { level: 'HARD', matched: String(p) };
  }

  for (const p of INJECTION.SOFT) {
    if (p.test(text) || p.test(raw)) return { level: 'SOFT', matched: String(p) };
  }

  return { level: 'NONE' };
};

// ════════════════════════════════════════════════
//  بوابة الدخول
// ════════════════════════════════════════════════

/**
 * يفحص رسالة المستخدم قبل أي نداء مدفوع.
 *
 * @param {string} raw
 * @returns {{
 *   allowed: boolean,
 *   action: 'PASS'|'CRISIS'|'REFUSE'|'REJECT',
 *   code?: string,
 *   reply?: string,        رد جاهز بلا نداء
 *   message?: string,      سبب الرفض (لأخطاء 400)
 *   injectReminder?: string,
 *   meta?: object,
 *   countsAgainstQuota: boolean
 * }}
 */
export const inspectInput = (raw) => {
  const text = typeof raw === 'string' ? raw.trim() : '';

  // ── فراغ ──
  if (text.length < AI_LIMITS.INPUT_MIN_CHARS) {
    return {
      allowed: false,
      action: 'REJECT',
      code: RULE_CODES.INPUT_EMPTY,
      message: 'الرسالة مطلوبة',
      countsAgainstQuota: false,
    };
  }

  // ── ١) الأزمة — قبل كل شيء، حتى قبل حدّ الطول ──
  const crisis = detectCrisis(text);
  if (crisis.isCrisis) {
    return {
      allowed: false,
      action: 'CRISIS',
      code: RULE_CODES.CRISIS_DETECTED,
      reply: CRISIS.REPLY,
      hotlines: CRISIS.HOTLINES,
      /**
       * ️ لا تُحتسب على حصّته.
       *    عقاب من يطلب المساعدة بخصم رسالة = تصميم قاسٍ.
       */
      countsAgainstQuota: false,
      meta: { matched: crisis.matched },
    };
  }

  // ── ٢) الاختراق ──
  const inj = detectInjection(text);
  if (inj.level === 'HARD') {
    return {
      allowed: false,
      action: 'REFUSE',
      code: RULE_CODES.INJECTION_BLOCKED,
      reply: INJECTION.REFUSAL,
      // لا نُنفق توكناً، فلا نخصم حصّة
      countsAgainstQuota: false,
      meta: { matched: inj.matched },
    };
  }

  // ── ٣) الطول ──
  if (text.length > AI_LIMITS.INPUT_MAX_CHARS) {
    return {
      allowed: false,
      action: 'REJECT',
      code: RULE_CODES.INPUT_TOO_LONG,
      message: `الرسالة أطول من ${AI_LIMITS.INPUT_MAX_CHARS} حرف`,
      countsAgainstQuota: false,
    };
  }

  return {
    allowed: true,
    action: 'PASS',
    text,
    injectReminder: inj.level === 'SOFT' ? INJECTION.REMINDER : null,
    countsAgainstQuota: true,
  };
};

// ════════════════════════════════════════════════
//  بوابة الخروج
// ════════════════════════════════════════════════

/**
 * قصّ الرد عند حدّ الكلمات — **عند حدود الجمل** لا وسطها.
 *
 * ️ القصّ الخام عند الكلمة رقم 200 ينتج "...وبعد كده هت"
 *    وهو أسوأ من رد طويل. نبحث عن آخر نهاية جملة قبل الحد.
 */
const trimToWords = (text, maxWords) => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return { text, trimmed: false };

  const head = words.slice(0, maxWords).join(' ');

  // آخر علامة نهاية جملة (عربية أو لاتينية)
  const lastStop = Math.max(
    head.lastIndexOf('.'),
    head.lastIndexOf('!'),
    head.lastIndexOf('؟'),
    head.lastIndexOf('?'),
    head.lastIndexOf('\n'),
  );

  // نقبل القطع عند الجملة فقط لو لم نخسر أكثر من 25% من النصّ
  if (lastStop > head.length * 0.75) {
    return { text: head.slice(0, lastStop + 1).trim(), trimmed: true };
  }

  return { text: `${head.trim()}…`, trimmed: true };
};

/**
 * تقليم الإيموجي الزائد — يحذف من الآخر للأول.
 *
 * ️ نبقي الأوائل لأن الإيموجي الافتتاحي يحمل النبرة،
 *    والزائد يتراكم عادةً في نهاية الردود المتحمّسة.
 */
const capEmoji = (text, max) => {
  const found = [...text.matchAll(/\p{Extended_Pictographic}/gu)];
  if (found.length <= max) return { text, capped: false };

  const toRemove = new Set(found.slice(max).map((m) => m.index));
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    if (!toRemove.has(i)) out += text[i];
  }
  return { text: out.replace(/[ \t]{2,}/g, ' ').trim(), capped: true };
};

/**
 * هل ادّعى الرد أنه نفّذ شيئاً؟
 *
 * ️ يُفحص على النصّ **المُطبَّع** لأن الأنماط مكتوبة كذلك.
 *
 * @param {string} text
 * @returns {{ claimed: boolean, phrase?: string }}
 */
export const detectFalseClaim = (text = '') => {
  const norm = normalize(text);
  for (const p of TOOL_RULES.FALSE_CLAIM_PATTERNS) {
    const m = norm.match(p);
    if (m) return { claimed: true, phrase: m[0] };
  }
  return { claimed: false };
};

/**
 * يفحص ويعالج رد النموذج.
 *
 * @param {string}  raw
 * @param {object}  [opts]
 * @param {boolean} [opts.canAct]  هل الأدوات مفعّلة فعلاً؟
 * @returns {{ text, changed, flags: string[], stats: object }}
 */
export const inspectOutput = (raw = '', opts = {}) => {
  let text = String(raw ?? '').trim();
  const flags = [];

  if (!text) {
    return {
      text: 'معلش، مخّي سرح لحظة  ممكن تعيد السؤال؟',
      changed: true,
      flags: ['EMPTY'],
      stats: { words: 0, emoji: 0 },
    };
  }

  // ── ١) تسريب أسرار ──
  for (const leak of PRIVACY.LEAK_PATTERNS) {
    if (leak.test(text)) {
      text = text.replace(leak, '[محذوف]');
      flags.push(RULE_CODES.OUTPUT_LEAK);
    }
  }

  // ── ٢) تسريب التعليمة نفسها ──
  if (/أنت "?المرافق"?\s*—/.test(text) || /قواعد ثابتة:/.test(text)) {
    text = 'أنا المرافق  تعال نركّز على اللي يهمك — إيه اللي واقف قدامك دلوقتي؟';
    flags.push('SYSTEM_ECHO');
    return { text, changed: true, flags, stats: { words: countWords(text), emoji: 1 } };
  }

  /**
   * ── ٣) ادّعاء تنفيذ كاذب ──
   *
   * ️ يُفحص فقط حين تكون الأدوات **مطفأة**.
   *    لو كانت مفعّلة فالادعاء صادق ولا يُلمس.
   *
   *    نستبدل الرد كاملاً: المستخدم الذي يصدّق أن منبهه
   *    اتظبط قد ينام عن شغله. الرد الفارغ أرحم من الكاذب.
   */
  if (!opts.canAct) {
    const claim = detectFalseClaim(text);
    if (claim.claimed) {
      return {
        text: TOOL_RULES.FALSE_CLAIM_REPLY,
        changed: true,
        flags: [...flags, RULE_CODES.FALSE_CLAIM],
        stats: {
          words: countWords(TOOL_RULES.FALSE_CLAIM_REPLY),
          emoji: countEmoji(TOOL_RULES.FALSE_CLAIM_REPLY),
        },
        blockedPhrase: claim.phrase,
      };
    }
  }

  // ── ٤) العبارات الآلية ──
  for (const phrase of TONE_RULES.BANNED_PHRASES) {
    if (text.includes(phrase)) flags.push('BANNED_PHRASE');
  }

  // ── ٥) سقف الكلمات ──
  const words = countWords(text);
  if (words > AI_LIMITS.REPLY_HARD_MAX_WORDS) {
    const r = trimToWords(text, AI_LIMITS.REPLY_HARD_MAX_WORDS);
    text = r.text;
    if (r.trimmed) flags.push(RULE_CODES.OUTPUT_TRIMMED);
  }

  // ── ٦) سقف الإيموجي ──
  const emoji = countEmoji(text);
  if (emoji > AI_LIMITS.EMOJI_HARD_MAX) {
    const r = capEmoji(text, AI_LIMITS.EMOJI_HARD_MAX);
    text = r.text;
    if (r.capped) flags.push('EMOJI_CAPPED');
  }

  return {
    text,
    changed: flags.length > 0,
    flags,
    stats: { words: countWords(text), emoji: countEmoji(text) },
  };
};

export default {
  normalize,
  countWords,
  countEmoji,
  detectCrisis,
  detectInjection,
  detectFalseClaim,
  inspectInput,
  inspectOutput,
};
