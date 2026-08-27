/**
 * ═══════════════════════════════════════════════════════════
 *  ساعة مزيّفة — لفحص الأطوار الزمنية
 *
 *  ️ ليه محتاجينها:
 *
 *  طور النبض (تركيز/راحة) محسوب رياضياً من ساعة UTC — مفيش
 *  cron ولا مجدول. ده تصميم ممتاز (كل مستخدم في العالم يشوف
 *  نفس الطور)، بس معناه إن فحص الألعاب **مستحيل** غير لو
 *  صادف إننا في العشر دقايق بتوع الراحة.
 *
 *  فكان فحص لعبة الثعبان بيقف عند «إحنا في وقت تركيز» ويعدّي
 *  من غير ما يفحص البروتوكول. الحل: نزيح الساعة.
 *
 *  الإزاحة بالدقايق من `FAKE_CLOCK_OFFSET_MIN`.
 * ═══════════════════════════════════════════════════════════
 */
const offsetMin = Number(process.env.FAKE_CLOCK_OFFSET_MIN ?? 0);

if (offsetMin !== 0) {
  const offsetMs = offsetMin * 60_000;
  const RealDate = Date;

  //  eslint-disable-next-line no-global-assign
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offsetMs);
      else super(...args);
    }

    static now() {
      return RealDate.now() + offsetMs;
    }
  };

  globalThis.Date.UTC = RealDate.UTC;
  globalThis.Date.parse = RealDate.parse;
}
