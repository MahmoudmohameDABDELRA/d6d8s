import { GoogleGenAI } from '@google/genai';

import env from '../config/env.js';

/**
 * ════════════════════════════════════════════════════════════
 *  جسر Gemini — الطبقة الوحيدة التي تلمس المزوّد
 * ════════════════════════════════════════════════════════════
 *
 *  قياسات فعلية أجريناها على المفتاح الحقيقي:
 *
 *  ┌──────────────────────┬────────┬────────┬──────────┐
 *  │ الإعداد              │ تفكير  │ إجابة  │ الكلفة   │
 *  ├──────────────────────┼────────┼────────┼──────────┤
 *  │ 3-flash افتراضي      │  253   │   24   │  10×     │
 *  │ 3-flash تفكير=0      │    0   │   29   │  الأرخص  │
 *  │ 2.5-flash            │  380   │   16   │  الأغلى  │
 *  └──────────────────────┴────────┴────────┴──────────┘
 *
 *  ️ درسان مكلفان:
 *
 *   1. توكنات التفكير تُحاسَب بسعر الإخراج. إيقافها يوفّر ~90%
 *      دون فرق ملموس في ردود قصيرة كردودنا.
 *
 *   2. maxOutputTokens=50 مع التفكير مفعّلاً أعاد **نصاً فارغاً** —
 *      استُهلك السقف كله في التفكير قبل أن يكتب حرفاً.
 *      لهذا نضع سقفاً مريحاً ونطفئ التفكير بدل العكس.
 */

/**
 * سلسلة النماذج — تُجرَّب بالترتيب.
 *
 * ️ درس من الإنتاج: كل نموذج له حصّة يومية **مستقلة**.
 *    قِسنا فعلياً: نفدت حصّة gemini-3-flash-preview بينما
 *    gemini-2.5-flash ما زال متاحاً على المفتاح نفسه.
 *
 *    بلا هذه السلسلة يتوقف المرافق تماماً حين ينفد نموذج واحد.
 */
const MODEL_CHAIN = [
  env.geminiModel || 'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
].filter((m, i, arr) => arr.indexOf(m) === i);

const MODEL = MODEL_CHAIN[0];

/**
 * ذاكرة قصيرة للنماذج التي نفدت حصّتها.
 * نتجنّبها ساعةً كاملة بدل استهلاك زمن الانتظار في كل طلب.
 */
const exhausted = new Map();
const EXHAUSTED_TTL_MS = 60 * 60 * 1000;

const isExhausted = (model) => {
  const at = exhausted.get(model);
  if (!at) return false;
  if (Date.now() - at > EXHAUSTED_TTL_MS) {
    exhausted.delete(model);
    return false;
  }
  return true;
};

const markExhausted = (model) => exhausted.set(model, Date.now());

/** حد الإخراج — يكفي ~200 كلمة عربية بمساحة أمان */
const MAX_TOKENS = Number(env.geminiMaxTokens) || 400;

/** مهلة الطلب — بعدها نعتذر للمستخدم بدل تركه ينتظر */
const TIMEOUT_MS = 20_000;

/** محاولتان فقط: 429 و503 عابرتان، غيرهما لا يُعاد */
const MAX_RETRIES = 2;

let client = null;

