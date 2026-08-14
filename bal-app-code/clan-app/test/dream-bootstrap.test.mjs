/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار سد الفجوات التلاتة في مسار الحلم
 *
 *  1. بيانات الأونبوردنج بتوصل للـ AI (كانت متخزنة ومهدرة)
 *  2. الإقلاع التلقائي لأول مرحلة بعد الموافقة على الجبل
 *  3. فشل الـ AI في الإقلاع ما يفشّلش الموافقة (Fail-Safe)
 *
 *  التشغيل:
 *    node --import ./test/dream-bootstrap.setup.mjs --test test/dream-bootstrap.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-1234';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-56';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';

import { state } from './dream-bootstrap.mocks.mjs';

const dream = await import('../src/services/dreamPlanner.service.js');
const { bootstrapStepJourney } = await import(
  '../src/services/journeyBootstrap.service.js'
);

const PROFILE = {
  interests: ['BUSINESS', 'TECH'],
  specialty: 'MANAGER',
  timezone: 'Africa/Cairo',
};

// ════════════════════════════════════════════════
//  فجوة 1: بيانات الأونبوردنج
// ════════════════════════════════════════════════

test('بيانات الأونبوردنج بتوصل للـ AI بالعربي', async () => {
  state.reset();
  state.geminiText = JSON.stringify({
    questions: [{ question: 'س', options: ['أ', 'ب', 'ج'] }],
  });

  await dream.generateQuizQuestions({
    username: 'محمود',
    dreamTitle: 'نفسي أكون CEO',
    companionName: 'بال',
    profile: PROFILE,
  });

  const { system } = state.lastCall;

  // الكودات الإنجليزية اتترجمت — 'MANAGER' مالهاش معنى في جملة عربية
  assert.match(system, /بزنس/, 'المجال لازم يوصل بالعربي');
  assert.match(system, /تقنية/, 'المجال التاني كمان');
  assert.match(system, /مدير/, 'التخصص لازم يوصل بالعربي');
  assert.doesNotMatch(system, /MANAGER/, 'ممنوع الكود الخام يتسرب للبرومبت');
  assert.doesNotMatch(system, /BUSINESS/, 'ممنوع الكود الخام يتسرب للبرومبت');

  // المنع الصريح — من غيره النموذج بيسأل عن حاجة عارفها
  assert.match(
    system,
    /لا تسأله عنه تاني/,
    'لازم نمنعه صراحةً يسأل عن بيانات عارفها',
  );
});

test('مستخدم بلا بيانات → مفيش قسم فاضي في البرومبت', async () => {
  state.reset();
  state.geminiText = JSON.stringify({
    steps: [{ title: 'أ', description: 'ب' }, { title: 'ج', description: 'د' }],
  });

  await dream.generatePlan({
    username: 'محمود',
    dreamTitle: 'حلم',
    answers: [],
    profile: {},
  });

  assert.doesNotMatch(
    state.lastCall.system,
    /ما تعرفه عنه/,
    'ما نحقنش قسم فاضي لما مفيش بيانات',
  );
});

test('بيانات جزئية → السطر بيتبني من الموجود بس', async () => {
  state.reset();
  state.geminiText = JSON.stringify({
    steps: [{ title: 'أ', description: 'ب' }, { title: 'ج', description: 'د' }],
  });

  await dream.generatePlan({
    username: 'م',
    dreamTitle: 'حلم',
    answers: [],
    profile: { interests: ['HEALTH'] }, // مفيش تخصص ولا timezone
  });

  const { system } = state.lastCall;
  assert.match(system, /صحة/);
  assert.doesNotMatch(system, /وضعه الحالي/, 'ما نذكرش حقل مش موجود');
});

// ════════════════════════════════════════════════
//  فجوة 2: الإقلاع التلقائي
// ════════════════════════════════════════════════

