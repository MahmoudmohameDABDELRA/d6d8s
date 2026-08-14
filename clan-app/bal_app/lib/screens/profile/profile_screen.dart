import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/app_state.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';

/// 👤 شاشة «أنا» — البروفايل + الإعدادات + خروج
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final state = context.watch<AppState>();
    final user = state.user;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          children: [
            Row(
              children: [
                Text('أنا',
                    style: TextStyle(
                        fontSize: 28, fontWeight: FontWeight.w700, color: c.text)),
                const Spacer(),
                IconButton(
                  icon: Icon(
                      state.isDark
                          ? Icons.light_mode_rounded
                          : Icons.dark_mode_rounded,
                      color: c.textSecondary),
                  onPressed: () => context.read<AppState>().setDark(!state.isDark),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // الكارت الشخصي
            GlassCard(
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: c.primary.withValues(alpha: 0.2),
                    child: Icon(Icons.person_rounded,
                        size: 40, color: c.primary),
                  ),
                  const SizedBox(height: 12),
                  Text(user?.username ?? 'مستخدم',
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: c.text)),
                  if (user?.companionName != null) ...[
                    const SizedBox(height: 4),
                    Text('رفيقي: ${user!.companionName}',
                        style: TextStyle(color: c.accent, fontSize: 13)),
                  ],
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _metric(context, '🔥', '${user?.currentStreak ?? 0}', 'سلسلة'),
                      _metric(context, '⭐', '${user?.sparksBalance ?? 0}', 'Sparks'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _actionTile(context, Icons.alarm_rounded, 'المنبهات', '4:00 فجراً', () {}),
            _actionTile(context, Icons.menu_book_rounded, 'التوثيق الأسبوعي', '', () {}),
            _actionTile(context, Icons.settings_rounded, 'الإعدادات', '', () {}),
            const SizedBox(height: 24),
            OutlinePillButton(
              label: 'تسجيل الخروج',
              icon: Icons.logout_rounded,
              onPressed: () => context.read<AppState>().logout(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metric(BuildContext context, String emoji, String value, String label) {
    final c = BalColors(context);
    return Column(
      children: [
        Text('$emoji $value',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.text)),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(color: c.textSecondary, fontSize: 12)),
      ],
    );
  }

  Widget _actionTile(
      BuildContext context, IconData icon, String title, String subtitle, VoidCallback onTap) {
    final c = BalColors(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.surfaceElevated.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: c.border),
      ),
      child: GestureDetector(
        onTap: onTap,
        child: Row(
          children: [
            Icon(icon, color: c.primary, size: 22),
            const SizedBox(width: 14),
            Expanded(
              child: Text(title,
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w600, color: c.text)),
            ),
            if (subtitle.isNotEmpty)
              Text(subtitle, style: TextStyle(color: c.textSecondary, fontSize: 12)),
            Icon(Icons.chevron_left_rounded, color: c.textSecondary),
          ],
        ),
      ),
    );
  }
}
