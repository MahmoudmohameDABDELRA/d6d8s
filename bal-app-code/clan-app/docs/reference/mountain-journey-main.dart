
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

void main() {
  runApp(const MountainJourneyApp());
}

class MountainJourneyApp extends StatelessWidget {
  const MountainJourneyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mountain Journey',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF090B17),
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF8C4DFF),
          brightness: Brightness.dark,
        ),
      ),
      home: const MountainJourneyScreen(),
    );
  }
}

class MountainStage {
  final int number;
  final String title;
  final StageState state;

  const MountainStage({
    required this.number,
    required this.title,
    required this.state,
  });
}

enum StageState { completed, current, locked }

class MountainJourneyScreen extends StatefulWidget {
  const MountainJourneyScreen({super.key});

  @override
  State<MountainJourneyScreen> createState() => _MountainJourneyScreenState();
}

class _MountainJourneyScreenState extends State<MountainJourneyScreen>
    with TickerProviderStateMixin {
  late final AnimationController _ambientController;
  late final AnimationController _routeController;
  late final Animation<double> _routeProgress;

  int selectedStage = 4;
  int selectedNav = 0;

  final List<MountainStage> stages = const [
    MountainStage(number: 1, title: 'البداية', state: StageState.completed),
    MountainStage(number: 2, title: 'تحديد الاتجاه', state: StageState.completed),
    MountainStage(number: 3, title: 'بناء الأساس', state: StageState.completed),
    MountainStage(number: 4, title: 'الخطوة الحالية', state: StageState.current),
    MountainStage(number: 5, title: 'تطوير المهارات', state: StageState.locked),
    MountainStage(number: 6, title: 'خبرة عملية', state: StageState.locked),
    MountainStage(number: 7, title: 'بناء المشروع', state: StageState.locked),
    MountainStage(number: 8, title: 'القيادة', state: StageState.locked),
    MountainStage(number: 9, title: 'الاقتراب من القمة', state: StageState.locked),
    MountainStage(number: 10, title: 'القمة', state: StageState.locked),
  ];

  @override
  void initState() {
    super.initState();

    _ambientController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    )..repeat();

    _routeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );

    _routeProgress = CurvedAnimation(
      parent: _routeController,
      curve: Curves.easeOutCubic,
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _routeController.forward();
    });
  }

  @override
  void dispose() {
    _ambientController.dispose();
    _routeController.dispose();
    super.dispose();
  }

  MountainStage get currentStage =>
      stages.firstWhere((stage) => stage.number == selectedStage);

  void _openStage(MountainStage stage) {
    if (stage.state == StageState.locked) {
      _showSnack('هذه المرحلة لم تُفتح بعد.');
      return;
    }

    setState(() => selectedStage = stage.number);
    _showStageSheet(stage);
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFF19162A),
          content: Text(
            message,
            textAlign: TextAlign.right,
            textDirection: TextDirection.rtl,
          ),
        ),
      );
  }

  void _showStageSheet(MountainStage stage) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StageDetailsSheet(stage: stage),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        extendBody: true,
        body: Stack(
          children: [
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _ambientController,
                builder: (_, __) {
                  return _AnimatedBackdrop(
                    t: _ambientController.value,
                  );
                },
              ),
            ),
            SafeArea(
              bottom: false,
              child: CustomScrollView(
                physics: const BouncingScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
                      child: _TopHeader(
                        onMenu: () => _showMenu(),
                        onShare: () => _showSnack('يمكنك مشاركة رحلتك لاحقًا.'),
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(22, 12, 22, 0),
                      child: const _HeroTitle(),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
                      child: _ProgressSummary(
                        overallProgress: 0.42,
                        currentLevel: 4,
                        totalLevels: 10,
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: math.max(820, size.height * 1.06),
                      child: AnimatedBuilder(
                        animation: _routeProgress,
                        builder: (_, __) {
                          return _MountainSection(
                            stages: stages,
                            selectedStage: selectedStage,
                            progress: _routeProgress.value,
                            onStageTap: _openStage,
                          );
                        },
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(18, 0, 18, 172),
                      child: _CurrentStepCard(
                        stage: currentStage,
                        completedSessions: 2,
                        totalSessions: 3,
                        rewardXp: 50,
                        onTap: () => _showStageSheet(currentStage),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 14,
              right: 14,
              bottom: 14,
              child: _FloatingBottomNav(
                selectedIndex: selectedNav,
                onChanged: (index) {
                  if (index == 2) {
                    _showCreateSheet();
                    return;
                  }
                  setState(() => selectedNav = index);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) {
        return const _MenuSheet();
      },
    );
  }

  void _showCreateSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _CreateActionSheet(
        onAction: (label) {
          Navigator.pop(context);
          _showSnack('تم اختيار: $label');
        },
      ),
    );
  }
}

class _AnimatedBackdrop extends StatelessWidget {
  final double t;

  const _AnimatedBackdrop({required this.t});

  @override
  Widget build(BuildContext context) {
    final drift = math.sin(t * math.pi * 2) * 10;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: const [
            Color(0xFF0E0C20),
            Color(0xFF11102A),
            Color(0xFF081016),
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: 20 + drift,
            right: -60,
            child: _GlowOrb(size: 220, color: const Color(0xFF7E3BFF)),
          ),
          Positioned(
            top: 230 - drift * 0.6,
            left: -80,
            child: _GlowOrb(size: 180, color: const Color(0xFFB45CFF)),
          ),
          Positioned(
            bottom: 230 + drift,
            right: 70,
            child: _GlowOrb(
              size: 90,
              color: const Color(0xFF4B2FA5),
              opacity: 0.18,
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  final double size;
  final Color color;
  final double opacity;

  const _GlowOrb({
    required this.size,
    required this.color,
    this.opacity = 0.1,
  });

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: ImageFiltered(
        imageFilter: ui.ImageFilter.blur(
          sigmaX: size * 0.18,
          sigmaY: size * 0.18,
        ),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: opacity),
          ),
        ),
      ),
    );
  }
}

