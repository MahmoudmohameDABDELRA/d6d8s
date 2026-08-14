import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';

/// 🪟 الكارت الزجاجي (Glassmorphism) — أساس كل البطاقات
/// خلفية ضبابية (BackdropFilter) + حدود خفيفة + ظل ناعم + زوايا دائرية
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? tint;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? margin;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppTheme.spaceLg),
    this.radius = AppTheme.radiusXl,
    this.tint,
    this.onTap,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final tintColor = tint ?? c.glassBg;

    Widget card = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          padding: padding,
          margin: margin,
          decoration: BoxDecoration(
            color: tintColor,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: c.border, width: 1),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.10),
                offset: const Offset(0, 8),
                blurRadius: 24,
              ),
            ],
          ),
          child: child,
        ),
      ),
    );

    if (onTap != null) {
      card = GestureDetector(
        onTap: onTap,
        child: card,
      );
    }

    return card;
  }
}

/// بطاقة عادية (غير زجاجية) — للسطح المرتفع في النهاري
class SoftCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;
  final VoidCallback? onTap;

  const SoftCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppTheme.spaceLg),
    this.radius = AppTheme.radiusLg,
    this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? c.surfaceElevated,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: c.border, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: c.isDark ? 0.15 : 0.06),
            offset: const Offset(0, 6),
            blurRadius: 18,
          ),
        ],
      ),
      child: child,
    );
    if (onTap == null) return box;
    return GestureDetector(onTap: onTap, child: box);
  }
}

/// شارة صغيرة (Pill) — للحالات والتصنيفات
class Pill extends StatelessWidget {
  final String text;
  final Color? color;
  final Color? textColor;
  final IconData? icon;
  final double fontSize;

  const Pill({
    super.key,
    required this.text,
    this.color,
    this.textColor,
    this.icon,
    this.fontSize = 12,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final bg = color ?? c.surfaceElevated;
    final fg = textColor ?? c.text;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        border: Border.all(color: c.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 4),
          ],
          Text(text,
              style: TextStyle(fontSize: fontSize, color: fg, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}
