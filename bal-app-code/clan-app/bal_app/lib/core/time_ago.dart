/// 🕐 صياغة الوقت بالعربي — زي تطبيقات الرسايل
///
/// ═══════════════════════════════════════════════════════════
/// ️ ليه ملف لوحده وليه بالشكل ده:
///
/// كل تطبيق رسايل محترم (واتساب، تيليجرام، سيجنال) بيعرض وقت
/// آخر رسالة في قايمة المحادثات. النسخة الأولى عندنا كانت
/// بتقرا `lastMessageAt` من السيرفر و**مبتعرضهاش** — يعني
/// مفيش أي إحساس بالزمن في القايمة.
///
/// القاعدة اللي التطبيقات دي متفقة عليها:
///
///   النهاردة   →  الساعة       "14:32"
///   امبارح     →  كلمة         "امبارح"
///   الأسبوع ده →  اسم اليوم    "الاتنين"
///   أقدم       →  التاريخ      "12/8"
///
/// ️ ليه مش «من ٣ ساعات» في القايمة؟ لأن الوقت النسبي بيحتاج
///    حساب ذهني عشان تعرف الساعة كام. القايمة بتتقرا بسرعة —
///    والساعة الصريحة أسرع في القراية. الوقت النسبي مكانه جوه
///    المحادثة أو في الإشعارات.
///
/// ️ وفيه صيغة تانية للنصوص الوصفية («آخر ظهور من ساعة»)
///    — دي `relative()`.
/// ═══════════════════════════════════════════════════════════
library;

abstract final class TimeAgo {
  static const _weekdays = [
    'الاتنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
    'الحد',
  ];

  /// صيغة قايمة المحادثات — مختصرة وصريحة
  static String forList(DateTime? at, {DateTime? now}) {
    if (at == null) return '';

    final local = at.toLocal();
    final ref = now ?? DateTime.now();

    /// ️ المقارنة بالتاريخ مش بالفرق بالساعات.
    ///
    ///    رسالة الساعة ١١:٥٠ بالليل ورسالة ١٢:١٠ بعد نص الليل
    ///    بينهم ٢٠ دقيقة، بس واحدة «امبارح» والتانية «النهاردة».
    ///    الحساب بالفرق كان هيقول «النهاردة» على الاتنين.
    final today = DateTime(ref.year, ref.month, ref.day);
    final day = DateTime(local.year, local.month, local.day);
    final diff = today.difference(day).inDays;

    if (diff == 0) return _clock(local);
    if (diff == 1) return 'امبارح';
    if (diff < 7) return _weekdays[local.weekday - 1];

    //  نفس السنة؟ مفيش داعي نعرضها
    if (local.year == ref.year) return '${local.day}/${local.month}';
    return '${local.day}/${local.month}/${local.year}';
  }

  /// صيغة وصفية — «من ٥ دقايق»، للنصوص جوه الشاشات
  static String relative(DateTime? at, {DateTime? now}) {
    if (at == null) return '';

    final local = at.toLocal();
    final ref = now ?? DateTime.now();
    final seconds = ref.difference(local).inSeconds;

    //  المستقبل (فرق ساعات بين الجهاز والسيرفر) — نعامله كدلوقتي
    if (seconds < 60) return 'دلوقتي';

    final minutes = seconds ~/ 60;
    if (minutes < 60) return 'من $minutes ${_plural(minutes, 'دقيقة', 'دقايق')}';

    final hours = minutes ~/ 60;
    if (hours < 24) return 'من $hours ${_plural(hours, 'ساعة', 'ساعات')}';

    final days = hours ~/ 24;
    if (days == 1) return 'امبارح';
    if (days < 7) return 'من $days ${_plural(days, 'يوم', 'أيام')}';

    final weeks = days ~/ 7;
    if (weeks < 5) return 'من $weeks ${_plural(weeks, 'أسبوع', 'أسابيع')}';

    final months = days ~/ 30;
    if (months < 12) return 'من $months ${_plural(months, 'شهر', 'شهور')}';

    final years = days ~/ 365;
    return 'من $years ${_plural(years, 'سنة', 'سنين')}';
  }

  /// الساعة بصيغة ٢٤ — «14:32»
  static String _clock(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:'
      '${d.minute.toString().padLeft(2, '0')}';

  /// ️ العربي فيه مثنى وجمع. «من ٢ دقيقة» غلط، و«من ٥ دقيقة»
  ///    غلط كمان. القاعدة المبسّطة: ٣-١٠ جمع، غير كده مفرد.
  static String _plural(int n, String single, String plural) =>
      (n >= 3 && n <= 10) ? plural : single;
}
