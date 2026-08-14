import 'package:flutter/material.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';

/// 🟢 الزر الأساسي — كبسولة مستديرة بتدرج + ظل + أنميشن ضغط
class PillButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final Color? color;
  final double height;
  final bool fullWidth;

  const PillButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.loading = false,
    this.color,
    this.height = 52,
    this.fullWidth = true,
  });

  @override
  State<PillButton> createState() => _PillButtonState();
}

class _PillButtonState extends State<PillButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final bg = widget.color ?? c.primary;
    final fg = widget.color == null ? c.onPrimary : Colors.white;
    final enabled = widget.onPressed != null && !widget.loading;

    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
      onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
      onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
      onTap: enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: AppTheme.micro,
        curve: Curves.easeOut,
        child: AnimatedContainer(
          duration: AppTheme.standard,
          curve: Curves.easeOutCubic,
          width: widget.fullWidth ? double.infinity : null,
          height: widget.height,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [bg, bg.withValues(alpha: 0.85)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            boxShadow: [
              BoxShadow(
                color: bg.withValues(alpha: 0.30),
                offset: const Offset(0, 6),
                blurRadius: 14,
              ),
            ],
          ),
          child: Center(
            child: widget.loading
                ? SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5, color: fg,
                    ),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (widget.icon != null) ...[
                        Icon(widget.icon, size: 20, color: fg),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        widget.label,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: fg,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

/// الزر الثانوي — Outline Pill
class OutlinePillButton extends StatefulWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color? color;

  const OutlinePillButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.color,
  });

  @override
  State<OutlinePillButton> createState() => _OutlinePillButtonState();
}

class _OutlinePillButtonState extends State<OutlinePillButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final fg = widget.color ?? c.textSecondary;
    return GestureDetector(
      onTapDown: widget.onPressed != null
          ? (_) => setState(() => _pressed = true)
          : null,
      onTapUp: widget.onPressed != null
          ? (_) => setState(() => _pressed = false)
          : null,
      onTapCancel: widget.onPressed != null
          ? () => setState(() => _pressed = false)
          : null,
      onTap: widget.onPressed,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: AppTheme.micro,
        child: AnimatedContainer(
          duration: AppTheme.standard,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 13),
          decoration: BoxDecoration(
            color: _pressed ? fg.withValues(alpha: 0.10) : Colors.transparent,
            borderRadius: BorderRadius.circular(AppTheme.radiusPill),
            border: Border.all(color: fg.withValues(alpha: 0.6), width: 1.5),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.icon != null) ...[
                Icon(widget.icon, size: 18, color: fg),
                const SizedBox(width: 8),
              ],
              Text(widget.label,
                  style: TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w500, color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}

/// ⭕ زر دائري صغير (أدوات)
class IconCircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? color;
  final double size;
  final String? tooltip;

  const IconCircleButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.color,
    this.size = 44,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final fg = color ?? c.text;
    final btn = Material(
      color: c.surfaceElevated.withValues(alpha: 0.7),
      shape: CircleBorder(
        side: BorderSide(color: c.border),
      ),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: SizedBox(
          width: size,
          height: size,
          child: Icon(icon, size: size * 0.45, color: fg),
        ),
      ),
    );
    if (tooltip == null) return btn;
    return Tooltip(message: tooltip!, child: btn);
  }
}
