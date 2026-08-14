import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The small rounded chips used for "3 🔥 سلسلة" and "Sparks ⭐ 120".
class BadgePill extends StatelessWidget {
  final String label;
  final String emoji;
  final Color accent;

  const BadgePill({
    super.key,
    required this.label,
    required this.emoji,
    this.accent = AppColors.textPrimary,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.cardSurface.withOpacity(0.85),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: AppText.body.copyWith(color: accent)),
          const SizedBox(width: 6),
          Text(emoji, style: const TextStyle(fontSize: 15)),
        ],
      ),
    );
  }
}
