/// ═══════════════════════════════════════════════════════════
///  المنطقة الزمنية بتاعة الجهاز — الحقايق اللي السيرفر يقدر يثق فيها
///
///  ️ ليه مش سطر واحد:
///
///  `DateTime.now().timeZoneName` **مش** بيرجّع اسم IANA. بيرجّع
///  اختصار (`EET`, `CEST`) وعلى ويندوز الاسم الكامل بتاع ويندوز
///  (`India Standard Time`). والسيرفر بيعدّي القيمة دي لـ `Intl`
///  في كل حساب ليوم محلي — و`Intl` بيرمي `RangeError` على أي
///  حاجة مش IANA. يعني لو بعتنا الاختصار كنا هنكسر التطبيق على
///  كل مستخدم برّه أوروبا/الشرق الأوسط.
///
///  الحاجة الوحيدة المضمونة على كل المنصات هي **الأوفست**:
///  `DateTime.timeZoneOffset` بيرجّع `Duration` حقيقي دايماً.
///  بنبعت أوفست دلوقتي + أوفست يناير + أوفست يوليو، والسيرفر
///  بيستنتج منهم منطقة IANA سلوكها متطابق (بما فيه التوقيت
///  الصيفي، لأن يناير ويوليو بيكشفوه).
///
///  بنبعت `timezone` كمان لو الاسم صدف إنه IANA صحيح (فيه `/`)
///  — السيرفر بيفضّله لو قبله، وبيتجاهله لو رفضه.
/// ═══════════════════════════════════════════════════════════
library;

abstract final class DeviceTimezone {
  /// الحقول اللي بتتضاف لجسم الطلب في التسجيل والأونبوردنج.
  static Map<String, dynamic> payload([DateTime? now]) {
    final at = now ?? DateTime.now();
    final year = at.year;

    return {
      'utcOffsetMinutes': at.timeZoneOffset.inMinutes,
      'januaryOffsetMinutes':
          DateTime(year, 1, 15, 12).timeZoneOffset.inMinutes,
      'julyOffsetMinutes': DateTime(year, 7, 15, 12).timeZoneOffset.inMinutes,
      // بس لو شكله IANA فعلاً — السيرفر بيتحقق تاني برضه
      if (_looksLikeIana(at.timeZoneName)) 'timezone': at.timeZoneName,
    };
  }

  /// اسم IANA شكله `Region/City` — الاختصارات مالهاش `/`.
  static bool _looksLikeIana(String name) =>
      name.contains('/') && !name.contains(' ');
}
