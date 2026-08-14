/**
 * ═══════════════════════════════════════════════════════════
 *  مخطط رحلات الجبل — Journey Planner Service
 *
 *  يحوّل هدفاً واحداً (GoalStep) إلى رحلة زمنية:
 *  { days: [{ day, title, description }] }
 *
 *  ⚠️ لا بيانات وهمية أبداً: كل ناتج من الـ AI الفعلي.
 *     لو الـ AI غير متاح → خطأ صريح (GEMINI_NOT_CONFIGURED / GEMINI_QUOTA)
 *     والفرونت يعرض رسالة واضحة — لا اختراع.
 *
 *  يُستدعى مرة واحدة فقط لكل هدف (عند إنشاء رحلته) —
 *  وبعدها الباك يدير كل شيء (Scheduler → Tasks → Progress) بلا AI.
 * ═══════════════════════════════════════════════════════════
 */
import { generate, isConfigured } from './gemini.service.js';

/** استخراج JSON من نص الـ AI — يتحمل علامات ```json ... ``` */
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI_INVALID_JSON');
  return JSON.parse(raw.slice(start, end + 1));
};

const JOURNEY_SYSTEM = `أنت «مخطط الرحلات» في تطبيق بال — رفيق يبني خططاً واقعية.
المستخدم وصل لهدف واحد داخل رحلته نحو حلمه الكبير. مهمتك: ابنِ له رحلة زمنية (أيام) لتحقيق هذا الهدف فقط.
قواعد صارمة:
- حدد المدة بنفسك حسب حجم الهدف: هدف صغير (3-7 أيام) · متوسط (7-14 يوماً) · كبير (14-30 يوماً) — لا تبالغ ولا تقلّل.
- كل يوم: عنوان واضح + وصف مختصر (سطر أو سطران) بما سيُنجز فيه.
- الأيام تتصاعد منطقياً: الأساسيات أولاً ثم التطبيق العملي، وآخر يوم = إنجاز ملموس (مشروع صغير/تطبيق/إتقان مهارة).
- واقعي وقابل للتنفيذ خلال ساعة إلى ساعتين يومياً.
- أخرج JSON فقط بهذا الشكل بالضبط:
{"days":[{"day":1,"title":"...","description":"..."}]}`;

/** هل الـ AI متاح أصلاً؟ */
export const isJourneyPlannerReady = () => isConfigured();

/**
 * توليد رحلة هدف واحد
 * @returns {Promise<{days: {day:number, title:string, description:string}[]}>}
 */
export const generateJourney = async ({ username, dreamTitle, goalTitle, companionName }) => {
  const name = companionName || 'رفيقك';
  const system = `${JOURNEY_SYSTEM}\nأنت تُدعى «${name}» وتخاطب «${username || 'صديقي'}».`;
  const prompt = JSON.stringify({
    dream: dreamTitle,
    goal: goalTitle,
    instructions: 'ابنِ الرحلة الزمنية الكاملة لهذا الهدف — أيام متسلسلة تبدأ من اليوم 1.',
  });

  const res = await generate(system, [], prompt, { maxTokens: 2048, temperature: 0.7 });
  const data = extractJson(res.text ?? '');
  if (!Array.isArray(data.days) || data.days.length === 0) {
    throw new Error('AI_INVALID_RESPONSE');
  }

  /**
   * تطبيع صارم: أيام متسلسلة تبدأ من 1، عناوين نصية.
   *
   * ⚠️ الترتيب قبل إعادة الترقيم **ضروري**، مش تجميل.
   *
   *    النماذج بترجع الأيام مش مرتبة أحياناً (خصوصاً مع الردود
   *    الطويلة). النسخة القديمة كانت بتعيد الترقيم بالـ index
   *    على طول، فلو Gemini رجّع [day3, day1, day2] كان بيتخزن
   *    day3 كأنه اليوم الأول — يعني المستخدم يبدأ رحلته
   *    بالميزانية العمومية قبل المقدمة.
   *
   *    بنرتّب بالـ day اللي النموذج حدده، وبعدين نعيد الترقيم
   *    عشان نسدّ أي فجوات (1,2,5 → 1,2,3).
   */
  const days = data.days
    .map((d, i) => ({
      day: Number(d.day) || i + 1,
      title: String(d.title ?? '').trim(),
      description: d.description ? String(d.description).trim() : null,
    }))
    .filter((d) => d.title.length > 0)
    .sort((a, b) => a.day - b.day)
    .map((d, i) => ({ ...d, day: i + 1 }));

  if (days.length === 0) throw new Error('AI_INVALID_RESPONSE');
  return { days };
};

export default {
  isJourneyPlannerReady,
  generateJourney,
};
