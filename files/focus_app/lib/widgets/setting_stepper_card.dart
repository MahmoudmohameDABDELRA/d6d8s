import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// One of the three cards on the settings screen: "وقت التركيز",
/// "فترة الراحة" (with a locked chip), and "التكرار".
class SettingStepperCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final int value;
  final String unit;
  final Color accent;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;

  /// Optional leading toggle (only the first card has one, matching the
  /// screenshot's green switch next to "وقت التركيز").
  final bool? toggleValue;
  final ValueChanged<bool>? onToggle;

  /// Optional locked badge text, e.g. "🔒 الحد 10".
  final String? lockedLabel;

  const SettingStepperCard({
    super.key,
    required this.title,
    required this.icon,
    required this.value,
    required this.unit,
    required this.accent,
    required this.onIncrement,
    required this.onDecrement,
    this.toggleValue,
    this.onToggle,
    this.lockedLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withOpacity(0.55)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (toggleValue != null)
                Switch(
                  value: toggleValue!,
                  onChanged: onToggle,
                  activeColor: AppColors.ctaGreenLight,
                )
              else if (lockedLabel != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.gold.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.lock, size: 12, color: AppColors.gold),
                      const SizedBox(width: 4),
                      Text(lockedLabel!,
                          style: AppText.label.copyWith(color: AppColors.gold)),
                    ],
                  ),
                )
              else
                const SizedBox(width: 24),
              Row(
                children: [
                  Text(title, style: AppText.body.copyWith(fontSize: 17)),
                  const SizedBox(width: 8),
                  Icon(icon, color: accent, size: 18),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _StepButton(icon: Icons.remove, accent: accent, onTap: onDecrement),
              Column(
                children: [
                  Text('$value',
                      style: AppText.timerDigits.copyWith(fontSize: 36)),
                  Text(unit, style: AppText.label),
                ],
              ),
              _StepButton(icon: Icons.add, accent: accent, onTap: onIncrement),
            ],
          ),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  final IconData icon;
  final Color accent;
  final VoidCallback onTap;

  const _StepButton({required this.icon, required this.accent, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: accent.withOpacity(0.7)),
          ),
          child: Icon(icon, color: accent, size: 20),
        ),
      ),
    );
  }
}
