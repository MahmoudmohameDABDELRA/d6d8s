import 'package:flutter/material.dart';

/// 🎨 ألوان «بال» — نظام 60/30/10/5 (من دستور التصميم الشامل)
/// 60% خلفية · 30% أسطح · 10% أزرار/نص · 5% مكافآت (ذهبي)
abstract final class AppColors {
  // ── 🌙 الوضع الليلي (الجبل/التركيز/التعمق) ──
  static const darkBackground = Color(0xFF1E241D); // 60%
  static const darkSurface = Color(0xFF273226); // 30%
  static const darkSurfaceElevated = Color(0xFF214A36);
  static const darkPrimary = Color(0xFF3DD68C);
  static const darkOnPrimary = Color(0xFF0A1F14);
  static const darkAccent = Color(0xFFFFD166); // 5% المكافآت
  static const darkSummitGlow = Color(0xFFF3E8BC);
  static const darkText = Color(0xFFE0DBCE);
  static const darkTextSecondary = Color(0xFF9FB3A8);
  static const darkTextDisabled = Color(0xFF5A6B62);
  static const darkBorder = Color(0x1AE0DBCE);
  static const darkFriendship = Color(0xFF90AA90);
  static const darkDanger = Color(0xFFFF6B6B);

  // ── ☀️ الوضع النهاري (المهام/التواصل/الإنتاجية) ──
  static const lightBackground = Color(0xFFF4F9F5); // 60%
  static const lightSurface = Color(0xFFF3E8BC); // 30%
  static const lightSurfaceElevated = Color(0xFFFFFFFF);
  static const lightPrimary = Color(0xFF045452);
  static const lightOnPrimary = Color(0xFFFFFFFF);
  static const lightAccent = Color(0xFFFFD166);
  static const lightSummitGlow = Color(0xFFC2C9A7);
  static const lightText = Color(0xFF091118);
  static const lightTextSecondary = Color(0xFF48786B);
  static const lightTextDisabled = Color(0xFFA3B2AA);
  static const lightBorder = Color(0x14091118);
  static const lightFriendship = Color(0xFF90AA90);
  static const lightDanger = Color(0xFFE05252);
}

/// ألوان حسب الثيم الحالي
class BalColors {
  final BuildContext context;
  BalColors(this.context);

  bool get isDark => Theme.of(context).brightness == Brightness.dark;

  Color get background =>
      isDark ? AppColors.darkBackground : AppColors.lightBackground;
  Color get surface =>
      isDark ? AppColors.darkSurface : AppColors.lightSurface;
  Color get surfaceElevated => isDark
      ? AppColors.darkSurfaceElevated
      : AppColors.lightSurfaceElevated;
  Color get primary =>
      isDark ? AppColors.darkPrimary : AppColors.lightPrimary;
  Color get onPrimary =>
      isDark ? AppColors.darkOnPrimary : AppColors.lightOnPrimary;
  Color get accent =>
      isDark ? AppColors.darkAccent : AppColors.lightAccent;
  Color get summitGlow =>
      isDark ? AppColors.darkSummitGlow : AppColors.lightSummitGlow;
  Color get text => isDark ? AppColors.darkText : AppColors.lightText;
  Color get textSecondary =>
      isDark ? AppColors.darkTextSecondary : AppColors.lightTextSecondary;
  Color get textDisabled =>
      isDark ? AppColors.darkTextDisabled : AppColors.lightTextDisabled;
  Color get border => isDark ? AppColors.darkBorder : AppColors.lightBorder;
  Color get friendship =>
      isDark ? AppColors.darkFriendship : AppColors.lightFriendship;
  Color get danger => isDark ? AppColors.darkDanger : AppColors.lightDanger;

  /// خلفية الزجاج (Glass)
  Color get glassBg => isDark
      ? const Color(0xB8273226) // 72% شفافية
      : const Color(0xA6FFFFFF); // 65% شفافية

  Color get glassStrong => isDark
      ? const Color(0xE6273226)
      : const Color(0xE6FFFFFF);
}
