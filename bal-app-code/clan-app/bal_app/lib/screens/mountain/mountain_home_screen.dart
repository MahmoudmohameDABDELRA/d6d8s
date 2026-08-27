import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/progress_ring.dart';
import '../../widgets/ai_orb.dart';
import 'dream_setup_screen.dart';

/// 🏔️ شاشة الجبل — القلب: المسار + العقد + التقدم + الربط بالمهام
class MountainHomeScreen extends StatefulWidget {
  const MountainHomeScreen({super.key});

  @override
  State<MountainHomeScreen> createState() => _MountainHomeScreenState();
}

class _MountainHomeScreenState extends State<MountainHomeScreen> {
  List<Goal> _goals = [];
  bool _loading = true;
  String? _error;

  Goal? get _activeGoal {
    for (final g in _goals) {
      if (g.isActive && g.completedAt == null) return g;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.goals);
      final list = res['goals'] as List? ?? [];
      setState(() {
        _goals = list
            .whereType<Map<String, dynamic>>()
            .map(Goal.fromJson)
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = humanError(e, fallback: 'مقدرناش نجيب أهدافك');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: c.primary,
          backgroundColor: c.surfaceElevated,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _header(context, c)),
              if (_loading)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _errorView(context, c),
                )
              else if (_activeGoal == null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _emptyView(context, c),
                )
              else
                SliverToBoxAdapter(child: _mountainView(context, c, _activeGoal!)),
              const SliverToBoxAdapter(child: SizedBox(height: 126.5)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, BalColors c) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppTheme.spaceXxl, AppTheme.spaceLg, AppTheme.spaceXxl, 8),
      child: Row(
        children: [
          Text('جبل الأهداف',
              style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w700,
                  color: c.text)),
          const Spacer(),
          AIOrb(size: 46),
        ],
      ),
    );
  }

  // ── الحالة الفارغة: الجبل مستني أول خطوة ──
  Widget _emptyView(BuildContext context, BalColors c) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.landscape_rounded, size: 103.5, color: c.textDisabled),
            const SizedBox(height: 23),
            Text('الجبل مستني أول خطوة',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 25.5,
                    fontWeight: FontWeight.w600,
                    color: c.text)),
            const SizedBox(height: 9),
            Text('اكتب حلمك، والرفيق هيبني لك الطريق للقمة',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textSecondary)),
            const SizedBox(height: 32),
            PillButton(
              label: 'اعداد الخطة للقمة',
              icon: Icons.rocket_launch_rounded,
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DreamSetupScreen()),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorView(BuildContext context, BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded, size: 69, color: c.textDisabled),
            const SizedBox(height: 18.5),
            Text('مفيش اتصال بالباك',
                style: TextStyle(fontSize: 20.5, fontWeight: FontWeight.w600, color: c.text)),
            const SizedBox(height: 9),
            Text('تأكد إن السيرفر شغال على المنفذ 3000',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textSecondary)),
            const SizedBox(height: 23),
            OutlinePillButton(label: 'إعادة المحاولة', icon: Icons.refresh_rounded, onPressed: _load),
          ],
        ),
      ),
    );
  }

  // ── الجبل الحقيقي ──
  Widget _mountainView(BuildContext context, BalColors c, Goal goal) {
    final steps = goal.steps;
    final completed = steps.where((s) => s.isCompleted).length;
    final percent = steps.isEmpty ? 0 : (completed * 100 / steps.length).round();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // كارت التقدم
        Padding(
          padding: const EdgeInsets.fromLTRB(
              AppTheme.spaceXxl, AppTheme.spaceMd, AppTheme.spaceXxl, 0),
          child: GlassCard(
            child: Row(
              children: [
                ProgressRing(
                  progress: percent / 100,
                  size: 73.5,
                  strokeWidth: 7,
                  center: Text('$percent%',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: c.primary)),
                ),
                const SizedBox(width: 18.5),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(goal.title,
                          style: TextStyle(
                              fontSize: 19.5,
                              fontWeight: FontWeight.w600,
                              color: c.text),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 4.5),
                      Text(
                        steps.isEmpty
                            ? 'الجبل لسه بينبني...'
                            : 'المرحلة الحالية: ${steps.firstWhere((s) => !s.isCompleted, orElse: () => steps.last).title}',
                        style: TextStyle(color: c.textSecondary, fontSize: 15),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 9),
        // المسار + العقد (CustomPaint)
        SizedBox(
          height: 483,
          child: steps.isEmpty
              ? Center(
                  child: Text('مفيش خطوات — اضغط على الهدف لتوليد الرحلات',
                      style: TextStyle(color: c.textSecondary)))
              : _MountainPathPainter(steps: steps, onTapStep: _openStageSheet),
        ),
      ],
    );
  }

  // ── فتح تفاصيل المرحلة (Bottom Sheet) ──
  void _openStageSheet(GoalStep step) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _StageSheet(step: step),
    );
  }
}