class _TopHeader extends StatelessWidget {
  final VoidCallback onMenu;
  final VoidCallback onShare;

  const _TopHeader({
    required this.onMenu,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const _Avatar(),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Text(
                    '👋 يا رفيق',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFF7F3FC),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              _GlassBadge(
                icon: Icons.local_fire_department_rounded,
                label: 'سلسلة التركيز 12 يوم',
              ),
            ],
          ),
        ),
        Row(
          children: [
            _CircleButton(
              icon: Icons.ios_share_rounded,
              onTap: onShare,
            ),
            const SizedBox(width: 8),
            _CircleButton(
              icon: Icons.more_horiz_rounded,
              onTap: onMenu,
            ),
          ],
        ),
      ],
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 68,
      height: 68,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFFB35CFF),
            Color(0xFF6E36FF),
          ],
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x665C29FF),
            blurRadius: 28,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Container(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: Color(0xFF272136),
        ),
        alignment: Alignment.center,
        child: const Text(
          '🧑🏻‍💼',
          style: TextStyle(fontSize: 31),
        ),
      ),
    );
  }
}

class _GlassBadge extends StatelessWidget {
  final IconData icon;
  final String label;

  const _GlassBadge({
    required this.icon,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Colors.white.withValues(alpha: 0.06),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.09),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 18,
            color: const Color(0xFFA86BFF),
          ),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFFE8E0F7),
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _CircleButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          width: 54,
          height: 54,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withValues(alpha: 0.05),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x24000000),
                blurRadius: 16,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Icon(
            icon,
            size: 22,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

class _HeroTitle extends StatelessWidget {
  const _HeroTitle();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: const [
        Text(
          'رحلتي للجبل',
          style: TextStyle(
            fontSize: 34,
            height: 1.0,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
          ),
        ),
        SizedBox(height: 10),
        Text(
          'كل خطوة تقرّبك من قمتك. ✨',
          style: TextStyle(
            fontSize: 15,
            color: Color(0xFFBDB3CE),
            height: 1.4,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

class _ProgressSummary extends StatelessWidget {
  final double overallProgress;
  final int currentLevel;
  final int totalLevels;

  const _ProgressSummary({
    required this.overallProgress,
    required this.currentLevel,
    required this.totalLevels,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MetricCard(
            title: 'تقدمك العام',
            child: Row(
              children: [
                SizedBox(
                  width: 88,
                  height: 88,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox.expand(
                        child: TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0, end: overallProgress),
                          duration: const Duration(milliseconds: 1200),
                          curve: Curves.easeOutCubic,
                          builder: (_, value, __) {
                            return CircularProgressIndicator(
                              value: value,
                              strokeWidth: 7,
                              strokeCap: StrokeCap.round,
                              backgroundColor:
                                  Colors.white.withValues(alpha: 0.06),
                              valueColor: const AlwaysStoppedAnimation(
                                Color(0xFF9F59FF),
                              ),
                            );
                          },
                        ),
                      ),
                      const Icon(
                        Icons.terrain_rounded,
                        size: 24,
                        color: Color(0xFFE8D8FF),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${(overallProgress * 100).round()}%',
                      style: const TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'المستوى الحالي',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.62),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$currentLevel / $totalLevels',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFFE6D5FF),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 92,
          child: _MetricCard(
            title: 'القمة',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.flag_rounded,
                  color: Color(0xFFFFD76B),
                  size: 27,
                ),
                const SizedBox(height: 12),
                const Text(
                  '10',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  'مرحلة',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.62),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _MetricCard({
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        color: Colors.white.withValues(alpha: 0.045),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.075),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x35000000),
            blurRadius: 30,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.56),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _MountainSection extends StatelessWidget {
  final List<MountainStage> stages;
  final int selectedStage;
  final double progress;
  final void Function(MountainStage stage) onStageTap;

  const _MountainSection({
    required this.stages,
    required this.selectedStage,
    required this.progress,
    required this.onStageTap,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;

        return Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: MountainPainter(
                  progress: progress,
                ),
              ),
            ),
            for (final stage in stages)
              _buildStageMarker(
                context,
                stage,
                width,
                height,
              ),
            Positioned(
              top: 22,
              left: 18,
              child: _SideActionButton(
                icon: Icons.route_rounded,
                label: 'خطة الجبل',
                onTap: () => _showSimpleSheet(
                  context,
                  title: 'خطة الجبل',
                  message:
                      'هنا تظهر مراحل الخطة الناتجة عن جلسة اكتشاف الهدف مع الرفيق.',
                ),
              ),
            ),
            Positioned(
              top: 110,
              left: 18,
              child: _SideActionButton(
                icon: Icons.track_changes_rounded,
                label: 'الهدف',
                onTap: () => _showSimpleSheet(
                  context,
                  title: 'هدفك',
                  message: 'الرؤية النهائية: بناء شركة والوصول إلى القمة.',
                ),
              ),
            ),
            Positioned(
              top: 198,
              left: 18,
              child: _SideActionButton(
                icon: Icons.emoji_events_rounded,
                label: 'الإنجازات',
                accent: const Color(0xFFFFC95B),
                onTap: () => _showSimpleSheet(
                  context,
                  title: 'الإنجازات',
                  message: 'هنا تظهر أوسمة التقدم وسلسلة الإنجازات.',
                ),
              ),
            ),
            Positioned(
              top: 286,
              left: 18,
              child: _SideActionButton(
                icon: Icons.query_stats_rounded,
                label: 'إحصائياتي',
                onTap: () => _showSimpleSheet(
                  context,
                  title: 'إحصائياتك',
                  message: 'التركيز، التقدم، الإنجازات وساعات العمل العميق.',
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStageMarker(
    BuildContext context,
    MountainStage stage,
    double width,
    double height,
  ) {
    final points = _stagePositions(width, height);
    final point = points[stage.number - 1];

    final isSelected = stage.number == selectedStage;
    final isCurrent = stage.state == StageState.current;

    return Positioned(
      left: point.dx - 34,
      top: point.dy - 24,
      child: GestureDetector(
        onTap: () => onStageTap(stage),
        child: AnimatedScale(
          scale: isSelected ? 1.03 : 1,
          duration: const Duration(milliseconds: 250),
          child: Row(
            textDirection: TextDirection.rtl,
            mainAxisSize: MainAxisSize.min,
            children: [
              _StageCircle(stage: stage),
              const SizedBox(width: 8),
              _StageLabel(
                stage: stage,
                isSelected: isSelected,
                isCurrent: isCurrent,
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Offset> _stagePositions(double width, double height) {
    // Coordinates are deliberately arranged as a serpentine hiking path.
    final baseX = width * 0.50;
    final stepHeight = height * 0.085;

    return [
      Offset(baseX - width * 0.18, height - 62),
      Offset(baseX + width * 0.02, height - stepHeight - 38),
      Offset(baseX - width * 0.02, height - stepHeight * 2 - 26),
      Offset(baseX + width * 0.16, height - stepHeight * 3 - 12),
      Offset(baseX - width * 0.10, height - stepHeight * 4 - 2),
      Offset(baseX + width * 0.12, height - stepHeight * 5 - 10),
      Offset(baseX - width * 0.02, height - stepHeight * 6 - 16),
      Offset(baseX + width * 0.17, height - stepHeight * 7 - 14),
      Offset(baseX + width * 0.03, height - stepHeight * 8 - 18),
      Offset(baseX + width * 0.06, 36),
    ];
  }
}

class _StageCircle extends StatelessWidget {
  final MountainStage stage;

  const _StageCircle({required this.stage});

  @override
  Widget build(BuildContext context) {
    final isCompleted = stage.state == StageState.completed;
    final isCurrent = stage.state == StageState.current;

    if (isCompleted) {
      return Container(
        width: 48,
        height: 48,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: Color(0xFF63A97A),
          boxShadow: [
            BoxShadow(
              color: Color(0x4463A97A),
              blurRadius: 16,
              spreadRadius: 2,
            ),
          ],
        ),
        child: const Icon(
          Icons.check_rounded,
          color: Colors.white,
          size: 27,
        ),
      );
    }

    if (isCurrent) {
      return TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.94, end: 1.06),
        duration: const Duration(milliseconds: 1200),
        curve: Curves.easeInOut,
        builder: (_, scale, __) {
          return Transform.scale(
            scale: scale,
            child: Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF954CFF),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x774F1FFF),
                    blurRadius: 26,
                    spreadRadius: 5,
                  ),
                ],
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.7),
                  width: 2,
                ),
              ),
              child: Center(
                child: Text(
                  '${stage.number}',
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          );
        },
      );
    }

    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF171526),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.16),
        ),
      ),
      child: const Icon(
        Icons.lock_rounded,
        size: 19,
        color: Color(0xFF7A7289),
      ),
    );
  }
}

class _StageLabel extends StatelessWidget {
  final MountainStage stage;
  final bool isSelected;
  final bool isCurrent;

  const _StageLabel({
    required this.stage,
    required this.isSelected,
    required this.isCurrent,
  });

  @override
  Widget build(BuildContext context) {
    final child = Container(
      constraints: const BoxConstraints(minWidth: 112),
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: isCurrent
            ? const Color(0xFF8E48F0)
            : Colors.black.withValues(alpha: 0.34),
        border: Border.all(
          color: isCurrent
              ? Colors.white.withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.08),
        ),
        boxShadow: isCurrent
            ? const [
                BoxShadow(
                  color: Color(0x554B13A6),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ]
            : null,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'مرحلة ${stage.number}',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: isSelected
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.85),
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            stage.title,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: isSelected
                  ? Colors.white.withValues(alpha: 0.95)
                  : Colors.white.withValues(alpha: 0.55),
              fontSize: 10,
            ),
          ),
        ],
      ),
    );

    return child;
  }
}

class MountainPainter extends CustomPainter {
  final double progress;

  MountainPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final paint = Paint()..style = PaintingStyle.fill;

    // Mist.
    final mistGradient = LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        const Color(0xFF7F54BB).withValues(alpha: 0.05),
        const Color(0xFF11152F).withValues(alpha: 0.00),
      ],
    );

    canvas.drawRect(
      rect,
      Paint()..shader = mistGradient.createShader(rect),
    );

    // Back mountain.
    final back = Path()
      ..moveTo(0, size.height * 0.72)
      ..lineTo(size.width * 0.18, size.height * 0.46)
      ..lineTo(size.width * 0.33, size.height * 0.61)
      ..lineTo(size.width * 0.48, size.height * 0.34)
      ..lineTo(size.width * 0.65, size.height * 0.55)
      ..lineTo(size.width * 0.82, size.height * 0.40)
      ..lineTo(size.width, size.height * 0.68)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    paint.shader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        Color(0xFF211C42),
        Color(0xFF0C1224),
      ],
    ).createShader(rect);

    canvas.drawPath(back, paint);

    // Main mountain.
    final mountain = Path()
      ..moveTo(size.width * 0.10, size.height * 0.90)
      ..lineTo(size.width * 0.23, size.height * 0.70)
      ..lineTo(size.width * 0.34, size.height * 0.64)
      ..lineTo(size.width * 0.48, size.height * 0.32)
      ..lineTo(size.width * 0.57, size.height * 0.12)
      ..lineTo(size.width * 0.64, size.height * 0.26)
      ..lineTo(size.width * 0.78, size.height * 0.57)
      ..lineTo(size.width * 0.94, size.height * 0.88)
      ..close();

    paint.shader = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [
        Color(0xFF473069),
        Color(0xFF251D49),
        Color(0xFF111A29),
      ],
      stops: [0.0, 0.5, 1.0],
    ).createShader(rect);

    canvas.drawPath(mountain, paint);

    // Snow/peak highlight.
    final peak = Path()
      ..moveTo(size.width * 0.48, size.height * 0.32)
      ..lineTo(size.width * 0.57, size.height * 0.12)
      ..lineTo(size.width * 0.64, size.height * 0.26)
      ..lineTo(size.width * 0.58, size.height * 0.22)
      ..lineTo(size.width * 0.52, size.height * 0.34)
      ..close();

    paint.shader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [
        Color(0xFFD9B8FF),
        Color(0xFF6A48A5),
      ],
    ).createShader(rect);

    canvas.drawPath(peak, paint);

    // Hiking route.
    final route = Path()
      ..moveTo(size.width * 0.34, size.height * 0.88)
      ..cubicTo(
        size.width * 0.58,
        size.height * 0.80,
        size.width * 0.23,
        size.height * 0.72,
        size.width * 0.52,
        size.height * 0.64,
      )
      ..cubicTo(
        size.width * 0.80,
        size.height * 0.55,
        size.width * 0.35,
        size.height * 0.47,
        size.width * 0.58,
        size.height * 0.38,
      )
      ..cubicTo(
        size.width * 0.72,
        size.height * 0.30,
        size.width * 0.56,
        size.height * 0.22,
        size.width * 0.57,
        size.height * 0.14,
      );

    _drawDashedShadowRoute(canvas, route);

    final metric = route.computeMetrics().toList();
    if (metric.isEmpty) return;

    final m = metric.first;
    final visible = m.length * progress;

    final routePath = m.extractPath(0, visible);
    final routePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 16
      ..shader = const LinearGradient(
        begin: Alignment.bottomLeft,
        end: Alignment.topRight,
        colors: [
          Color(0xFFC99BFF),
          Color(0xFF9A55FF),
          Color(0xFFD6ADFF),
        ],
      ).createShader(rect);

    canvas.drawPath(routePath, routePaint);

    // Thin inner highlight.
    final highlightPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeWidth = 2
      ..color = Colors.white.withValues(alpha: 0.55);

    canvas.drawPath(routePath, highlightPaint);

    // Flag at peak.
    final flagX = size.width * 0.57;
    final flagY = size.height * 0.115;
    final pole = Paint()
      ..color = const Color(0xFFF5F0FF)
      ..strokeWidth = 2.5;

    canvas.drawLine(
      Offset(flagX, flagY),
      Offset(flagX, flagY + 38),
      pole,
    );

    final flag = Path()
      ..moveTo(flagX, flagY)
      ..lineTo(flagX + 30, flagY + 6)
      ..lineTo(flagX, flagY + 16)
      ..close();

    canvas.drawPath(
      flag,
      Paint()
        ..color = const Color(0xFFC17AFF)
        ..style = PaintingStyle.fill,
    );
  }

  void _drawDashedShadowRoute(Canvas canvas, Path route) {
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 18
      ..strokeCap = StrokeCap.round
      ..color = const Color(0x4D6B50A4);

    for (final metric in route.computeMetrics()) {
      const dash = 12.0;
      const gap = 18.0;
      double distance = 0;

      while (distance < metric.length) {
        final length = math.min(dash, metric.length - distance);
        canvas.drawPath(
          metric.extractPath(distance, distance + length),
          paint,
        );
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant MountainPainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

class _SideActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color accent;

  const _SideActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = const Color(0xFF9A5BFF),
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          width: 112,
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            color: Colors.white.withValues(alpha: 0.05),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x27000000),
                blurRadius: 18,
                offset: Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 23,
                color: accent,
              ),
              const SizedBox(height: 7),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentStepCard extends StatelessWidget {
  final MountainStage stage;
  final int completedSessions;
  final int totalSessions;
  final int rewardXp;
  final VoidCallback onTap;

  const _CurrentStepCard({
    required this.stage,
    required this.completedSessions,
    required this.totalSessions,
    required this.rewardXp,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final progress = completedSessions / totalSessions;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(30),
        child: Ink(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(30),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                Color(0xFF211A36),
                Color(0xFF161327),
              ],
            ),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
            ),
            boxShadow: const [
              BoxShadow(
                color: Color(0x36000000),
                blurRadius: 30,
                offset: Offset(0, 16),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(
                    colors: [
                      Color(0xFF5B3D7F),
                      Color(0xFF221F38),
                    ],
                  ),
                ),
                alignment: Alignment.center,
                child: const Text(
                  '🎒',
                  style: TextStyle(fontSize: 32),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'المرحلة الحالية',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.55),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      stage.title == 'الخطوة الحالية'
                          ? 'بناء العادة الأساسية'
                          : stage.title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'أكمل $totalSessions جلسات تركيز هذا الأسبوع',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.60),
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: LinearProgressIndicator(
                              minHeight: 6,
                              value: progress,
                              backgroundColor:
                                  Colors.white.withValues(alpha: 0.06),
                              valueColor: const AlwaysStoppedAnimation(
                                Color(0xFFA155FF),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '$completedSessions/$totalSessions',
                          style: const TextStyle(
                            color: Color(0xFFD0B2FF),
                            fontWeight: FontWeight.w800,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '+$rewardXp XP',
                    style: const TextStyle(
                      color: Color(0xFFDAAEFF),
                      fontWeight: FontWeight.w900,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'مكافأة',
                    style: TextStyle(
                      color: Color(0xFF8D829D),
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FloatingBottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  const _FloatingBottomNav({
    required this.selectedIndex,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.person_outline_rounded, 'الملف'),
      (Icons.chat_bubble_outline_rounded, 'الرفيق'),
      (Icons.add_rounded, ''),
      (Icons.task_alt_rounded, 'المهام'),
      (Icons.terrain_rounded, 'الجبل'),
    ];

    return Container(
      height: 86,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(30),
        color: const Color(0xE7151726),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.08),
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x5A000000),
            blurRadius: 32,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        children: List.generate(
          items.length,
          (index) {
            final active = selectedIndex == index && index != 2;
            final item = items[index];

            if (index == 2) {
              return Expanded(
                child: Center(
                  child: GestureDetector(
                    onTap: () => onChanged(index),
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            Color(0xFF9A56FF),
                            Color(0xFF6B30F6),
                          ],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Color(0x664D1BFF),
                            blurRadius: 24,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.add_rounded,
                        size: 34,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              );
            }

            return Expanded(
              child: GestureDetector(
                onTap: () => onChanged(index),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(22),
                    color: active
                        ? const Color(0x262D174A)
                        : Colors.transparent,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        item.$1,
                        size: 22,
                        color: active
                            ? const Color(0xFFB96CFF)
                            : const Color(0xFF81788E),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        item.$2,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight:
                              active ? FontWeight.w800 : FontWeight.w600,
                          color: active
                              ? const Color(0xFFE9D9FF)
                              : const Color(0xFF81788E),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class StageDetailsSheet extends StatelessWidget {
  final MountainStage stage;

  const StageDetailsSheet({
    super.key,
    required this.stage,
  });

  @override
  Widget build(BuildContext context) {
    final isCompleted = stage.state == StageState.completed;
    final isCurrent = stage.state == StageState.current;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xFF201933),
            Color(0xFF0E0F19),
          ],
        ),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 46,
                height: 5,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withValues(alpha: 0.16),
                ),
              ),
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isCurrent
                        ? const Color(0xFF8B48EF)
                        : isCompleted
                            ? const Color(0xFF4E9A6B)
                            : const Color(0xFF242132),
                  ),
                  child: Icon(
                    isCompleted
                        ? Icons.check_rounded
                        : isCurrent
                            ? Icons.bolt_rounded
                            : Icons.lock_rounded,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'مرحلة ${stage.number}',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.56),
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        stage.title,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              isCurrent
                  ? 'هذه الخطوة الحالية في طريقك. من هنا يبدأ الجزء التالي من الرحلة.'
                  : isCompleted
                      ? 'أنجزت هذه المرحلة بالفعل ويمكنك مراجعة ما حققته فيها.'
                      : 'هذه المرحلة ستفتح تلقائيًا بعد إنهاء المرحلة السابقة.',
              style: TextStyle(
                fontSize: 13,
                height: 1.6,
                color: Colors.white.withValues(alpha: 0.70),
              ),
            ),
            const SizedBox(height: 18),
            if (isCurrent)
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    backgroundColor: const Color(0xFF8D48ED),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: const Text(
                    'ابدأ الخطوة',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              )
            else
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    side: BorderSide(
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: const Text('إغلاق'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _MenuSheet extends StatelessWidget {
  const _MenuSheet();

  @override
  Widget build(BuildContext context) {
    final actions = [
      (Icons.settings_outlined, 'إعدادات الرحلة'),
      (Icons.auto_awesome_outlined, 'اسأل رفيقك AI'),
      (Icons.history_rounded, 'تاريخ التقدم'),
      (Icons.share_outlined, 'مشاركة الرحلة'),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        color: Color(0xFF11121C),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 48,
              height: 5,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(99),
                color: Colors.white.withValues(alpha: 0.14),
              ),
            ),
            const SizedBox(height: 20),
            const Align(
              alignment: Alignment.centerRight,
              child: Text(
                'خيارات الرحلة',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(height: 12),
            for (final action in actions)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: Colors.white.withValues(alpha: 0.045),
                  ),
                  child: Icon(action.$1, color: const Color(0xFFB48AFF)),
                ),
                title: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    action.$2,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                onTap: () => Navigator.pop(context),
              ),
          ],
        ),
      ),
    );
  }
}

class _CreateActionSheet extends StatelessWidget {
  final ValueChanged<String> onAction;

  const _CreateActionSheet({
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.task_alt_rounded, 'مهمة جديدة'),
      (Icons.timer_outlined, 'جلسة تركيز'),
      (Icons.flag_outlined, 'هدف جديد'),
      (Icons.alarm_outlined, 'منبه'),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        color: Color(0xFF11121C),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 48,
              height: 5,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(99),
                color: Colors.white.withValues(alpha: 0.14),
              ),
            ),
            const SizedBox(height: 20),
            const Align(
              alignment: Alignment.centerRight,
              child: Text(
                'أنشئ شيئًا جديدًا',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(height: 10),
            for (final item in items)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF8C49ED).withValues(alpha: 0.12),
                  ),
                  child: Icon(
                    item.$1,
                    color: const Color(0xFFB06BFF),
                  ),
                ),
                title: Align(
                  alignment: Alignment.centerRight,
                  child: Text(
                    item.$2,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                onTap: () => onAction(item.$2),
              ),
          ],
        ),
      ),
    );
  }
}

void _showSimpleSheet(
  BuildContext context, {
  required String title,
  required String message,
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) {
      return Container(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 28),
        decoration: const BoxDecoration(
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          color: Color(0xFF11121C),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(99),
                    color: Colors.white.withValues(alpha: 0.14),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                message,
                style: TextStyle(
                  height: 1.6,
                  color: Colors.white.withValues(alpha: 0.70),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    backgroundColor: const Color(0xFF8D48ED),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                  child: const Text('تمام'),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
