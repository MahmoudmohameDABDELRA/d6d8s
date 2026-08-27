import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';

/// 💀 هياكل التحميل — بديل الدايرة الدوّارة
///
/// ️ ليه ده مش «كماليات»:
///
///    `CircularProgressIndicator` في نص شاشة فاضية بيقول للمستخدم
///    «استنى» ومش بيقول «استنى إيه». الهيكل بيوَرِّي **شكل** اللي
///    جاي، فالانتقال من التحميل للمحتوى بيبقى استمرار مش قفزة،
///    والشاشة بتحس أسرع حتى لو نفس الزمن بالظبط.
///
///    ودي حاجة مقيسة مش رأي: الشاشة اللي بتوَرِّي هيكل بتتقاس
///    أسرع إدراكياً من نفس الشاشة بمؤشّر دوّار.
///
/// النبض بيستخدم `AnimatedBuilder` على متحكّم واحد — مش
/// `AnimatedContainer` لكل عنصر — عشان ما نبنيش شجرة كبيرة كل فريم.
class Shimmer extends StatefulWidget {
  final Widget child;

  const Shimmer({super.key, required this.child});

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, child) => Opacity(
        //  نبضة هادية — 0.45 → 0.85. الفرق الكبير بيشتت
        opacity: 0.45 + _ctrl.value * 0.40,
        child: child,
      ),
      child: widget.child,
    );
  }
}

/// مستطيل رمادي بحجم محدد
class SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final double radius;

  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = AppTheme.radiusSm,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: c.textDisabled.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// هيكل قائمة كروت (المهام · العشائر · المنبهات)
class CardListSkeleton extends StatelessWidget {
  final int count;
  final double height;

  const CardListSkeleton({super.key, this.count = 4, this.height = 88});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.builder(
        padding: const EdgeInsets.all(AppTheme.spaceLg),
        itemCount: count,
        physics: const NeverScrollableScrollPhysics(),
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spaceMd),
          child: SkeletonBox(
            height: height,
            radius: AppTheme.radiusXl,
          ),
        ),
      ),
    );
  }
}

/// هيكل رسايل — فقاعات متبادلة يمين وشمال
class MessageListSkeleton extends StatelessWidget {
  const MessageListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    /// عرض متغيّر عشان يبان طبيعي — كل الفقاعات بنفس العرض
    /// بتبان زي جدول مش زي محادثة
    const widths = [0.62, 0.44, 0.71, 0.38, 0.55, 0.48];
    final w = MediaQuery.sizeOf(context).width;

    return Shimmer(
      child: ListView.builder(
        padding: const EdgeInsets.all(AppTheme.spaceLg),
        itemCount: widths.length,
        physics: const NeverScrollableScrollPhysics(),
        itemBuilder: (_, i) {
          final mine = i.isOdd;
          return Align(
            alignment: mine
                ? AlignmentDirectional.centerEnd
                : AlignmentDirectional.centerStart,
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
              child: SkeletonBox(
                width: w * widths[i],
                height: 42,
                radius: AppTheme.radiusLg,
              ),
            ),
          );
        },
      ),
    );
  }
}

/// هيكل صف أعضاء — دايرة + سطرين
class MemberListSkeleton extends StatelessWidget {
  final int count;

  const MemberListSkeleton({super.key, this.count = 6});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.builder(
        padding: const EdgeInsets.all(AppTheme.spaceLg),
        itemCount: count,
        physics: const NeverScrollableScrollPhysics(),
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spaceLg),
          child: Row(
            children: [
              const SkeletonBox(width: 46, height: 46, radius: 999),
              const SizedBox(width: AppTheme.spaceMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    SkeletonBox(width: 130, height: 13),
                    SizedBox(height: 7),
                    SkeletonBox(width: 80, height: 11),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
