import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/pill_buttons.dart';
import '../widgets/setting_stepper_card.dart';
import 'group_session_screen.dart';

class FocusSettingsScreen extends StatefulWidget {
  const FocusSettingsScreen({super.key});

  @override
  State<FocusSettingsScreen> createState() => _FocusSettingsScreenState();
}

class _FocusSettingsScreenState extends State<FocusSettingsScreen> {
  bool focusEnabled = true;
  int focusMinutes = 30;
  int restMinutes = 5;
  static const int restLimit = 10;
  int repeatCount = 3;

  int get _totalMinutes =>
      (focusMinutes * repeatCount) + (restMinutes * (repeatCount - 1));

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 20),
                Text('التركيز', style: AppText.heading.copyWith(fontSize: 32)),
                const SizedBox(height: 4),
                Text('ظبط وقتك وابدأ', style: AppText.subheading),
                const SizedBox(height: 22),

                SettingStepperCard(
                  title: 'وقت التركيز',
                  icon: Icons.access_time,
                  value: focusMinutes,
                  unit: 'دقيقة',
                  accent: AppColors.ctaGreenLight,
                  toggleValue: focusEnabled,
                  onToggle: (v) => setState(() => focusEnabled = v),
                  onIncrement: () => setState(() => focusMinutes += 5),
                  onDecrement: () => setState(() {
                    if (focusMinutes > 5) focusMinutes -= 5;
                  }),
                ),
                const SizedBox(height: 16),

                SettingStepperCard(
                  title: 'فترة الراحة',
                  icon: Icons.hourglass_bottom,
                  value: restMinutes,
                  unit: 'دقائق',
                  accent: AppColors.gold,
                  lockedLabel: 'الحد $restLimit',
                  onIncrement: () => setState(() {
                    if (restMinutes < restLimit) restMinutes += 1;
                  }),
                  onDecrement: () => setState(() {
                    if (restMinutes > 1) restMinutes -= 1;
                  }),
                ),
                const SizedBox(height: 16),

                SettingStepperCard(
                  title: 'التكرار',
                  icon: Icons.repeat,
                  value: repeatCount,
                  unit: 'دورات',
                  accent: AppColors.tealGlow,
                  onIncrement: () => setState(() => repeatCount += 1),
                  onDecrement: () => setState(() {
                    if (repeatCount > 1) repeatCount -= 1;
                  }),
                ),
                const SizedBox(height: 18),

                // Live-calculated summary bar, mirroring the screenshot's
                // "30 دقيقة تركيز × 3 + راحة 5 بينهم = 100 دقيقة" text.
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.cardBorder),
                  ),
                  child: Column(
                    children: [
                      Text(
                        '$focusMinutes دقيقة تركيز × $repeatCount + راحة $restMinutes بينهم = $_totalMinutes دقيقة',
                        textAlign: TextAlign.center,
                        style: AppText.body,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'آخر دورة = لوبي 🎉',
                        textAlign: TextAlign.center,
                        style: AppText.label,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),

                PrimaryPillButton(
                  label: 'ابدأ جلسة فردية',
                  trailingIcon: Icons.play_arrow,
                  onTap: () {},
                ),
                const SizedBox(height: 14),
                OutlinePillButton(
                  label: 'جلسة جماعية',
                  emoji: '👥',
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const GroupSessionScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 22),

                const AppBottomNavBar(
                  iconsOrder: [
                    Icons.image_outlined,
                    Icons.check_circle_outline,
                    Icons.add,
                    Icons.chat_bubble_outline,
                    Icons.person_outline,
                  ],
                ),
                const SizedBox(height: 14),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
