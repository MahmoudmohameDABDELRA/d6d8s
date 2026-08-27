import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';

/// ✅ زر إنجاز المهمة — الحركة الوحيدة اللي تستاهل في الشاشة دي
///
/// ═══════════════════════════════════════════════════════════
/// ️ فلسفة الحركة هنا، وليه مش كل حاجة بتتحرك:
///
/// الأنميشن مش زينة — ده **شرح للحالة**. كل حركة لازم تجاوب
/// على سؤال المستخدم: «إيه اللي حصل دلوقتي؟»
///
/// في التطبيق ده ٣ لحظات بس تستاهل حركة:
///   ١. إتمام مهمة  ← الملف ده
///   ٢. الصعود في الجبل
///   ٣. ظهور بوب-أب الاطمئنان
///
/// اللي بره التلاتة دول بيتحرك بلا سبب: الحركة بتاخد وقت
/// المستخدم وبتأخّر ردّ الفعل. الشاشة اللي كل حاجة فيها
/// بتتحرك بتبقى أبطأ إحساساً مش أحلى.
///
/// الحركة هنا مركّبة من تلات حاجات بتحصل مع بعض:
///   · الدايرة بتتملّى بالحبر (مش بتتلوّن فجأة)
///   · العلامة بترتسم خط بخط — زي ما إيد بتكتبها
///   · نبضة خفيفة برّه الدايرة — «تم» بلا صوت
///
/// المدة ٤٥٠ مللي: أقل من كده الحركة بتبان زي الوميض، وأكتر
/// من كده بتبقى عايقة لو المستخدم بيخلّص مهام ورا بعض.
/// ═══════════════════════════════════════════════════════════
class TaskCheckButton extends StatefulWidget {
  final bool isCompleted;
  final VoidCallback? onTap;
  final double size;

  const TaskCheckButton({
    super.key,
    required this.isCompleted,
    this.onTap,
    this.size = 34.5,
  });

  @override
  State<TaskCheckButton> createState() => _TaskCheckButtonState();
}

class _TaskCheckButtonState extends State<TaskCheckButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  late final Animation<double> _fill;
  late final Animation<double> _tick;
  late final Animation<double> _pulse;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
      value: widget.isCompleted ? 1 : 0,
    );

    //  الحبر بيتملّى الأول، والعلامة بترتسم بعده — مش مع بعض
    _fill = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.45, curve: Curves.easeOutCubic),
    );
    _tick = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.35, 1.0, curve: Curves.easeOutCubic),
    );
    _pulse = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.7, curve: Curves.easeOut),
    );
  }

  @override
  void didUpdateWidget(TaskCheckButton old) {
    super.didUpdateWidget(old);
    if (widget.isCompleted != old.isCompleted) {
      /// ️ الرجوع أسرع من الذهاب: «تم» لحظة تستاهل احتفال،
      ///    و«تراجعت» مجرد تصحيح — ما تستاهلش نفس الوقت.
      if (widget.isCompleted) {
        _ctrl.forward();
      } else {
        _ctrl.animateBack(0, duration: AppTheme.micro);
      }
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final tickColor = c.isDark ? const Color(0xFF0A1F14) : Colors.white;

    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        /// ️ ٤٨×٤٨ مساحة لمس مهما كان حجم الرسمة.
        ///    الدايرة نفسها ٣٤ نقطة، والفرق مساحة شفافة —
        ///    الضغطة بتنجح من غير ما الشكل يكبر.
        width: math.max(48, widget.size),
        height: math.max(48, widget.size),
        child: Center(
          child: AnimatedBuilder(
            animation: _ctrl,
            builder: (_, __) => CustomPaint(
              size: Size.square(widget.size),
              painter: _CheckPainter(
                fill: _fill.value,
                tick: _tick.value,
                pulse: _pulse.value,
                accent: c.primary,
                idle: c.textDisabled,
                tickColor: tickColor,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CheckPainter extends CustomPainter {
  final double fill;
  final double tick;
  final double pulse;
  final Color accent;
  final Color idle;
  final Color tickColor;

  _CheckPainter({
    required this.fill,
    required this.tick,
    required this.pulse,
    required this.accent,
    required this.idle,
    required this.tickColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2 - 1.25;

    //  ١) النبضة — حلقة بتتوسّع وتختفي
    if (pulse > 0 && pulse < 1) {
      canvas.drawCircle(
        center,
        radius + pulse * 9,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = accent.withValues(alpha: (1 - pulse) * 0.45),
      );
    }

    //  ٢) الإطار — بيتحوّل من رمادي للون الأساسي
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..color = Color.lerp(idle, accent, fill)!,
    );

    //  ٣) الحبر بيتملّى من النص لبرّه
    if (fill > 0) {
      canvas.drawCircle(
        center,
        radius * fill,
        Paint()..color = accent,
      );
    }

    //  ٤) العلامة بترتسم — نقطتين، كل واحدة في وقتها
    if (tick <= 0) return;

    final w = size.width;
    final p1 = Offset(w * 0.28, w * 0.52);
    final p2 = Offset(w * 0.44, w * 0.68);
    final p3 = Offset(w * 0.73, w * 0.34);

    final path = Path()..moveTo(p1.dx, p1.dy);

    /// ️ الضلع الأول أقصر من التاني، فلو قسمنا الوقت بالنص
    ///    الضلع القصير هيتحرك ببطء والطويل بسرعة — الحركة
    ///    بتبان متقطّعة. القسمة ٤٠/٦٠ بتخلي **السرعة** ثابتة.
    if (tick < 0.4) {
      final t = tick / 0.4;
      path.lineTo(
        p1.dx + (p2.dx - p1.dx) * t,
        p1.dy + (p2.dy - p1.dy) * t,
      );
    } else {
      path.lineTo(p2.dx, p2.dy);
      final t = (tick - 0.4) / 0.6;
      path.lineTo(
        p2.dx + (p3.dx - p2.dx) * t,
        p2.dy + (p3.dy - p2.dy) * t,
      );
    }

    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.8
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = tickColor,
    );
  }

  @override
  bool shouldRepaint(_CheckPainter old) =>
      old.fill != fill || old.tick != tick || old.pulse != pulse;
}
