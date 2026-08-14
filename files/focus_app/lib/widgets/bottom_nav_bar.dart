import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// The pill-shaped bottom bar seen on all three screens, with a raised
/// gold "+" button in the middle (matches the screenshots — the icon
/// order differs slightly per screen there, so [iconsOrder] lets each
/// screen pass its own arrangement while reusing the same visuals).
class AppBottomNavBar extends StatelessWidget {
  final List<IconData> iconsOrder;
  final int activeGoldIndex;

  const AppBottomNavBar({
    super.key,
    this.iconsOrder = const [
      Icons.person_outline,
      Icons.chat_bubble_outline,
      Icons.add,
      Icons.check_circle_outline,
      Icons.image_outlined,
    ],
    this.activeGoldIndex = 2,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 68,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: AppColors.cardSurface.withOpacity(0.92),
        borderRadius: BorderRadius.circular(40),
        border: Border.all(color: AppColors.cardBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(iconsOrder.length, (i) {
          final isGold = i == activeGoldIndex;
          if (isGold) {
            return Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [AppColors.goldSoft, AppColors.gold],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.gold.withOpacity(0.55),
                    blurRadius: 18,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Icon(iconsOrder[i], color: const Color(0xFF0C1712), size: 26),
            );
          }
          return Icon(iconsOrder[i], color: AppColors.textSecondary, size: 24);
        }),
      ),
    );
  }
}
