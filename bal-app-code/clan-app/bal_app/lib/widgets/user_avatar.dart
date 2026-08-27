import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';

/// 👤 أفاتار المستخدم — صورة أو أول حرف من اسمه
///
/// ️ ليه ودجت مستقلة:
///
///    `CircleAvatar(backgroundImage: NetworkImage(url))` **مالهاش
///    معالجة فشل**. لو الرابط باظ أو النت قطع، الأفاتار بيفضل دايرة
///    فاضية — لا صورة ولا حرف بديل، لأن `child` بيتجاهل لما
///    `backgroundImage` مبعوت.
///
///    كان ده في مكانين (الرسائل وأعضاء العشيرة). الودجت دي بتحل
///    المشكلة مرة واحدة وبتوحّد الشكل.
class UserAvatar extends StatelessWidget {
  final String? imageUrl;
  final String name;
  final double radius;

  /// نقطة خضرا = موجود دلوقتي
  final bool isOnline;

  /// لون الخلفية لما مفيش صورة
  final Color? background;

  const UserAvatar({
    super.key,
    this.imageUrl,
    required this.name,
    this.radius = 24,
    this.isOnline = false,
    this.background,
  });

  String get _initial {
    final trimmed = name.trim();
    return trimmed.isEmpty ? '؟' : trimmed.characters.first;
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final bg = background ?? c.surface;

    final fallback = CircleAvatar(
      radius: radius,
      backgroundColor: bg,
      child: Text(
        _initial,
        style: TextStyle(
          fontSize: radius * 0.8,
          fontWeight: FontWeight.w600,
          color: c.text,
        ),
      ),
    );

    Widget avatar;
    if (imageUrl == null || imageUrl!.isEmpty) {
      avatar = fallback;
    } else {
      /**
       * ️ ClipOval + Image.network بدل CircleAvatar.backgroundImage
       *    عشان `errorBuilder` — دي الطريقة الوحيدة نرجع بيها للحرف
       *    البديل لما الصورة تفشل.
       */
      avatar = ClipOval(
        child: Image.network(
          imageUrl!,
          width: radius * 2,
          height: radius * 2,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => fallback,
          loadingBuilder: (_, child, progress) {
            if (progress == null) return child;
            return CircleAvatar(
              radius: radius,
              backgroundColor: bg,
              child: SizedBox(
                width: radius * 0.6,
                height: radius * 0.6,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: c.textDisabled,
                ),
              ),
            );
          },
        ),
      );
    }

    if (!isOnline) return avatar;

    return Stack(
      children: [
        avatar,
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: radius * 0.55,
            height: radius * 0.55,
            decoration: BoxDecoration(
              color: c.primary,
              shape: BoxShape.circle,
              border: Border.all(color: c.background, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}
