import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../screens/mountain/dream_setup_screen.dart';
import '../screens/focus/focus_setup_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/alarm/alarms_screen.dart';

/// ➕ قائمة الإنشاء السريع (Hero FAB)
Future<void> showCreateMenu(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black54,
    builder: (_) => const _CreateMenuSheet(),
  );
}

class _CreateMenuSheet extends StatelessWidget {
  const _CreateMenuSheet();

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final items = [
      _MenuItem(
        icon: Icons.terrain_rounded,
        label: 'هدف جديد (الجبل)',
        color: c.primary,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const DreamSetupScreen()),
        ),
      ),
      _MenuItem(
        icon: Icons.timer_rounded,
        label: 'جلسة تركيز',
        color: c.accent,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const FocusSetupScreen()),
        ),
      ),
      /// ️ الرسائل كانت في الناف بار وخرجت منه لما دخلت العشائر.
      ///    محطوطة هنا عشان تفضل متاحة — مش مشالة.
      _MenuItem(
        icon: Icons.chat_bubble_rounded,
        label: 'رسالة',
        color: c.friendship,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ChatScreen()),
        ),
      ),
      /// ️ الزرار ده كان موجود بـ TODO — بيقفل القائمة ومش بيعمل
      ///    حاجة. شيلته وقتها ودلوقتي رجع وشاشته اتبنت.
      _MenuItem(
        icon: Icons.alarm_rounded,
        label: 'منبه',
        color: c.summitGlow,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AlarmsScreen()),
        ),
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        color: c.glassStrong,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 41.5,
              height: 4.5,
              decoration: BoxDecoration(
                color: c.textDisabled,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 23),
          Text('إضافة سريعة',
              style: TextStyle(fontSize: 20.5, fontWeight: FontWeight.w600, color: c.text)),
          const SizedBox(height: 18.5),
          for (final item in items) ...[
            _CreateItemTile(item: item),
            const SizedBox(height: 9),
          ],
        ],
      ),
    );
  }
}

class _CreateItemTile extends StatelessWidget {
  final _MenuItem item;
  const _CreateItemTile({required this.item});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return GestureDetector(
      onTap: item.onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: c.surface.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: Border.all(color: c.border),
        ),
        child: Row(
          children: [
            Container(
              width: 48.5,
              height: 48.5,
              decoration: BoxDecoration(
                color: item.color.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              child: Icon(item.icon, color: item.color, size: 25.5),
            ),
            const SizedBox(width: 16),
            Text(item.label,
                style: TextStyle(
                    fontSize: 17.5,
                    fontWeight: FontWeight.w600,
                    color: c.text)),
            const Spacer(),
            Icon(Icons.chevron_left_rounded, color: c.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _MenuItem {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _MenuItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
}
