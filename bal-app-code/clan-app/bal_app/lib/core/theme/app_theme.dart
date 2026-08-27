import 'package:flutter/material.dart';
import 'app_colors.dart';

/// 🎨 الثيم الكامل — الخطوط + الزوايا + الحركة (من دستور التصميم)
abstract final class AppTheme {
  static const fontFamily = 'IBMPlexSansArabic';

  /// ️ الأحجام مكبّرة 15% عن الأصل (قرار المالك) — والزوايا 7.5% بس.
  ///    تكبير الزاوية بنفس نسبة الحجم بيخلي الكارت يبان «أكتر استدارة»
  ///    مش «أكبر»، فالشكل بيتغير مش الحجم بس.
  ///    السكربت: scripts/scale-ui.mjs
  // المسافات (Spacing System)
  static const double spaceXs = 4.5;
  static const double spaceSm = 9;
  static const double spaceMd = 14;
  static const double spaceLg = 18.5;
  static const double spaceXl = 23;
  static const double spaceXxl = 27.5;
  static const double spaceXxxl = 37;

  // الزوايا (Radius System)
  static const double radiusXs = 8.5;
  static const double radiusSm = 13;
  static const double radiusMd = 17;
  static const double radiusLg = 21.5;
  static const double radiusXl = 26;
  static const double radiusPill = 999;

  // الحركة (Motion System)
  static const Duration micro = Duration(milliseconds: 150);
  static const Duration standard = Duration(milliseconds: 250);
  static const Duration transition = Duration(milliseconds: 350);
  static const Duration hero = Duration(milliseconds: 500);

  static ThemeData dark() => _base(Brightness.dark);

  static ThemeData light() => _base(Brightness.light);

  static ThemeData _base(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final c = isDark
        ? _C(
            bg: AppColors.darkBackground,
            surface: AppColors.darkSurface,
            primary: AppColors.darkPrimary,
            onPrimary: AppColors.darkOnPrimary,
            accent: AppColors.darkAccent,
            text: AppColors.darkText,
            secondary: AppColors.darkTextSecondary,
            border: AppColors.darkBorder,
            danger: AppColors.darkDanger,
          )
        : _C(
            bg: AppColors.lightBackground,
            surface: AppColors.lightSurface,
            primary: AppColors.lightPrimary,
            onPrimary: AppColors.lightOnPrimary,
            accent: AppColors.lightAccent,
            text: AppColors.lightText,
            secondary: AppColors.lightTextSecondary,
            border: AppColors.lightBorder,
            danger: AppColors.lightDanger,
          );

    final scheme = ColorScheme.fromSeed(
      seedColor: c.primary,
      brightness: brightness,
      surface: c.surface,
    ).copyWith(
      primary: c.primary,
      onPrimary: c.onPrimary,
      secondary: c.accent,
      error: c.danger,
      surface: c.surface,
      onSurface: c.text,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.bg,
      fontFamily: fontFamily,
    );

    return base.copyWith(
      textTheme: base.textTheme
          .apply(
            bodyColor: c.text,
            displayColor: c.text,
            fontFamily: fontFamily,
          )
          .copyWith(
            /// ️ الأحجام من `BalType` مش أرقام مكتوبة — الثيم
            ///    والاستخدام المباشر لازم ياخدوا من نفس السلّم،
            ///    وإلا نرجع لنفس المشكلة من الباب التاني.
            headlineLarge: base.textTheme.headlineLarge?.copyWith(
              fontSize: BalType.displayLg, fontWeight: FontWeight.w700, height: 1.2),
            headlineMedium: base.textTheme.headlineMedium?.copyWith(
              fontSize: BalType.display, fontWeight: FontWeight.w700, height: 1.2),
            headlineSmall: base.textTheme.headlineSmall?.copyWith(
              fontSize: BalType.heading, fontWeight: FontWeight.w600, height: 1.2),
            titleLarge: base.textTheme.titleLarge?.copyWith(
              fontSize: BalType.titleLg, fontWeight: FontWeight.w600, height: 1.3),
            titleMedium: base.textTheme.titleMedium?.copyWith(
              fontSize: BalType.title, fontWeight: FontWeight.w600, height: 1.4),
            bodyLarge: base.textTheme.bodyLarge?.copyWith(
              fontSize: BalType.bodyLg, fontWeight: FontWeight.w400, height: 1.5),
            bodyMedium: base.textTheme.bodyMedium?.copyWith(
              fontSize: BalType.body, fontWeight: FontWeight.w400, height: 1.5),
            bodySmall: base.textTheme.bodySmall?.copyWith(
              fontSize: BalType.small, fontWeight: FontWeight.w400, height: 1.5),
          ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: base.textTheme.headlineSmall?.copyWith(
          color: c.text, fontWeight: FontWeight.w600),
        iconTheme: IconThemeData(color: c.text),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark ? const Color(0xE6273226) : const Color(0xE6091118),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        ),
      ),
      dividerTheme: DividerThemeData(color: c.border, thickness: 1),
      splashFactory: InkRipple.splashFactory, // InkSparkle مش متاح على الويب (بيسبب null crash)
    );
  }
}

class _C {
  final Color bg, surface, primary, onPrimary, accent, text, secondary, border, danger;
  const _C({
    required this.bg,
    required this.surface,
    required this.primary,
    required this.onPrimary,
    required this.accent,
    required this.text,
    required this.secondary,
    required this.border,
    required this.danger,
  });
}

/// 🔠 سلّم الخطوط — المصدر الوحيد لأحجام النص
///
/// ️ قبل كده كان في **٢٥ حجم** مكتوبين بالإيد في ١٦٨ مكان،
///    فيهم كسور زي 13.5 و17.5 مالهاش أي معنى تصميمي — دي بقايا
///    سكربت تكبير ١٥٪ اشتغل على أرقام ثابتة عشوائية.
///
///    النتيجة كانت نصوص بنفس الأهمية بأحجام مختلفة بفرق نص نقطة:
///    فرق مش كفاية يفرّق في المعنى، بس كفاية يخلي الشاشة تبان
///    مش مظبوطة من غير ما المستخدم يعرف السبب.
///
/// ️ استخدم `Theme.of(context).textTheme` لما ينفع — ده بيدّي
///    اللون والوزن وارتفاع السطر مع الحجم. الثوابت دي للحالات
///    اللي محتاجة رقم صريح (أيقونات، عدّادات، إيموجي).
abstract final class BalType {
  /// أختام ووقت الرسالة
  static const double micro = 11;

  /// تسميات صغيرة
  static const double caption = 12.5;

  /// نص ثانوي
  static const double small = 14;

  /// النص الأساسي
  static const double body = 15.5;

  /// نص بارز
  static const double bodyLg = 17;

  /// عنوان قسم
  static const double title = 18.5;

  /// عنوان شاشة صغير
  static const double titleLg = 21;

  /// عنوان شاشة
  static const double heading = 25.5;

  /// رقم كبير
  static const double display = 32;

  /// شعار
  static const double displayLg = 39;

  /// عدّاد الجلسة
  static const double hero = 60;
}
