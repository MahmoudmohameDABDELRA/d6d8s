import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import 'ai_orb.dart';

/// 🤔 شاشة «الرفيق بيفكّر» — بديل الدايرة الدوّارة في نداءات الـ AI
///
/// ═══════════════════════════════════════════════════════════
/// ️ ليه دي مش رفاهية:
///
/// معالج الحلم فيه **٣ نداءات AI حقيقية** (توليد الأسئلة، بناء
/// الخطة، اعتمادها). كل واحد بياخد من ٥ لـ ٢٥ ثانية — والمهلة
/// في `ApiClient` ٣٠ ثانية.
///
/// النسخة الأولى كانت بتعرض `CircularProgressIndicator` فاضية
/// طول المدة دي. عشرين ثانية قدام دايرة بتلف **بلا أي كلام**
/// إحساسها إن التطبيق علّق. والمستخدم بيعمل حاجة من اتنين:
/// يضغط رجوع، أو يقفل التطبيق. الاتنين بيضيّعوا الحلم اللي كتبه.
///
/// ️ الدرس من التطبيقات اللي بتستنى نماذج لغوية (ChatGPT،
///    Notion AI، Linear): الانتظار الطويل لازم يبقى **مشروح
///    ومتدرّج**. المستخدم بيستحمل ٢٥ ثانية لو عارف بتحصل إيه،
///    وبيستحملش ٥ لو مش عارف.
///
/// الشاشة دي بتعمل تلات حاجات:
///   ١. بتقول **إيه اللي بيحصل** — نص بيتغيّر مع الوقت
///   ٢. بتوَرِّي إن فيه تقدّم — الكرة بتنبض والنص بيتبدّل
///   ٣. بتدّي **مخرج** بعد فترة — «ده بياخد وقت، تلغي؟»
///
/// ️ المراحل مش وهمية: كل واحدة بتوصف خطوة حقيقية بيعملها
///    السيرفر بالترتيب. مش شريط تقدّم مزيّف بيتحرّك على الفاضي.
/// ═══════════════════════════════════════════════════════════
class ThinkingView extends StatefulWidget {
  /// المراحل بالترتيب — كل واحدة بتظهر بعد الثواني المحددة
  final List<String> stages;

  /// كام ثانية لكل مرحلة
  final int secondsPerStage;

  /// بعد كام ثانية نعرض زرار الإلغاء؟
  ///
  /// ️ مش من أول لحظة: زرار «إلغاء» ظاهر فوراً بيقترح إن
  ///    العملية بطيئة قبل ما تبقى بطيئة فعلاً.
  final int offerCancelAfter;

  final VoidCallback? onCancel;

  const ThinkingView({
    super.key,
    required this.stages,
    this.secondsPerStage = 6,
    this.offerCancelAfter = 15,
    this.onCancel,
  });

  @override
  State<ThinkingView> createState() => _ThinkingViewState();
}

class _ThinkingViewState extends State<ThinkingView> {
  Timer? _tick;
  int _elapsed = 0;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed += 1);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// المرحلة الحالية — بتقف عند الأخيرة مبتلفّش
  int get _stageIndex {
    final i = _elapsed ~/ widget.secondsPerStage;
    return i >= widget.stages.length ? widget.stages.length - 1 : i;
  }

  bool get _showCancel =>
      widget.onCancel != null && _elapsed >= widget.offerCancelAfter;

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final text = Theme.of(context).textTheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            //  الكرة بتنبض — إشارة حياة مستمرة
            AIOrb(size: 92),
            const SizedBox(height: AppTheme.spaceXl),

            /// ️ الانتقال بين المراحل بيتلاشى مش بيقطع.
            ///    النص اللي بيتبدّل فجأة بيبان زي خطأ.
            AnimatedSwitcher(
              duration: AppTheme.transition,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0, 0.15),
                    end: Offset.zero,
                  ).animate(anim),
                  child: child,
                ),
              ),
              child: Text(
                widget.stages[_stageIndex],
                key: ValueKey(_stageIndex),
                textAlign: TextAlign.center,
                style: text.titleMedium?.copyWith(color: c.text),
              ),
            ),

            const SizedBox(height: AppTheme.spaceMd),

            //  نقط المراحل — بتوَرِّي إحنا فين من الرحلة
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(widget.stages.length, (i) {
                final done = i <= _stageIndex;
                return AnimatedContainer(
                  duration: AppTheme.standard,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: done ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: done ? c.primary : c.border,
                    borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                  ),
                );
              }),
            ),

            /// ️ المخرج. من غيره المستخدم اللي استنى ٢٥ ثانية
            ///    بيضغط رجوع — والحلم اللي كتبه بيضيع.
            if (_showCancel) ...[
              const SizedBox(height: AppTheme.spaceXxl),
              Text(
                'بياخد وقت أطول من المعتاد',
                style: text.bodySmall?.copyWith(color: c.textSecondary),
              ),
              const SizedBox(height: AppTheme.spaceSm),
              TextButton(
                onPressed: widget.onCancel,
                style: TextButton.styleFrom(minimumSize: const Size(0, 48)),
                child: Text(
                  'إلغاء',
                  style: text.bodyMedium?.copyWith(color: c.textSecondary),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
