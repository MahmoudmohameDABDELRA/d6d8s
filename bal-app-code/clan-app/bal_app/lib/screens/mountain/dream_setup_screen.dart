import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';

/// 🌱 إنشاء الحلم — الكويز + الخطة + الموافقة (مربوط بـ /goals/dream)
class DreamSetupScreen extends StatefulWidget {
  const DreamSetupScreen({super.key});

  @override
  State<DreamSetupScreen> createState() => _DreamSetupScreenState();
}

class _DreamSetupScreenState extends State<DreamSetupScreen> {
  final _dreamCtrl = TextEditingController();

  // مراحل المعالج
  int _phase = 0; // 0=الحلم · 1=الكويز · 2=الخطة · 3=تم
  List<Map<String, dynamic>> _questions = [];
  List<int> _answers = [];
  Map<String, dynamic>? _plan;
  String? _draftId;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _dreamCtrl.dispose();
    super.dispose();
  }

  /// 1) إنشاء الحلم → الكويز من الـ AI
  Future<void> _startDream() async {
    final title = _dreamCtrl.text.trim();
    if (title.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.dream, body: {
        'title': title,
      });
      final qs = res['questions'] as List? ?? [];
      if (qs.isEmpty) throw Exception(res['message'] ?? 'الـ AI مارجعش أسئلة');
      setState(() {
        _draftId = res['draftGoalId']?.toString();
        _questions = qs.whereType<Map<String, dynamic>>().toList();
        _answers = List.filled(qs.length, -1);
        _phase = 1;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  /// 2) إرسال الإجابات → خطة الأهداف
  Future<void> _submitQuiz() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final answers = [
        for (var i = 0; i < _questions.length; i++)
          {
            'question': _questions[i]['question'],
            'answer': (_questions[i]['options'] as List)[_answers[i]],
          }
      ];
      final res = await ApiClient.instance
          .post(ApiEndpoints.dreamAnswers(_draftId!), body: {'answers': answers});
      setState(() {
        _plan = res['plan'];
        _phase = 2;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  /// 3) الموافقة → الجبل يتفعل
  Future<void> _approve() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance
          .post(ApiEndpoints.dreamApprove(_draftId!));
      if (mounted) {
        setState(() {
          _phase = 3;
          _loading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message'] ?? 'الجبل اتبنى!')),
        );
      }
    } catch (e) {
      setState(() {
        _loading = false;
        _error = e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('حلم جديد')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _errorView()
                : switch (_phase) {
                    0 => _dreamPhase(),
                    1 => _quizPhase(),
                    2 => _planPhase(),
                    _ => _donePhase(),
                  },
      ),
    );
  }

  Widget _errorView() {
    final c = BalColors(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline_rounded, size: 56, color: c.danger),
            const SizedBox(height: 16),
            Text(_error ?? 'خطأ',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.text)),
            const SizedBox(height: 20),
            OutlinePillButton(
                label: 'رجوع',
                onPressed: () => setState(() {
                      _error = null;
                      _phase = 0;
                    })),
          ],
        ),
      ),
    );
  }

  // ── المرحلة 0: كتابة الحلم ──
  Widget _dreamPhase() {
    final c = BalColors(context);
    return Padding(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(Icons.landscape_rounded, size: 70, color: c.primary),
          const SizedBox(height: 16),
          Text('اكتب حلمك',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.text)),
          const SizedBox(height: 8),
          Text('مثال: عاوز أكون CEO · أتعلم Flutter · أكون مدير منتج',
              textAlign: TextAlign.center,
              style: TextStyle(color: c.textSecondary, fontSize: 13)),
          const SizedBox(height: 24),
          GlassCard(
            child: TextField(
              controller: _dreamCtrl,
              style: TextStyle(color: c.text),
              textAlign: TextAlign.center,
              decoration: InputDecoration(
                hintText: 'هدفك للقمة...',
                hintStyle: TextStyle(color: c.textDisabled),
                border: InputBorder.none,
              ),
            ),
          ),
          const SizedBox(height: 20),
          PillButton(
            label: 'اعداد الخطة للقمة',
            icon: Icons.rocket_launch_rounded,
            onPressed: _startDream,
          ),
        ],
      ),
    );
  }

  // ── المرحلة 1: الكويز ──
  Widget _quizPhase() {
    final c = BalColors(context);
    final q = _questions;
    return ListView(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      children: [
        Row(
          children: [
            Text('الرفيق بيسأل',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.text)),
            const Spacer(),
            Text('${q.length} أسئلة',
                style: TextStyle(color: c.textSecondary)),
          ],
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < q.length; i++) ...[
          GlassCard(
            margin: const EdgeInsets.only(bottom: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('سؤال ${i + 1}',
                    style: TextStyle(color: c.accent, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Text('${q[i]['question']}',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: c.text)),
                const SizedBox(height: 12),
                for (var j = 0; j < (q[i]['options'] as List).length; j++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: _OptionTile(
                      label: (q[i]['options'] as List)[j].toString(),
                      selected: _answers[i] == j,
                      onTap: () => setState(() => _answers[i] = j),
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        PillButton(
          label: 'اعرض خطتي',
          icon: Icons.auto_awesome_rounded,
          onPressed: _answers.contains(-1) ? null : _submitQuiz,
        ),
      ],
    );
  }

  // ── المرحلة 2: الخطة ──
  Widget _planPhase() {
    final c = BalColors(context);
    final steps = (_plan?['steps'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    return ListView(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      children: [
        Text('خطة الرفيق لحلمك',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: c.text)),
        const SizedBox(height: 4),
        Text('قسم حلمك لـ ${steps.length} حقول — من القاع للقمة',
            style: TextStyle(color: c.textSecondary)),
        const SizedBox(height: 16),
        GlassCard(
          child: Column(
            children: [
              for (var i = steps.length - 1; i >= 0; i--)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    children: [
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: i == steps.length - 1 ? c.accent : c.primary.withValues(alpha: 0.2),
                        ),
                        child: Center(
                          child: i == steps.length - 1
                              ? Icon(Icons.flag_rounded, size: 13, color: const Color(0xFF0A1F14))
                              : Text('${i + 1}',
                                  style: TextStyle(fontSize: 12, color: c.primary, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(steps[i]['title']?.toString() ?? '',
                            style: TextStyle(
                                fontSize: 15,
                                fontWeight: i == steps.length - 1 ? FontWeight.w600 : FontWeight.w400,
                                color: i == steps.length - 1 ? c.accent : c.text)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        PillButton(
          label: 'أنا موافق — ابنِ الجبل',
          icon: Icons.check_rounded,
          onPressed: _approve,
        ),
        const SizedBox(height: 10),
        Center(
          child: TextButton(
            onPressed: () => setState(() => _phase = 0),
            child: Text('عدّل الهدف', style: TextStyle(color: c.textSecondary)),
          ),
        ),
      ],
    );
  }

  // ── المرحلة 3: تم ──
  Widget _donePhase() {
    final c = BalColors(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.flag_rounded, size: 80, color: c.accent),
            const SizedBox(height: 20),
            Text('الجبل اتبنى! 🏔️',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.text)),
            const SizedBox(height: 8),
            Text('رجع للجبل وهتشوف خطتك من تحت للقمة',
                style: TextStyle(color: c.textSecondary)),
            const SizedBox(height: 24),
            PillButton(
              label: 'شوف الجبل',
              icon: Icons.terrain_rounded,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _OptionTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: AppTheme.standard,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? c.primary.withValues(alpha: 0.15) : c.surfaceElevated.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          border: Border.all(
              color: selected ? c.primary : c.border, width: selected ? 1.5 : 1),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked_rounded
                  : Icons.radio_button_off_rounded,
              size: 18,
              color: selected ? c.primary : c.textDisabled,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(label,
                  style: TextStyle(fontSize: 13.5, color: c.text)),
            ),
          ],
        ),
      ),
    );
  }
}
