/// 🔤 ترجمة أخطاء الشبكة لكلام بشري
///
/// ️ ليه ملف مستقل:
///
///    كانت كل شاشة بتتعامل مع الأخطاء بطريقتها. شاشة الجبل كانت
///    بتعرض `e.toString()` على طول، فالمستخدم يشوف:
///
///      DioException [connection error]: The connection errored:
///      Failed host lookup: 'localhost'
///
///    ده كلام مبرمجين مش رسالة لمستخدم. والشاشات التانية كانت
///    بتعمل `replaceAll('Exception: ', '')` وبس — أحسن شوية بس
///    لسه بتسرّب تفاصيل تقنية.
///
///    الدالة دي بتوحّد الترجمة، فأي شاشة جديدة بتاخد نفس المعاملة
///    من غير ما تفتكر.
library;

/// يحوّل أي خطأ لرسالة بالعامية المصرية.
///
/// [fallback] الرسالة لو الخطأ مش معروف — خليها متعلقة بالسياق
/// (مثلاً 'مقدرناش نجيب مهامك').
String humanError(Object error, {String fallback = 'حصل خطأ — جرّب تاني'}) {
  final s = error.toString();

  // ── الشبكة ──
  if (s.contains('SocketException') ||
      s.contains('Connection refused') ||
      s.contains('Failed host lookup') ||
      s.contains('connection error')) {
    return 'مفيش اتصال بالسيرفر — اتأكد إنه شغال';
  }
  if (s.contains('timeout') || s.contains('Timeout')) {
    return 'السيرفر بطيء دلوقتي — جرّب تاني';
  }

  // ── أكواد HTTP ──
  if (s.contains('401')) return 'محتاج تسجّل دخول تاني';
  if (s.contains('403')) return 'مش مسموح بالحاجة دي';
  if (s.contains('404')) return 'مش لاقيينه';
  if (s.contains('409')) return 'الحاجة دي موجودة بالفعل';
  if (s.contains('429')) return 'استنى شوية — بعتنا كتير ورا بعض';
  if (s.contains('500') || s.contains('502') || s.contains('503')) {
    return 'السيرفر تعبان شوية — جرّب كمان شوية';
  }

  // ── أكواد المشروع ──
  if (s.contains('GEMINI_NOT_CONFIGURED')) {
    return 'الرفيق مش متاح — مفتاح الذكاء الاصطناعي ناقص في السيرفر';
  }
  if (s.contains('GEMINI_QUOTA')) {
    return 'الرفيق مشغول دلوقتي — جرّب بعد شوية';
  }
  if (s.contains('MAX_CLANS_REACHED')) {
    return 'وصلت للحد الأقصى من العشائر';
  }
  if (s.contains('MAX_ALARMS')) {
    return 'وصلت للحد الأقصى من المنبهات';
  }
  if (s.contains('DUPLICATE_ALARM')) {
    return 'عندك منبه في نفس الوقت واليوم';
  }

  /**
   * ️ لو السيرفر بعت رسالة عربية جاهزة، نعرضها زي ما هي — هو
   *    أعرف بالسياق مننا. بنكتشفها بوجود حروف عربية.
   */
  final arabic = RegExp(r'[\u0600-\u06FF]{3,}');
  final match = arabic.firstMatch(s);
  if (match != null) {
    final cleaned = s
        .replaceAll(RegExp(r'^\w*(Exception|Error):\s*'), '')
        .replaceAll(RegExp(r'\[[^\]]*\]'), '')
        .trim();
    if (cleaned.isNotEmpty && cleaned.length < 160) return cleaned;
  }

  return fallback;
}