// ═══════════════════════════════════════════════
//  رسام الجبل — المسار المتعرج + العقد
// ═══════════════════════════════════════════════
class _MountainPathPainter extends StatelessWidget {
  final List<GoalStep> steps;
  final ValueChanged<GoalStep> onTapStep;

  const _MountainPathPainter({required this.steps, required this.onTapStep});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final size = MediaQuery.of(context).size;
    final w = size.width;
    final h = 420.0;

    // نقاط المسار (من تحت لفوق)
    final pts = <Offset>[
      Offset(w * 0.22, h * 0.92),
      Offset(w * 0.40, h * 0.78),
      Offset(w * 0.24, h * 0.63),
      Offset(w * 0.44, h * 0.48),
      Offset(w * 0.28, h * 0.33),
      Offset(w * 0.50, h * 0.20),
      Offset(w * 0.72, h * 0.10),
    ];

    return CustomPaint(
      size: Size(w, h),
      painter: _MountainPainter(
        points: pts,
        steps: steps,
        colors: c,
      ),
      child: Stack(
        children: [
          for (var i = 0; i < steps.length && i < pts.length; i++)
            Positioned(
              left: pts[i].dx - 16,
              top: pts[i].dy - 16,
              child: _StageNode(
                step: steps[i],
                onTap: () => onTapStep(steps[i]),
              ),
            ),
          // علم القمة
          Positioned(
            left: pts[math.min(steps.length - 1, pts.length - 1)].dx + 8,
            top: pts[math.min(steps.length - 1, pts.length - 1)].dy - 46,
            child: Icon(Icons.flag_rounded, color: c.accent, size: 34.5),
          ),
        ],
      ),
    );
  }
}

class _MountainPainter extends CustomPainter {
  final List<Offset> points;
  final List<GoalStep> steps;
  final BalColors colors;

