import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

/// ⭕ حلقة التقدم — للـ 42% والعدادات
class ProgressRing extends StatelessWidget {
  final double progress; // 0..1
  final double size;
  final double strokeWidth;
  final Color? color;
  final Widget? center;

  const ProgressRing({
    super.key,
    required this.progress,
    this.size = 88,
    this.strokeWidth = 8,
    this.color,
    this.center,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final col = color ?? c.primary;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: CircularProgressIndicator(
              value: progress.clamp(0.0, 1.0),
              strokeWidth: strokeWidth,
              strokeCap: StrokeCap.round,
              backgroundColor: c.border.withValues(alpha: 0.5),
              valueColor: AlwaysStoppedAnimation(col),
            ),
          ),
          if (center != null) center!,
        ],
      ),
    );
  }
}

/// 📊 شريط تقدم خطي رفيع
class LinearProgressBar extends StatelessWidget {
  final double progress; // 0..1
  final double height;
  final Color? color;

  const LinearProgressBar({
    super.key,
    required this.progress,
    this.height = 6,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: LinearProgressIndicator(
        value: progress.clamp(0.0, 1.0),
        minHeight: height,
        backgroundColor: c.border.withValues(alpha: 0.4),
        valueColor: AlwaysStoppedAnimation(color ?? c.primary),
      ),
    );
  }
}

/// 🎵 عداد متحرك — الرقم بيعد مع أنميشن
class AnimatedCounter extends StatelessWidget {
  final int value;
  final Duration duration;
  final TextStyle? style;

  const AnimatedCounter({
    super.key,
    required this.value,
    this.duration = const Duration(milliseconds: 800),
    this.style,
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: value.toDouble()),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text(
        v.round().toString(),
        style: style,
      ),
    );
  }
}
