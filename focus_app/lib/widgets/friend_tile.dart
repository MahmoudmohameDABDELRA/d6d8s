import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class FriendData {
  final String name;
  final bool online;
  final bool selected;
  final Color ringColor;
  final IconData avatarIcon;

  const FriendData({
    required this.name,
    required this.online,
    required this.selected,
    required this.ringColor,
    this.avatarIcon = Icons.person,
  });
}

/// One row in the group-session invite list (avatar, name, status dot,
/// selection checkbox). Offline friends render dimmed and un-selectable,
/// matching "كريم" in the screenshot.
class FriendTile extends StatelessWidget {
  final FriendData friend;
  final ValueChanged<bool>? onChanged;

  const FriendTile({super.key, required this.friend, this.onChanged});

  @override
  Widget build(BuildContext context) {
    final dimmed = !friend.online;

    return Opacity(
      opacity: dimmed ? 0.45 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Row(
          children: [
            // Checkbox on the leading (left, since row is RTL it visually
            // sits on the left like the screenshot) edge.
            GestureDetector(
              onTap: dimmed ? null : () => onChanged?.call(!friend.selected),
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: friend.selected ? AppColors.ctaGreenDark : Colors.transparent,
                  border: Border.all(
                    color: friend.selected
                        ? AppColors.ctaGreenLight
                        : AppColors.textMuted,
                    width: 1.6,
                  ),
                ),
                child: friend.selected
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : null,
              ),
            ),
            const Spacer(),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  children: [
                    Text(friend.name, style: AppText.body.copyWith(fontSize: 17)),
                    const SizedBox(width: 6),
                    Icon(Icons.circle,
                        size: 8,
                        color: friend.online
                            ? AppColors.onlineDot
                            : AppColors.offlineDot),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  friend.online ? 'متصل الآن' : 'غير متصل',
                  style: AppText.label.copyWith(
                    color: friend.online ? AppColors.onlineDot : AppColors.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 14),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: friend.ringColor, width: 2.4),
              ),
              padding: const EdgeInsets.all(3),
              child: CircleAvatar(
                backgroundColor: AppColors.cardBorder,
                child: Icon(friend.avatarIcon, color: AppColors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
