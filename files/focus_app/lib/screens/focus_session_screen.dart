import 'dart:async';

import 'package:flutter/material.dart';

import '../models/task.dart';
import '../services/checkin_service.dart';
import '../theme/app_theme.dart';
import '../widgets/badge_pill.dart';
import '../widgets/bottom_nav_bar.dart';
import '../widgets/circular_timer.dart';
import '../widgets/pill_buttons.dart';

class FocusSessionScreen extends StatefulWidget {
  const FocusSessionScreen({
    super.key,
    this.focusMinutes = 30,
    this.taskTitle = 'رحلة تعلم Dart',
  });

  /// مدة جلسة التركيز بالدقائق (بتوصل من شاشة الإعدادات)
  final int focusMinutes;

  /// اسم المهمة اللي بيتركّز عليها المستخدم — بتروح للـ AI في الـ check-in
  final String taskTitle;

  @override
  State<FocusSessionScreen> createState() => _FocusSessionScreenState();
}

class _FocusSessionScreenState extends State<FocusSessionScreen> {
  late final int totalSeconds = widget.focusMinutes * 60;
  late int remainingSeconds = totalSeconds;

  Timer? _timer;
  bool _running = false;

  /// معرّف مؤقت للتجربة — في التطبيق الكامل بييجي من حساب المستخدم
  static const String _demoUserId = 'local-user';

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String get _formatted {
    final m = (remainingSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (remainingSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  double get _progress =>
      totalSeconds == 0 ? 0 : remainingSeconds / totalSeconds;

  void _start() {
    setState(() => _running = true);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (remainingSeconds > 1) {
          remainingSeconds -= 1;
        } else {
          remainingSeconds = 0;
          timer.cancel();
          _running = false;
          _onSessionComplete();
        }
      });
    });
  }

  void _pause() {
    _timer?.cancel();
    setState(() => _running = false);
  }

  /// لما الجلسة تخلص: نسأل المستخدم «عملت إيه؟» ونبعت للباكند
  Future<void> _onSessionComplete() async {
    final reply = await showDialog<String>(
      context: context,
      builder: (_) => const _CheckInDialog(),
    );
    if (reply == null || reply.trim().isEmpty) return;

    try {
      final aiReply = await CheckInService.sendCheckIn(
        task: AppTask(
          id: 'focus-${DateTime.now().millisecondsSinceEpoch}',
          title: widget.taskTitle,
          scheduledTime: DateTime.now(),
          durationMinutes: widget.focusMinutes,
          isDone: true,
        ),
        userReply: reply.trim(),
        userId: _demoUserId,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('رد رفيقك 🎉'),
          content: Text(aiReply),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('تمام'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ماقدرناش نوصل للسيرفر — تأكد إن الباكند شغال ($error)')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [AppColors.background, AppColors.backgroundGradientEnd],
              ),
            ),
            child: Column(
              children: [
                const SizedBox(height: 24),
                Text('جلسة تركيز', style: AppText.heading),
                const SizedBox(height: 6),
                Text('استعد — هتركز في مهمة واحدة', style: AppText.subheading),
                const SizedBox(height: 28),

                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: const [
                      BadgePill(label: '3', emoji: '🔥', accent: AppColors.textPrimary),
                      BadgePill(label: 'Sparks 120', emoji: '⭐', accent: AppColors.gold),
                    ],
                  ),
                ),

                const Spacer(),

                CircularTimerRing(
                  size: 280,
                  progress: _progress,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_formatted, style: AppText.timerDigits),
                      const SizedBox(height: 4),
                      Text('دقيقة تركيز', style: AppText.subheading),
                    ],
                  ),
                ),

                const Spacer(),

                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      CircleIconButton(
                        icon: _running ? Icons.pause : Icons.play_arrow,
                        onTap: _running ? _pause : _start,
                      ),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: PrimaryPillButton(
                            label: _running ? 'إيقاف مؤقت' : 'ابدأ التركيز',
                            onTap: _running ? _pause : _start,
                          ),
                        ),
                      ),
                      CircleIconButton(
                        icon: Icons.music_note_outlined,
                        onTap: () {},
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),

                // Chip المهمة الحالية
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.cardBorder),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('اليوم 2 من 7 · ${widget.taskTitle}', style: AppText.label),
                      const SizedBox(width: 10),
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: AppColors.cardBorder,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Icon(Icons.image_outlined,
                            size: 14, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 18),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: const AppBottomNavBar(
                    iconsOrder: [
                      Icons.person_outline,
                      Icons.chat_bubble_outline,
                      Icons.add,
                      Icons.check_circle_outline,
                      Icons.image_outlined,
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// بوكس سؤال «عملت في المهمة إيه؟» — بيرجّع نص الرد اللي كتبه المستخدم
class _CheckInDialog extends StatefulWidget {
  const _CheckInDialog();

  @override
  State<_CheckInDialog> createState() => _CheckInDialogState();
}

class _CheckInDialogState extends State<_CheckInDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    Navigator.of(context).pop(_controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: AlertDialog(
        title: const Text('خلصت الجلسة 🎉'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('عملت إيه في المهمة؟ واجهتك مشكلة؟'),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              autofocus: true,
              maxLength: 1000,
              decoration: const InputDecoration(
                hintText: 'اكتب ردك هنا...',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('مش دلوقتي'),
          ),
          FilledButton(
            onPressed: _submit,
            child: const Text('بعت لرفيقي'),
          ),
        ],
      ),
    );
  }
}
