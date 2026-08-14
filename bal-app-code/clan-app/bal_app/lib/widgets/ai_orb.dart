import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';

/// 🤖 كرة الرفيق (AI Companion Orb) — توهج نابض
class AIOrb extends StatelessWidget {
  final double size;
  final VoidCallback? onTap;

  const AIOrb({super.key, this.size = 44, this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [
              c.primary.withValues(alpha: 0.9),
              c.primary.withValues(alpha: 0.3),
            ],
          ),
          boxShadow: [
            BoxShadow(
              color: c.primary.withValues(alpha: 0.5),
              blurRadius: 18,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Center(
          child: Icon(
            Icons.auto_awesome_rounded,
            size: size * 0.45,
            color: c.isDark ? const Color(0xFF0A1F14) : Colors.white,
          ),
        ),
      ),
    );
  }
}

/// 🎉 طبقة الاحتفال — انفجار جزيئات + نبضة (CelebrationOverlay)
class CelebrationOverlay extends StatefulWidget {
  final Widget child;
  final bool active;

  const CelebrationOverlay({
    super.key,
    required this.child,
    required this.active,
  });

  @override
  State<CelebrationOverlay> createState() => _CelebrationOverlayState();
}

class _CelebrationOverlayState extends State<CelebrationOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
  }

  @override
  void didUpdateWidget(covariant CelebrationOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Stack(
      alignment: Alignment.center,
      children: [
        widget.child,
        // جزيئات ذهبية عند الاحتفال
        AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            final t = _controller.value;
            if (t == 0) return const SizedBox.shrink();
            return IgnorePointer(
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Transform.scale(
                    scale: 1 + t * 0.15,
                    child: Container(
                      width: 260, height: 260,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: c.accent.withValues(alpha: (1 - t) * 0.8),
                          width: 3,
                        ),
                      ),
                    ),
                  ),
                  for (var i = 0; i < 12; i++)
                    Transform.translate(
                      offset: Offset(
                        math.cos(i * 0.52) * t * 140,
                        math.sin(i * 0.52) * t * 140,
                      ),
                      child: Opacity(
                        opacity: (1 - t).clamp(0.0, 1.0),
                        child: Container(
                          width: 7, height: 7,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i.isEven ? c.accent : c.primary,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
