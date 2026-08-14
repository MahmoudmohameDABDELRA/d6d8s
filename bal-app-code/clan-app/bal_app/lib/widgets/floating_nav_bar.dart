import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';

/// عنصر في الناف بار
class NavItem {
  final IconData icon;
  final String label;
  const NavItem(this.icon, this.label);
}

/// 🏝️ جزيرة التنقل الطافية — كبسولة زجاجية منفصلة عن حافة الشاشة
/// [index] من 0 إلى 4: [جبل، مهام، FAB، رسائل، أنا]
class FloatingNavBar extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final VoidCallback onHeroFab;

  const FloatingNavBar({
    super.key,
    required this.selectedIndex,
    required this.onSelect,
    required this.onHeroFab,
  });

  static const items = [
    NavItem(Icons.terrain_rounded, 'الجبل'),
    NavItem(Icons.check_circle_rounded, 'المهام'),
    NavItem(Icons.add_rounded, ''),
    NavItem(Icons.chat_bubble_rounded, 'الرسائل'),
    NavItem(Icons.person_rounded, 'أنا'),
  ];

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppTheme.spaceXxl, 0, AppTheme.spaceXxl, AppTheme.spaceLg),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusPill),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            height: 76,
            decoration: BoxDecoration(
              color: c.isDark
                  ? const Color(0xE6273226)
                  : const Color(0xF2FFFFFF),
              borderRadius: BorderRadius.circular(AppTheme.radiusPill),
              border: Border.all(color: c.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  offset: const Offset(0, 10),
                  blurRadius: 30,
                ),
              ],
            ),
            child: Row(
              children: [
                // 0: الجبل · 1: المهام
                _item(context, 0, 1),
                _item(context, 1, 1),
                // المركز: الـ Hero FAB (أكبر + مرتفع)
                Expanded(
                  child: GestureDetector(
                    onTap: onHeroFab,
                    child: Center(
                      child: Container(
                        width: 64.5,
                        height: 64.5,
                        margin: const EdgeInsets.only(top: 4.5),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [
                              c.accent,
                              c.accent.withValues(alpha: 0.8),
                            ],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: c.accent.withValues(alpha: 0.45),
                              blurRadius: 16,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                        child: const Icon(Icons.add_rounded,
                            size: 34.5, color: Color(0xFF0A1F14)),
                      ),
                    ),
                  ),
                ),
                _item(context, 3, 1),
                _item(context, 4, 1),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _item(BuildContext context, int index, int _) {
    final c = BalColors(context);
    final active = selectedIndex == index;
    final item = items[index];

    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => onSelect(index),
        child: AnimatedContainer(
          duration: AppTheme.standard,
          curve: Curves.easeOutCubic,
          margin: const EdgeInsets.symmetric(vertical: 9, horizontal: 4.5),
          decoration: BoxDecoration(
            color: active
                ? c.primary.withValues(alpha: c.isDark ? 0.25 : 0.15)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                item.icon,
                size: 27.5,
                color: active ? c.primary : c.textSecondary,
              ),
              const SizedBox(height: 2.5),
              Text(
                item.label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                  color: active ? c.primary : c.textDisabled,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
