import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

/// ⭕ حلقة التقدم — الصعود في الجبل
///
/// ️ ليه بتتحرك بدل ما تقفز:
///
///    دي الحلقة اللي بتوَرِّي «وصلت فين في هدفك». لما المستخدم
///    يخلّص مهمة، الرقم كان بيقفز من ٤٢٪ لـ ٥٠٪ في فريم واحد —
///    التغيير بيحصل بس المستخدم **مبيشوفوش يحصل**، فمبيحسّش
///    إنه اتحرّك.
///
///    الحركة هنا مش تزويق: هي اللي بتحوّل الرقم من «معلومة»
///    لـ «إنجاز». دي تانية اللحظات التلاتة اللي تستاهل حركة
///    (مع إتمام المهمة وبوب-أب الاطمئنان).
///
///    ️ الوقت بيتظبط على حجم القفزة: قفزة ٢٪ بتاخد وقت أقل
///      من قفزة ٣٠٪. المدة الثابتة بتخلي الحركة الصغيرة تبان
///      بطيئة والكبيرة تبان مستعجلة.
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
    final target = progress.clamp(0.0, 1.0);

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          TweenAnimationBuilder<double>(
            /// ️ `TweenAnimationBuilder` بيتحرك من القيمة القديمة
            ///    للجديدة لوحده لما الويدجت تتبني تاني — مش محتاج
            ///    نمسك حالة ولا متحكّم.
            tween: Tween(end: target),
            duration: _durationFor(target),
            curve: Curves.easeOutCubic,
            builder: (_, value, __) => SizedBox(
              width: size,
              height: size,
              child: CircularProgressIndicator(
                value: value,
                strokeWidth: strokeWidth,
                strokeCap: StrokeCap.round,
                backgroundColor: c.border.withValues(alpha: 0.5),
                valueColor: AlwaysStoppedAnimation(col),
              ),
            ),
          ),
          ?center,
        ],
      ),
    );
  }

  /// المدة على قد القفزة — ٤٠٠ للحركة الصغيرة، لحد ١١٠٠ للكبيرة
  Duration _durationFor(double target) {
    final ms = (400 + target * 700).clamp(400, 1100).round();
    return Duration(milliseconds: ms);
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
      //  نفس المنطق: التقدّم بيتحرك، مبيقفزش
      child: TweenAnimationBuilder<double>(
        tween: Tween(end: progress.clamp(0.0, 1.0)),
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeOutCubic,
        builder: (_, value, __) => LinearProgressIndicator(
          value: value,
          minHeight: height,
          backgroundColor: c.border.withValues(alpha: 0.4),
          valueColor: AlwaysStoppedAnimation(color ?? c.primary),
        ),
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
      /// ️ بلا `begin` عن قصد: مع `begin: 0` الرقم كان بيرجع
      ///    للصفر ويعدّ من الأول في **كل** إعادة بناء. دلوقتي
      ///    بيعدّ من قيمته الحالية للجديدة بس.
      tween: Tween(end: value.toDouble()),
      duration: duration,
      curve: Curves.easeOutCubic,
      builder: (context, v, _) => Text(
        v.round().toString(),
        style: style,
      ),
    );
  }
}
