import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Wide green gradient pill, e.g. "ابدأ التركيز" / "ابدأ جلسة فردية ▶".
class PrimaryPillButton extends StatelessWidget {
  final String label;
  final IconData? trailingIcon;
  final VoidCallback? onTap;
  final Widget? badge;

  const PrimaryPillButton({
    super.key,
    required this.label,
    this.trailingIcon,
    this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(32),
            onTap: onTap,
            child: Container(
              height: 58,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(32),
                gradient: const LinearGradient(
                  colors: [AppColors.ctaGreenLight, AppColors.ctaGreenDark],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.ctaGreenDark.withOpacity(0.45),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: AppText.button),
                  if (trailingIcon != null) ...[
                    const SizedBox(width: 8),
                    Icon(trailingIcon, color: const Color(0xFF0C1712), size: 18),
                  ],
                ],
              ),
            ),
          ),
        ),
        if (badge != null) Positioned(top: -8, left: 8, child: badge!),
      ],
    );
  }
}

/// Outlined pill, e.g. "جلسة جماعية".
class OutlinePillButton extends StatelessWidget {
  final String label;
  final String? emoji;
  final VoidCallback? onTap;

  const OutlinePillButton({super.key, required this.label, this.emoji, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(32),
        onTap: onTap,
        child: Container(
          height: 56,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(32),
            border: Border.all(color: AppColors.gold.withOpacity(0.7), width: 1.4),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(label, style: AppText.buttonOutline),
              if (emoji != null) ...[
                const SizedBox(width: 8),
                Text(emoji!, style: const TextStyle(fontSize: 16)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Small round icon button, e.g. pause / music-note beside the main CTA.
class CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const CircleIconButton({super.key, required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardSurface,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 58,
          height: 58,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: Icon(icon, color: AppColors.textPrimary, size: 22),
        ),
      ),
    );
  }
}