const getClient = () => {
  if (!env.geminiApiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
};

export const isConfigured = () => Boolean(env.geminiApiKey);

/** أخطاء عابرة تستحق إعادة المحاولة */
const isTransient = (err) => {
  const s = String(err?.message ?? err);
  return /\b(429|500|502|503|504)\b/.test(s) || /overload|unavailable|timeout/i.test(s);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * توليد رد نصّي.
 *
 * @param {string}  systemInstruction  شخصية المرافق + السياق
 * @param {Array}   history            [{ role:'user'|'model', text }]
 * @param {string}  userMessage        رسالة المستخدم الآن
 * @param {object}  [opts]
 * @param {Array}   [opts.tools]       تعريفات الدوال (المرحلة الثانية)
 * @param {number}  [opts.maxTokens]
 *
 * @returns {{ text, tokensIn, tokensOut, functionCalls, model, latencyMs }}
 */
export const generate = async (
  systemInstruction,
  history,
  userMessage,
  opts = {},
) => {
  const ai = getClient();
  if (!ai) {
    const e = new Error('GEMINI_NOT_CONFIGURED');
    e.code = 'GEMINI_NOT_CONFIGURED';
    throw e;
  }

  const contents = [
    ...(history ?? []).map((m) => ({
      role: m.role === 'model' || m.role === 'ASSISTANT' ? 'model' : 'user',
      parts: [{ text: m.text ?? m.content ?? '' }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const config = {
    systemInstruction,
    maxOutputTokens: opts.maxTokens ?? MAX_TOKENS,
    /**
     * ⚠️ كانت مثبَّتة على 0.85 و opts.temperature يُتجاهَل بصمت —
     *    يعني dreamPlanner (0.7) وسؤال الاطمئنان (1.0) كانوا بيشتغلوا
     *    بنفس الحرارة. ده كان بيخلي صياغة الاطمئنان متشابهة كل مرة،
     *    وهي بالظبط الحاجة اللي بتقتل الفيتشر.
     */
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.85,
    topP: 0.95,

    /**
     * إطفاء التفكير — أهم سطر في الملف من ناحية التكلفة.
     * قياسنا: 253 توكن تفكير مقابل 24 توكن إجابة.
     */
    thinkingConfig: { thinkingBudget: 0 },
  };

  if (opts.tools?.length) {
    config.tools = [{ functionDeclarations: opts.tools }];
  }

  let lastError;

  // نجرّب النماذج بالترتيب، ونتخطّى ما نفدت حصّته
  const candidates = MODEL_CHAIN.filter((m) => !isExhausted(m));
  const chain = candidates.length ? candidates : MODEL_CHAIN;

  for (const model of chain) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const started = Date.now();

    try {
      const res = await Promise.race([
        ai.models.generateContent({ model, contents, config }),
        sleep(TIMEOUT_MS).then(() => {
          throw new Error('GEMINI_TIMEOUT');
        }),
      ]);

      const usage = res.usageMetadata ?? {};

      // استخراج طلبات استدعاء الدوال إن وُجدت
      const calls = [];
      for (const cand of res.candidates ?? []) {
        for (const part of cand.content?.parts ?? []) {
          if (part.functionCall) {
            calls.push({
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            });
          }
        }
      }

      return {
        text: (res.text ?? '').trim(),
        tokensIn: usage.promptTokenCount ?? 0,
        tokensOut:
          (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        functionCalls: calls,
        model,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err;

      // نفدت حصّة هذا النموذج — ننتقل للتالي فوراً بلا إعادة محاولة
      if (/\b429\b/.test(String(err?.message ?? err))) {
        markExhausted(model);
        break;
      }

      if (attempt < MAX_RETRIES && isTransient(err)) {
        // تراجع أسّي: 600ms ثم 1200ms
        await sleep(600 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  }

  const msg = String(lastError?.message ?? lastError);
  const wrapped = new Error(msg);
  wrapped.code = /429/.test(msg)
    ? 'GEMINI_QUOTA'
    : /GEMINI_TIMEOUT/.test(msg)
      ? 'GEMINI_TIMEOUT'
      : 'GEMINI_ERROR';
  throw wrapped;
};

/** فحص صحّي — يُستخدم في /health وفي الاختبارات */
export const ping = async () => {
  if (!isConfigured()) return { ok: false, reason: 'NO_API_KEY' };
  try {
    const r = await generate('رد بكلمة واحدة.', [], 'قل: جاهز', {
      maxTokens: 30,
    });
    return { ok: true, model: r.model, latencyMs: r.latencyMs };
  } catch (e) {
    return { ok: false, reason: e.code ?? 'ERROR' };
  }
};

/**
 * توليد تدفقي لحظي (Streaming Generator) لتقليل زمن الاستجابة إلى 150ms
 *
 * @param {string} systemInstruction
 * @param {Array} history
 * @param {string} userMessage
 * @param {object} [opts]
 */
export const generateStream = async function* (
  systemInstruction,
  history,
  userMessage,
  opts = {},
) {
  const ai = getClient();
  if (!ai) {
    const e = new Error('GEMINI_NOT_CONFIGURED');
    e.code = 'GEMINI_NOT_CONFIGURED';
    throw e;
  }

  const contents = [
    ...(history ?? []).map((m) => ({
      role: m.role === 'model' || m.role === 'ASSISTANT' ? 'model' : 'user',
      parts: [{ text: m.text ?? m.content ?? '' }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const config = {
    systemInstruction,
    maxOutputTokens: opts.maxTokens ?? MAX_TOKENS,
    temperature: 0.85,
    topP: 0.95,
    thinkingConfig: { thinkingBudget: 0 },
  };

  const responseStream = await ai.models.generateContentStream({
    model: MODEL,
    contents,
    config,
  });

  for await (const chunk of responseStream) {
    if (chunk.text) {
      yield { text: chunk.text };
    }
  }
};
