import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/app_state.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import 'auth_gate.dart'; // CompanionNamingScreen

/// 🎯 اختيار الاهتمام (الرؤية: "اختار الاهتمام الخاص بك" — بيدخل عشيرة عامة)
class InterestScreen extends StatefulWidget {
  const InterestScreen({super.key});

  @override
  State<InterestScreen> createState() => _InterestScreenState();
}

class _InterestScreenState extends State<InterestScreen> {
  String? _selected;
  bool _saving = false;

  static const _interests = [
    (Icons.school_rounded, 'STUDY', 'دراسة', 'التعلم والمذاكرة'),
    (Icons.business_rounded, 'BUSINESS', 'بزنس', 'ريادة الأعمال والتجارة'),
    (Icons.code_rounded, 'TECH', 'تقنية', 'البرمجة والتقنية'),
    (Icons.fitness_center_rounded, 'HEALTH', 'صحة', 'الرياضة والصحة'),
    (Icons.palette_rounded, 'CREATIVE', 'إبداع', 'التصميم والفن'),
    (Icons.self_improvement_rounded, 'SELF_GROWTH', 'تطوير ذات', 'النمو الشخصي'),
  ];

  Future<void> _save() async {
    if (_selected == null) return;
    setState(() => _saving = true);
    final state = context.read<AppState>();
    final ok = await state.completeOnboarding(domain: _selected!);
    if (mounted) {
      if (ok) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const CompanionNamingScreen()),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.error ?? 'فشل الحفظ')),
        );
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text('اختار اهتمامك',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 27.5,
                      fontWeight: FontWeight.w700,
                      color: c.text)),
              const SizedBox(height: 9),
              Text('ده اللي هيجمعك بناس زيك في العشائر العامة',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.textSecondary, fontSize: 16)),
              const SizedBox(height: 32),
              for (final (icon, value, label, desc) in _interests) ...[
                GestureDetector(
                  onTap: () => setState(() => _selected = value),
                  child: AnimatedContainer(
                    duration: AppTheme.standard,
                    margin: const EdgeInsets.only(bottom: 11.5),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _selected == value
                          ? c.primary.withValues(alpha: 0.15)
                          : c.surfaceElevated.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                      border: Border.all(
                        color: _selected == value ? c.primary : c.border,
                        width: _selected == value ? 1.5 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(icon,
                            color: _selected == value ? c.primary : c.textSecondary,
                            size: 30),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(label,
                                  style: TextStyle(
                                      fontSize: 18.5,
                                      fontWeight: FontWeight.w600,
                                      color: c.text)),
                              Text(desc,
                                  style: TextStyle(
                                      color: c.textSecondary, fontSize: 14)),
                            ],
                          ),
                        ),
                        Icon(
                          _selected == value
                              ? Icons.radio_button_checked_rounded
                              : Icons.radio_button_off_rounded,
                          color: _selected == value ? c.primary : c.textDisabled,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              PillButton(
                label: 'متابعة',
                icon: Icons.arrow_forward_rounded,
                loading: _saving,
                onPressed: _selected == null ? null : _save,
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
