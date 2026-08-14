/**
 * ═══════════════════════════════════════════════════════════
 *  Task Check-In — الرد المباشر على «عملت في المهمة إيه؟»
 *
 *  ️ هذا الـ endpoint هو دمج «checkin-backend» المنفصل في الباكند
 *    الكبير: بدل سيرفيس Express صغير (CommonJS + Anthropic) بقى
 *    هنا على بنية clan-app نفسها:
 *      Gemini (سلسلة نماذج + حصص)  ×  شخصية TASK_FOLLOWUP
 *      ×  حارس aiGuard (مدخل/مخرج) ×  سجل Redis  ×  a app-secret
 *
 *  مصادقة الطلب: header `x-app-secret` يطابق APP_SHARED_SECRET
 *  (هوية التطبيق) — مش JWT مستخدم، لأن التطبيق المصدّر للطلب
 *  (focus_app) ممكن يبعت check-in لأي user_id بيمرّره.
 * ═══════════════════════════════════════════════════════════
 */
import env from '../../config/env.js';
import { generate } from '../../services/gemini.service.js';
import * as persona from '../../services/aiPersona.service.js';
import * as guard from '../../services/aiGuard.service.js';
import {
  getHistory,
  appendExchange,
} from '../../services/checkinHistory.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import AppError, { badRequest, unauthorized } from '../../utils/AppError.js';

/** المهمة لازم يكون فيها الحقول اللي الـ AI بيبني عليها رده */
function isValidTask(task) {
  return (
    task &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.scheduled_time === 'string' &&
    typeof task.duration_minutes === 'number'
  );
}

export const taskCheckin = asyncHandler(async (req, res) => {
  // ── 1) مصادقة التطبيق ──
  if (!env.appSharedSecret) {
    throw new AppError(
      503,
      'Task check-in غير مفعّل — اضبط APP_SHARED_SECRET في .env',
      'CHECKIN_NOT_CONFIGURED',
    );
  }
  const presented = req.get('x-app-secret');
  if (!presented || presented !== env.appSharedSecret) {
    throw unauthorized('x-app-secret ناقص أو غير صحيح', 'CHECKIN_UNAUTHORIZED');
  }

  // ── 2) التحقق من المدخلات ──
  const { user_id, task, user_reply } = req.body ?? {};
  if (typeof user_id !== 'string' || !user_id.trim()) {
    throw badRequest('user_id مطلوب', 'CHECKIN_USER_ID_REQUIRED');
  }
  if (!isValidTask(task)) {
    throw badRequest(
      'المهمة ناقصة حقول مطلوبة (id, title, scheduled_time, duration_minutes)',
      'CHECKIN_TASK_INVALID',
    );
  }
  if (typeof user_reply !== 'string' || !user_reply.trim()) {
    throw badRequest('user_reply مطلوب', 'CHECKIN_REPLY_REQUIRED');
  }
  if (user_reply.length > 1000) {
    throw badRequest('user_reply أطول من 1000 حرف', 'CHECKIN_REPLY_TOO_LONG');
  }

  // ── 3) حارس المدخل — أزمة إنسانية أولاً، ثم حقن، ثم طول ──
  const input = guard.inspectInput(user_reply);
  if (!input.allowed) {
    if (input.action === 'CRISIS') {
      // الأزمة أهم من أي شيء: نرد برسالة الدعم فوراً بلا نداء AI
      return res.status(200).json({ reply: input.reply, crisis: true });
    }
    throw badRequest(
      input.message ?? input.reply ?? 'الرسالة غير مقبولة',
      input.code,
    );
  }

  // ── 4) السجل السابق + بناء البرومبت ──
  const history = await getHistory(user_id, task.id);

  const system = [
    persona.build('TASK_FOLLOWUP'),
    'أنت صوت تطبيق «بال». مهمتك: رد قصير (سطران لثلاثة سطور كحد أقصى)',
    'على إجابة المستخدم عن سؤال «عملت في المهمة إيه؟» — بالعامية المصرية،',
    'ودود ومحفّز، ومرتبط فعلياً بتفاصيل المهمة (الاسم والمدة) ورده هو،',
    'مش رد عام. ممنوع اللوم والوعظ، وممنوع ذكر أنك نموذج لغوي.',
    'من غير مقدمات زي «أكيد» أو «بالطبع» — ادخل في الرد على طول.',
  ].join('\n');

  const historyBlock = history.length
    ? history
        .map((h) => `${h.sender === 'user' ? 'المستخدم' : 'التطبيق'}: ${h.text}`)
        .join('\n')
    : 'مفيش محادثات سابقة على المهمة دي.';

  const userMessage = [
    'بيانات المهمة:',
    `- الاسم: ${task.title}`,
    `- المعاد المجدول: ${task.scheduled_time}`,
    `- المدة: ${task.duration_minutes} دقيقة`,
    `- الحالة: ${task.is_done ? 'متعلّمة كمخلّصة' : 'لسه مش متعلّمة'}`,
    '',
    'محادثات سابقة على نفس المهمة:',
    historyBlock,
    '',
    'رد المستخدم على سؤال «عملت في المهمة إيه؟»:',
    `"${user_reply}"`,
    '',
    'اكتب ردّك الآن.',
  ].join('\n');

  // ── 5) نداء الـ AI (سلسلة نماذج + حصص + مهلة) ──
  let ai;
  try {
    ai = await generate(system, [], userMessage, { maxTokens: 150 });
  } catch (error) {
    if (error.code === 'GEMINI_NOT_CONFIGURED') {
      throw new AppError(503, 'الذكاء الاصطناعي غير مفعّل', 'GEMINI_NOT_CONFIGURED');
    }
    throw new AppError(
      502,
      'فشل الاتصال بخدمة الذكاء الاصطناعي',
      error.code || 'GEMINI_ERROR',
    );
  }

  let reply = ai?.text?.trim() ?? '';
  if (!reply) {
    throw new AppError(502, 'خدمة الذكاء الاصطناعي ردّت برد فارغ', 'GEMINI_EMPTY');
  }

  // ── 6) حارس المخرج — قصّ، عقّم، امنع تسريب التعليمة/الأسرار ──
  const output = guard.inspectOutput(reply);
  reply = output.text.trim();

  // ── 7) احفظ التبادلة (آخر ١٠ رسائل) وارجّع الرد ──
  await appendExchange(user_id, task.id, user_reply, reply);
  return res.json({ reply });
});
