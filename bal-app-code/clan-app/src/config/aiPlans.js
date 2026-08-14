/**
 * ════════════════════════════════════════════════════════════
 *  باقات المرافق — الوصول أسرع كلما دفعت أكثر
 * ════════════════════════════════════════════════════════════
 *
 *  المنتج المُباع هنا ليس "عدد رسائل" بل **سرعة الحضور**:
 *
 *    HIGH  → يسألك بعد 30 دقيقة من الحدث  (طرف في يومك)
 *    PRO   → بعد ساعة
 *    BASIC → بعد ساعتين
 *    FREE  → بعد 5 ساعات                  (متأخر عمداً)
 *
 *  ️ التأخير مقصود لا عيب. مرافق يسألك بعد 5 ساعات من درس
 *     الكيمياء يكون قد فات أوانه — وهذا بالضبط ما يجعل الترقية
 *     مغرية. الفارق محسوس لا رقم على صفحة تسعير.
 *
 *  ️ قرار المستخدم: النبضات تُحتسب من الحصّة اليومية نفسها.
 *     السبب أن النبضة نداء نموذج حقيقي يُدفع ثمنه، ولو جعلناها
 *     مجانية لصار الـ FREE يستهلك 4.8 نداء يومياً بلا مقابل.
 */

/**
 * @typedef {'FREE'|'BASIC'|'PRO'|'HIGH'} PlanKey
 */

export const PLANS = {
  FREE: {
    key: 'FREE',
    nameAr: 'المجانية',
    /** رسائل يومياً — تشمل النبضات التلقائية */
    dailyMessages: 3,
    /** كم دقيقة بعد الحدث حتى يسأل عنه */
    pulseDelayMin: 5 * 60,
    /**
     * أقصى إشعارات في اليوم.
     *
     * ️ منفصل عن dailyMessages تماماً: الإشعار قالب برمجي
     *    بصفر توكن، فسقفه ضد **الإزعاج** لا ضد التكلفة.
     *    الحصّة تُستهلك فقط حين يضغط "رد".
     */
    maxPulsesPerDay: 3,
    /** سقف التوكنات اليومي — الحارس الحقيقي ضد الاستنزاف */
    dailyTokens: 5000,
    priceEgp: 0,
  },

  BASIC: {
    key: 'BASIC',
    nameAr: 'العادية',
    dailyMessages: 20,
    pulseDelayMin: 2 * 60,
    maxPulsesPerDay: 8,
    dailyTokens: 30000,
    priceEgp: null, // لم يُحدَّد بعد
  },

  PRO: {
    key: 'PRO',
    nameAr: 'برو',
    dailyMessages: 50,
    pulseDelayMin: 60,
    maxPulsesPerDay: 15,
    dailyTokens: 80000,
    priceEgp: null,
  },

  HIGH: {
    key: 'HIGH',
    nameAr: 'هاي',
    /**
     * ️ "مفتوحة" لا تعني بلا سقف في الكود.
     *    مستخدم واحد بسكربت يستطيع استنزاف المفتاح كله.
     *    نضع سقفاً عالياً جداً يمرّ منه أي بشر ويقف أمام الآلة.
     */
    dailyMessages: 500,
    pulseDelayMin: 30,
    maxPulsesPerDay: 40,
    dailyTokens: 400000,
    priceEgp: null,
  },
};

/** الترتيب من الأدنى للأعلى — للمقارنة والترقية */
export const PLAN_ORDER = ['FREE', 'BASIC', 'PRO', 'HIGH'];

/**
 * يحلّ الباقة من سجل الاشتراك.
 *
 * ️ الاشتراك المنتهي أو الملغى يسقط إلى FREE — لا نثق في
 *    حقل plan وحده لأنه يبقى PRO بعد انتهاء الفترة.
 */
export const resolvePlan = (subscription) => {
  if (!subscription) return PLANS.FREE;
  if (subscription.status !== 'ACTIVE') return PLANS.FREE;

  if (subscription.currentPeriodEnd) {
    const ended = new Date(subscription.currentPeriodEnd).getTime() < Date.now();
    if (ended) return PLANS.FREE;
  }

  return PLANS[subscription.plan] ?? PLANS.FREE;
};

/**
 * الحدّ اليومي الفعلي.
 *
 * ️ `aiDailyLimit` في سجل الاشتراك يتجاوز الباقة — للحالات
 *    الخاصة (اختبار، هدية، تعويض). لا نحذفه.
 */
export const dailyLimitFor = (subscription) => {
  const plan = resolvePlan(subscription);
  if (Number.isInteger(subscription?.aiDailyLimit) && subscription.aiDailyLimit > 0) {
    return subscription.aiDailyLimit;
  }
  return plan.dailyMessages;
};

/**
 * سقف التوكنات اليومي.
 *
 * ️ لماذا حدّان (رسائل + توكنات)؟
 *
 *    كنّا نحاسب على عدد الرسائل فقط. مستخدم يرسل 1000 حرف
 *    كل مرة يستهلك ~10× ما يستهلكه من يرسل 100 — ويُحاسبان
 *    بالتساوي. عدّ الرسائل يقيس النية، وعدّ التوكنات يقيس
 *    التكلفة الحقيقية. نحتاج الاثنين.
 */
export const dailyTokensFor = (subscription) =>
  resolvePlan(subscription).dailyTokens;

export default { PLANS, PLAN_ORDER, resolvePlan, dailyLimitFor, dailyTokensFor };