  _MountainPainter({
    required this.points,
    required this.steps,
    required this.colors,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..color = colors.primary.withValues(alpha: 0.35);

    // المسار
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 1; i < points.length; i++) {
      final mid = Offset(
        (points[i - 1].dx + points[i].dx) / 2,
        (points[i - 1].dy + points[i].dy) / 2 + 14, // انحناء
      );
      path.quadraticBezierTo(mid.dx, mid.dy, points[i].dx, points[i].dy);
    }
    canvas.drawPath(path, paint);

    // جزء المسار المكتمل (أخضر كامل)
    final doneCount = steps.where((s) => s.isCompleted).length;
    if (doneCount > 1) {
      final donePath = Path()
        ..moveTo(points.first.dx, points.first.dy);
      final upto = math.min(doneCount, points.length);
      for (var i = 1; i < upto; i++) {
        final mid = Offset(
          (points[i - 1].dx + points[i].dx) / 2,
          (points[i - 1].dy + points[i].dy) / 2 + 14,
        );
        donePath.quadraticBezierTo(mid.dx, mid.dy, points[i].dx, points[i].dy);
      }
      paint.color = colors.primary;
      canvas.drawPath(donePath, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MountainPainter oldDelegate) =>
      oldDelegate.steps != steps || oldDelegate.colors != colors;
}

/// عقدة المرحلة — 3 حالات (مكتمل/حالي/مقفول)
class _StageNode extends StatelessWidget {
  final GoalStep step;
  final VoidCallback onTap;

  const _StageNode({required this.step, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final isCurrent = !step.isCompleted;
    final size = isCurrent ? 32.0 : 24.0;

    Color bg;
    IconData icon;
    Color fg;
    if (step.isCompleted) {
      bg = c.primary;
      icon = Icons.check_rounded;
      fg = c.isDark ? const Color(0xFF0A1F14) : Colors.white;
    } else {
      bg = c.accent;
      icon = Icons.star_rounded;
      fg = const Color(0xFF0A1F14);
    }

    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: bg,
              boxShadow: isCurrent
                  ? [
                      BoxShadow(
                        color: c.accent.withValues(alpha: 0.5),
                        blurRadius: 14,
                        spreadRadius: 2,
                      ),
                    ]
                  : [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 4)],
            ),
            child: Icon(icon, size: size * 0.55, color: fg),
          ),
          const SizedBox(height: 3.5),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2.5),
            decoration: BoxDecoration(
              color: c.glassStrong,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              step.title.length > 14
                  ? '${step.title.substring(0, 14)}…'
                  : step.title,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                  color: isCurrent ? c.accent : c.textSecondary),
              maxLines: 1,
            ),
          ),
        ],
      ),
    );
  }
}

