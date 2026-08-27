/**
 * ═══════════════════════════════════════════════════════════
 *  بديل Gemini للفحص — بيرد ردود صالحة بلا مفتاح ولا شبكة
 *
 *  ️ ليه محتاجينه:
 *
 *  مسار الحلم (أهم مسار في التطبيق: الحلم → الأسئلة → الخطة →
 *  الجبل) فيه **٣ نداءات AI حقيقية**. من غير مفتاح، أول نداء
 *  بيرجّع 503 والمسار كله مايتفحصش — يعني السلسلة اللي المنتج
 *  كله قايم عليها كانت **بره التغطية**.
 *
 *  البديل ده بيرجّع JSON بالشكل اللي الكود متوقعه بالظبط. مش
 *  بيقلّد ذكاء النموذج — بيقلّد **عقده**: الحقول وأنواعها.
 *  وده اللي بيهمنا: إن السلسلة تمشي والبيانات توصل صح.
 *
 *  ️ الرد بيتغيّر حسب الطلب: لو السؤال عن أسئلة الكويز بيرجّع
 *    أسئلة، ولو عن الخطة بيرجّع خطوات. الاستنتاج من نص الـ
 *    prompt — مش مثالي، بس بيخلي البديل واحد لكل المسارات.
 * ═══════════════════════════════════════════════════════════
 */

/** آخر نداء — للتشخيص من الفحص */
export const lastCall = { system: null, prompt: null, opts: null };

const QUIZ = {
  questions: [
    {
      question: 'إيه اللي بيوقفك دلوقتي؟',
      options: ['الوقت', 'المعرفة', 'الحماس', 'الفلوس'],
    },
    {
      question: 'تقدر تدّي كام ساعة في اليوم؟',
      options: ['أقل من ساعة', 'ساعة لاتنين', 'تلاتة لأربعة', 'أكتر'],
    },
    {
      question: 'خبرتك دلوقتي إيه؟',
      options: ['مبتدئ خالص', 'أساسيات', 'متوسط', 'متقدم'],
    },
    {
      question: 'إمتى بتبقى أنشط؟',
      options: ['الصبح', 'الضهر', 'بالليل', 'بيختلف'],
    },
    {
      question: 'عايز توصل في قد إيه؟',
      options: ['٣ شهور', '٦ شهور', 'سنة', 'مش محدد'],
    },
  ],
};

const PLAN = {
  steps: [
    { title: 'الأساسيات', description: 'تبني القاعدة', weeks: 3 },
    { title: 'التطبيق العملي', description: 'مشروع صغير', weeks: 4 },
    { title: 'التعمّق', description: 'المواضيع المتقدمة', weeks: 4 },
    { title: 'مشروع حقيقي', description: 'حاجة تعرضها', weeks: 5 },
    { title: 'الاحتراف', description: 'تشتغل بيه', weeks: 6 },
  ],
};

const JOURNEY = {
  days: Array.from({ length: 7 }, (_, i) => ({
    dayNumber: i + 1,
    title: `مهمة اليوم ${i + 1}`,
    description: 'خطوة صغيرة في الاتجاه الصح',
    estimatedMin: 45,
  })),
};

/**
 * نستنتج نوع الرد من الطلب.
 *
 * ️ الترتيب مهم: «أسئلة» بتظهر في طلب الخطة كمان (لأنه بيحتوي
 *    على الإجابات)، فبنفحص الخطة الأول.
 */
const pick = (system, prompt) => {
  const all = `${system ?? ''} ${prompt ?? ''}`;

  if (/رحلة|أيام|يوم\s*\d|journey|days/i.test(all)) return JOURNEY;
  if (/خطوات|خطة|مراحل|steps|plan/i.test(all)) return PLAN;
  if (/أسئلة|سؤال|كويز|questions/i.test(all)) return QUIZ;

  //  نداء عام (اطمئنان، غفوة، تحفيز) → نص عادي
  return null;
};

export const generate = async (system, history, prompt, opts = {}) => {
  lastCall.system = system;
  lastCall.prompt = prompt;
  lastCall.opts = opts;

  const structured = pick(system, prompt);

  /**
   * ️ الشكل مهم: الكود الحقيقي بيقرا `res.text` مش القيمة
   *    المرجّعة مباشرةً. أول نسخة من البديل كانت بترجّع نص خام،
   *    فـ`extractJson(res.text ?? '')` كان بياخد `undefined`
   *    ويرمي `AI_INVALID_RESPONSE`.
   *
   *    البديل لازم يقلّد **عقد** الدالة مش نيّتها بس.
   */
  const text = structured
    ? JSON.stringify(structured)
    : 'تمام يا بطل، كمّل 💪';

  return { text, raw: text, usage: { totalTokens: 0 } };
};

export const isConfigured = () => true;

export default { generate, isConfigured };
