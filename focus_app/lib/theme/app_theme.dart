import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Central place for every color / text-style used across the app so the
/// three screens stay visually consistent.
class AppColors {
  AppColors._();

  // Background is a near-black forest green, not pure black — this is what
  // gives the whole app its "dark green" identity instead of a flat #000.
  static const Color background = Color(0xFF0C1712);
  static const Color backgroundGradientEnd = Color(0xFF08110D);

  // Card / pill surfaces — translucent so the background tint shows through.
  static const Color cardSurface = Color(0xFF16241D);
  static const Color cardBorder = Color(0xFF2A3B32);

  // Primary teal/mint accent used for the timer ring & glow.
  static const Color tealGlow = Color(0xFF3FE0C5);
  static const Color tealGlowSoft = Color(0xFF2BB89F);

  // Green used for the main CTA buttons ("ابدأ التركيز", "ابدأ جلسة فردية").
  static const Color ctaGreenLight = Color(0xFF6FE39B);
  static const Color ctaGreenDark = Color(0xFF2E9E63);

  // Gold accent used for the Sparks badge, the locked "الحد" chip, and the
  // floating "+" button in the bottom nav.
  static const Color gold = Color(0xFFE0B24A);
  static const Color goldSoft = Color(0xFFF3D48A);

  // Cream/off-white used for headline text instead of pure white.
  static const Color textPrimary = Color(0xFFF3EFE6);
  static const Color textSecondary = Color(0xFFA9B5AD);
  static const Color textMuted = Color(0xFF6E7A73);

  static const Color onlineDot = Color(0xFF39D97A);
  static const Color offlineDot = Color(0xFF5A6660);
}

class AppText {
  AppText._();

  // Bold display font for Arabic headings ("جلسة تركيز", "التركيز" ...).
  static TextStyle heading = GoogleFonts.cairo(
    color: AppColors.textPrimary,
    fontWeight: FontWeight.w800,
    fontSize: 28,
  );

  static TextStyle subheading = GoogleFonts.cairo(
    color: AppColors.textSecondary,
    fontWeight: FontWeight.w500,
    fontSize: 14,
  );

  // Big timer digits — kept on a plain rounded font for clean numerals.
  static TextStyle timerDigits = GoogleFonts.cairo(
    color: AppColors.textPrimary,
    fontWeight: FontWeight.w800,
    fontSize: 64,
    letterSpacing: 1,
  );

  static TextStyle body = GoogleFonts.cairo(
    color: AppColors.textPrimary,
    fontWeight: FontWeight.w600,
    fontSize: 15,
  );

  static TextStyle label = GoogleFonts.cairo(
    color: AppColors.textSecondary,
    fontWeight: FontWeight.w500,
    fontSize: 12,
  );

  static TextStyle button = GoogleFonts.cairo(
    color: const Color(0xFF0C1712),
    fontWeight: FontWeight.w800,
    fontSize: 16,
  );

  static TextStyle buttonOutline = GoogleFonts.cairo(
    color: AppColors.textPrimary,
    fontWeight: FontWeight.w800,
    fontSize: 16,
  );
}

ThemeData buildAppTheme() {
  return ThemeData(
    scaffoldBackgroundColor: AppColors.background,
    fontFamily: GoogleFonts.cairo().fontFamily,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.tealGlow,
      brightness: Brightness.dark,
    ),
  );
}