/// 📋 Sheet تفاصيل المرحلة — الرابط مع المهام
class _StageSheet extends StatelessWidget {
  final GoalStep step;
  const _StageSheet({required this.step});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Container(
      decoration: BoxDecoration(
        color: c.glassStrong,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                  width: 41.5, height: 4.5,
                  decoration: BoxDecoration(
                      color: c.textDisabled,
                      borderRadius: BorderRadius.circular(999))),
            ),
            const SizedBox(height: 23),
            Text('مرحلة: ${step.title}',
                style: TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w700,
                    color: c.text)),
            const SizedBox(height: 4.5),
            Text(
              step.isCompleted
                  ? '✓ مكتملة — ربنا يبارك فيك'
                  : 'المرحلة الحالية — من رحلة حلمك',
              style: TextStyle(color: step.isCompleted ? c.primary : c.accent, fontSize: 15),
            ),
            const SizedBox(height: 23),
            // زر فتح رحلة المرحلة (مربوطة بـ GET journey)
            PillButton(
              label: step.isCompleted ? 'شوف رحلة المرحلة' : 'رحلة المرحلة — الأيام والمهام',
              icon: Icons.route_rounded,
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => _StepJourneyScreen(step: step),
                  ),
                );
              },
            ),
            if (!step.isCompleted) ...[
              const SizedBox(height: 11.5),
              Text(
                'لما تكمل مهامك في قسم المهام → الجبل هيتقدم لوحده',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textSecondary, fontSize: 14),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// 🗺️ شاشة رحلة المرحلة — الأيام + المهام (GET journey)
class _StepJourneyScreen extends StatefulWidget {
  final GoalStep step;
  const _StepJourneyScreen({required this.step});

  @override
  State<_StepJourneyScreen> createState() => _StepJourneyScreenState();
}

class _StepJourneyScreenState extends State<_StepJourneyScreen> {
  Journey? _journey;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance
          .get(ApiEndpoints.stepJourney(widget.step.id));
      setState(() {
        _journey = Journey.fromJson(res['journey'] ?? {});
        _loading = false;
      });
    } catch (e) {
      setState(() {
        // ️ الرسالة القديمة كانت بلغة مبرمج («محتاج الـ AI»)
        _error = 'المرحلة دي لسه مافيهاش رحلة — اضغط عشان رفيقك يجهّزها';
        _loading = false;
      });
    }
  }

  Future<void> _generate() async {
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance
          .post(ApiEndpoints.stepJourney(widget.step.id));
      if (res['journey'] != null) {
        // نكمل: الموافقة
        await ApiClient.instance
            .post(ApiEndpoints.stepJourneyApprove(widget.step.id));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('الرحلة اتثبتت — مهمة اليوم اتولدت في المهام')),
          );
        }
        await _load();
      } else {
        setState(() {
          _error = res['message'] ?? 'الـ AI مشغول — حاول تاني';
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = humanError(e, fallback: 'مقدرناش نجيب أهدافك');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      appBar: AppBar(title: Text('رحلة: ${widget.step.title}')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _noJourney(c)
              : _journeyView(c),
    );
  }

  Widget _noJourney(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.route_rounded, size: 73.5, color: c.textDisabled),
            const SizedBox(height: 18.5),
            Text('مفيش رحلة لسه',
                style: TextStyle(fontSize: 20.5, fontWeight: FontWeight.w600, color: c.text)),
            const SizedBox(height: 9),
            Text('الرفيق هيبني خطة الأيام بالـ AI — وبعد موافقتك هتتولد مهامك في قسم المهام',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textSecondary)),
            const SizedBox(height: 27.5),
            PillButton(
              label: 'خلّي الرفيق يبني الرحلة 🚀',
              icon: Icons.auto_awesome_rounded,
              onPressed: _generate,
            ),
          ],
        ),
      ),
    );
  }

  Widget _journeyView(BalColors c) {
    final j = _journey!;
    return ListView(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      children: [
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(j.title,
                      style: TextStyle(
                          fontSize: 19.5, fontWeight: FontWeight.w600, color: c.text)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 11.5, vertical: 4.5),
                    decoration: BoxDecoration(
                      color: c.accent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('${j.percent}%',
                        style: TextStyle(color: c.accent, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              LinearProgressBar(progress: j.percent / 100),
              const SizedBox(height: 9),
              Text('${j.completedDays} من ${j.durationDays} يوم',
                  style: TextStyle(color: c.textSecondary, fontSize: 15)),
              if (j.lateDays > 0) ...[
                const SizedBox(height: 7),
                Text('متأخر $j.lateDays يوم — لسه تقدر تلحق 💪',
                    style: TextStyle(color: c.danger, fontSize: 15)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 18.5),
        for (final day in j.days)
          Container(
            margin: const EdgeInsets.only(bottom: 9),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: day.status == 'COMPLETED'
                  ? c.primary.withValues(alpha: 0.12)
                  : c.surfaceElevated.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              border: Border.all(
                  color: day.status == 'COMPLETED' ? c.primary.withValues(alpha: 0.4) : c.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 39,
                  height: 39,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: day.status == 'COMPLETED' ? c.primary : c.surface,
                    border: Border.all(
                        color: day.status == 'COMPLETED'
                            ? c.primary
                            : c.textDisabled),
                  ),
                  child: Icon(
                    day.status == 'COMPLETED'
                        ? Icons.check_rounded
                        : Icons.lock_outline_rounded,
                    size: 20.5,
                    color: day.status == 'COMPLETED'
                        ? (c.isDark ? const Color(0xFF0A1F14) : Colors.white)
                        : c.textDisabled,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('اليوم ${day.dayNumber}: ${day.title}',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                              color: c.text)),
                      if (day.description != null)
                        Text(day.description!,
                            style: TextStyle(color: c.textSecondary, fontSize: 14),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 23),
        Text(
          'مهمة كل يوم بتتولد تلقائياً في قسم المهام عند منتصف ليلك المحلي ⏰',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.textSecondary, fontSize: 14),
        ),
      ],
    );
  }
}
