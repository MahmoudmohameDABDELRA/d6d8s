import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/badge_pill.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/circular_timer.dart';
import '../widgets/pill_buttons.dart';

class FocusSessionScreen extends StatefulWidget {
  const FocusSessionScreen({super.key});

  @override
  State<FocusSessionScreen> createState() => _FocusSessionScreenState();
}

class _FocusSessionScreenState extends State<FocusSessionScreen> {
  // 25:00 out of a 30 min session, ~83% remaining -> ring nearly full,
  // matching the small gap near the top of the screenshot.
  static const int totalSeconds = 30 * 60;
  int remainingSeconds = 25 * 60;

  String get _formatted {
    final m = (remainingSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (remainingSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final progress = remainingSeconds / totalSeconds;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [AppColors.background, AppColors.backgroundGradientEnd],
              ),
            ),
            child: Column(
              children: [
                const SizedBox(height: 24),
                Text('جلسة تركيز', style: AppText.heading),
                const SizedBox(height: 6),
                Text('استعد — هتركز في مهمة واحدة', style: AppText.subheading),
                const SizedBox(height: 28),

                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: const [
                      BadgePill(label: '3', emoji: '🔥', accent: AppColors.textPrimary),
                      BadgePill(label: 'Sparks 120', emoji: '⭐', accent: AppColors.gold),
                    ],
                  ),
                ),

                const Spacer(),

                CircularTimerRing(
                  size: 280,
                  progress: progress,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_formatted, style: AppText.timerDigits),
                      const SizedBox(height: 4),
                      Text('دقيقة تركيز', style: AppText.subheading),
                    ],
                  ),
                ),

                const Spacer(),

                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      CircleIconButton(
                        icon: Icons.pause,
                        onTap: () {},
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: PrimaryPillButton(
                            label: 'ابدأ التركيز',
                            onTap: () {},
                          ),
                        ),
                      ),
                      CircleIconButton(
                        icon: Icons.music_note_outlined,
                        onTap: () {},
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),

                // Small "current task" overlay chip.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.cardBorder),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('اليوم 2 من 7 · رحلة تعلم Dart', style: AppText.label),
                      const SizedBox(width: 10),
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: AppColors.cardBorder,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.image_outlined,
                            size: 14, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: const AppBottomNavBar(
                    iconsOrder: [
                      Icons.person_outline,
                      Icons.chat_bubble_outline,
                      Icons.add,
                      Icons.check_circle_outline,
                      Icons.image_outlined,
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
