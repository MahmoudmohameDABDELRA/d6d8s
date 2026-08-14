import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Recreates the glowing teal ring from the screenshot:
/// a track circle plus a progress arc drawn with a soft outer glow
/// (built from three stacked strokes of decreasing opacity/blur).
class CircularTimerRing extends StatelessWidget {
  final double size;
  final double progress; // 0.0 -> 1.0
  final Widget child;

  const CircularTimerRing({
    super.key,
    required this.size,
    required this.progress,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(
            size: Size(size, size),
            painter: _RingPainter(progress: progress),
          ),
          child,
        ],
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress;
  _RingPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.width / 2 - 6;
    const strokeWidth = 10.0;

    // Faint background track.
    final track = Paint()
      ..color = AppColors.cardBorder.withOpacity(0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, track);

    // Starts at top (-90deg) matching the screenshot's small gap top-right.
    const startAngle = -math.pi / 2;
    final sweepAngle = 2 * math.pi * progress;
    final rect = Rect.fromCircle(center: center, radius: radius);

    // Soft glow: wide, blurred, low-opacity stroke underneath the crisp line.
    final glow = Paint()
      ..color = AppColors.tealGlow.withOpacity(0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth + 14
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18);
    canvas.drawArc(rect, startAngle, sweepAngle, false, glow);

    final glowTight = Paint()
      ..color = AppColors.tealGlow.withOpacity(0.75)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth + 4
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
    canvas.drawArc(rect, startAngle, sweepAngle, false, glowTight);

    // Crisp foreground arc with a subtle gradient along its sweep.
    final progressPaint = Paint()
      ..shader = SweepGradient(
        startAngle: 0,
        endAngle: 2 * math.pi,
        colors: const [
          AppColors.tealGlowSoft,
          AppColors.tealGlow,
          AppColors.tealGlow,
        ],
        transform: GradientRotation(startAngle),
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, startAngle, sweepAngle, false, progressPaint);
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