test('autoApprove=true → رحلة ACTIVE بتواريخ ومهمة اليوم', async () => {
  state.reset();
  state.geminiText = JSON.stringify({
    days: [
      { day: 1, title: 'اليوم الأول', description: 'مقدمة' },
      { day: 2, title: 'اليوم التاني', description: 'تطبيق' },
      { day: 3, title: 'اليوم التالت', description: 'إنجاز' },
    ],
  });

  const out = await bootstrapStepJourney({
    stepId: 'step-1',
    userId: 'user-1',
    autoApprove: true,
  });

  assert.equal(out.journey.status, 'ACTIVE', 'لازم تتفعّل فوراً');
  assert.ok(out.journey.approvedAt, 'لازم يتسجل وقت الموافقة');
  assert.equal(out.days.length, 3);

  // ️ من غير التواريخ الـ scheduler مش هيعرف يقرر إمتى يولّد المهمة
  assert.ok(
    out.days.every((d) => d.scheduledDate),
    'كل يوم لازم يكون ليه تاريخ',
  );

  // اليوم 1 = النهاردة، واللي بعده بيوم
  const d1 = new Date(out.days[0].scheduledDate);
  const d2 = new Date(out.days[1].scheduledDate);
  assert.equal(d2 - d1, 86_400_000, 'الأيام لازم تكون متتالية');

  assert.equal(out.generatedTasks, 1, 'مهمة اليوم الأول لازم تتولّد');
});

test('autoApprove=false → DRAFT بلا تواريخ ولا مهام', async () => {
  state.reset();
  state.geminiText = JSON.stringify({
    days: [{ day: 1, title: 'أ' }, { day: 2, title: 'ب' }],
  });

  const out = await bootstrapStepJourney({
    stepId: 'step-1',
    userId: 'user-1',
    autoApprove: false,
  });

  assert.equal(out.journey.status, 'DRAFT', 'لازم تستنى مراجعة المستخدم');
  assert.equal(out.generatedTasks, 0, 'ما نولّدش مهام قبل الموافقة');
  assert.ok(
    out.days.every((d) => !d.scheduledDate),
    'التواريخ بتتوزّع عند الموافقة مش قبلها',
  );
});

test('رحلة موجودة بالفعل → JOURNEY_EXISTS مش تكرار', async () => {
  state.reset();
  await assert.rejects(
    () => bootstrapStepJourney({ stepId: 'step-with-journey', userId: 'user-1' }),
    (e) => e.code === 'JOURNEY_EXISTS',
  );
});

test('مرحلة مش بتاعتي → STEP_NOT_FOUND', async () => {
  state.reset();
  await assert.rejects(
    () => bootstrapStepJourney({ stepId: 'step-1', userId: 'other-user' }),
    (e) => e.code === 'STEP_NOT_FOUND',
  );
});

// ════════════════════════════════════════════════
//  فجوة 3: Fail-Safe
// ════════════════════════════════════════════════

test('الـ AI واقع → الخطأ بيطلع نضيف بلا رحلة نص-مخلوقة', async () => {
  state.reset();
  state.geminiError = Object.assign(new Error('quota'), { code: 'GEMINI_QUOTA' });

  await assert.rejects(
    () => bootstrapStepJourney({ stepId: 'step-1', userId: 'user-1', autoApprove: true }),
    (e) => e.code === 'GEMINI_QUOTA',
  );

  // ️ الأهم: ما اتخلقش Journey فاضي في القاعدة
  assert.equal(
    state.createdJourneys.length,
    0,
    'ممنوع نسيب رحلة نص-مخلوقة لما الـ AI يقع',
  );
});

test('رد AI مكسور → AI_INVALID_JSON بلا تخزين', async () => {
  state.reset();
  state.geminiText = 'معلش مش فاهم قصدك';

  await assert.rejects(
    () => bootstrapStepJourney({ stepId: 'step-1', userId: 'user-1', autoApprove: true }),
    (e) => /AI_INVALID/.test(e.message),
  );
  assert.equal(state.createdJourneys.length, 0);
});
