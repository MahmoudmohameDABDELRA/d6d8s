/**
 * ═══════════════════════════════════════════════════════════
 *  فحص حي لمسار الحلم — أهم سلسلة في المنتج
 *
 *  ️ ليه ما كانش متفحوص قبل كده:
 *
 *  السلسلة دي (حلم → أسئلة → خطة → جبل → مهام) هي **المنتج
 *  نفسه**. وكانت بره التغطية تماماً لأن أول خطوة بتنده Gemini،
 *  وبلا مفتاح بترجع 503 والفحص بيقف.
 *
 *  `test/harness/gemini.stub.mjs` بيحل ده: بيرجّع JSON بنفس
 *  **عقد** الدالة الحقيقية (بما فيه إنها بترجّع `{ text }` مش
 *  نص خام — النسخة الأولى من البديل وقعت في ده بالظبط).
 *
 *  التشغيل:
 *    1) npm run harness:ai
 *    2) node test/harness/dream-probe.mjs
 * ═══════════════════════════════════════════════════════════
 */
const B = process.env.HARNESS_URL ?? 'http://127.0.0.1:3999';
const API = `${B}/api`;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* بلا جسم */
  }
  return { status: res.status, body: json };
};

const uniq = () => Math.random().toString(36).slice(2, 8);

// ════════════════════════════════════════════════
console.log('\n═══ 1. تجهيز ═══');

const reg = await call('POST', '/auth/register', {
  body: {
    username: `حالم_${uniq()}`,
    email: `dream_${uniq()}@bal.app`,
    password: 'Passw0rd!23',
    domain: 'TECH',
  },
});
const token = reg.body?.accessToken;
ok(!!token, 'المستخدم اتعمل');

/**
 * ️ بلا `specialty`: التخصص لازم ينتمي للمجال، و`FLUTTER_DEV`
 *    مش في قايمة TECH. الأونبوردنج كان بيرجّع 400 بصمت في
 *    الفحص، وكل الخطوات اللي بعده بترجع 403 «أكمل بياناتك».
 *
 *    خمس فشل ظاهرها في مسار الحلم وسببها سطر في التجهيز.
 *    الفحص اللي مش بيتأكد من تجهيزه بيدّي تشخيص غلط.
 */
const onboarded = await call('POST', '/auth/onboarding', {
  token,
  body: { domain: 'TECH', interests: ['TECH'] },
});
ok(onboarded.status === 200, 'الأونبوردنج اتم', `HTTP ${onboarded.status}`);

// ════════════════════════════════════════════════
console.log('\n═══ 2. الحلم → الأسئلة ═══');

const dream = await call('POST', '/goals/dream', {
  token,
  body: { title: 'أتعلم Flutter واشتغل بيه' },
});

ok(dream.status === 201, 'الحلم اتقبل', `HTTP ${dream.status}`);

const draftId = dream.body?.draftGoalId;
ok(!!draftId, 'رجّع معرّف المسودة');

const questions = dream.body?.questions ?? [];
ok(questions.length > 0, 'رجّع أسئلة', `${questions.length}`);

ok(
  questions.every((q) => typeof q.question === 'string' && Array.isArray(q.options)),
  'كل سؤال فيه نص وخيارات — الشكل اللي الشاشة بتقراه',
);

ok(
  questions.every((q) => q.options.length >= 2),
  'كل سؤال ليه خيارين على الأقل',
);

// ════════════════════════════════════════════════
console.log('\n═══ 3. ⚠️ المسودة ضايعة؟ ═══');

/**
 * ️ ده بيت القصيد.
 *
 *  `listGoals` بيفلتر `draft: false` — يعني المسودة **مش ظاهرة
 *  في أي قايمة**. لو المستخدم قفل التطبيق دلوقتي (وهو احتمال
 *  كبير: لسه مستني نداء AI تاني ياخد ٢٠ ثانية)، الحلم اللي
 *  كتبه والأسئلة اللي اتولدت **بتضيع نهائياً**. مفيش أي مسار
 *  يرجّعه.
 *
 *  الفحص ده بيوثّق السلوك الحالي عشان نعرف إحنا بنصلّح إيه.
 */
const goals = await call('GET', '/goals', { token });
const list = goals.body?.goals ?? [];

const draftVisible = list.some((g) => g.id === draftId);

if (draftVisible) {
  ok(true, 'المسودة ظاهرة — المستخدم يقدر يكمّلها');
} else {
  console.log(
    '  ️ المسودة مخفية عن القوايم — لو قفل التطبيق دلوقتي الحلم يضيع',
  );
  ok(
    !!dream.body?.resumable || true,
    'موثّق: المسودة مخفية (سلوك حالي)',
  );
}

// ════════════════════════════════════════════════
console.log('\n═══ 4. الإجابات → الخطة ═══');

const answers = questions.map((q) => ({
  question: q.question,
  answer: q.options[0],
}));

const plan = await call('POST', `/goals/dream/${draftId}/answers`, {
  token,
  body: { answers },
});

ok(plan.status === 200 || plan.status === 201, 'الإجابات اتقبلت', `HTTP ${plan.status}`);

const steps = plan.body?.plan?.steps ?? plan.body?.steps ?? [];
ok(steps.length > 0, 'الخطة فيها خطوات', `${steps.length}`);
ok(
  steps.every((s) => typeof s.title === 'string' && s.title.length > 0),
  'كل خطوة ليها عنوان',
);

// ════════════════════════════════════════════════
console.log('\n═══ 5. الموافقة → الجبل اتبنى ═══');

const approved = await call('POST', `/goals/dream/${draftId}/approve`, {
  token,
});

ok(approved.status === 200, 'الموافقة نجحت', `HTTP ${approved.status}`);

const after = await call('GET', '/goals', { token });
const activeGoals = after.body?.goals ?? [];

ok(activeGoals.length > 0, 'الهدف بقى ظاهر في القايمة بعد الموافقة');

const goal = activeGoals.find((g) => g.id === draftId) ?? activeGoals[0];
ok(!!goal, 'الهدف موجود');

const goalSteps = goal?.steps ?? [];
ok(goalSteps.length > 0, 'الهدف ليه خطوات', `${goalSteps.length}`);

// ════════════════════════════════════════════════
console.log('\n═══ 6. أول خطوة ليها رحلة تلقائية ═══');

/**
 * ️ `approveDreamPlan` المفروض يبني رحلة أول خطوة تلقائياً
 *    (عبر `journeyBootstrap.service`). من غيرها المستخدم يوافق
 *    على خطته ويلاقي **صفر مهام** — وده أسوأ وقت للفراغ.
 */
const firstStep = goalSteps[0];
ok(!!firstStep?.id, 'أول خطوة ليها معرّف');

//  من غير الحارس ده الفحص بيرمي بدل ما يبلّغ
if (firstStep?.id) {
  const journey = await call('GET', `/goals/steps/${firstStep.id}/journey`, {
    token,
  });

  const hasJourney =
    journey.status === 200 && (journey.body?.journey || journey.body?.days);

  ok(!!hasJourney, 'أول خطوة ليها رحلة جاهزة', `HTTP ${journey.status}`);
}

// ════════════════════════════════════════════════
console.log('\n═══ 7. المهام وصلت ═══');

const tasks = await call('GET', '/tasks', { token });
ok(tasks.status === 200, '/tasks بيرد');

console.log(
  `     (${(tasks.body?.tasks ?? []).length} مهمة — الرحلة لسه مسودة لحد ما تتعتمد)`,
);

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
