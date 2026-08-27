import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/progress_ring.dart';
import 'focus_cycle.dart';

/// 🎯 إعداد جلسة التركيز — 3 عدادات + زران (فردي/جماعي)
/// القاعدة: الراحة 1-10 صارم (السيرفر بيرفض فوق 10)
class FocusSetupScreen extends StatefulWidget {
  const FocusSetupScreen({super.key});

  @override
  State<FocusSetupScreen> createState() => _FocusSetupScreenState();
}

class _FocusSetupScreenState extends State<FocusSetupScreen> {
  int _focusMin = 25;
  int _restMin = 5;
  int _cycles = 3;
  bool _starting = false;

  int get _total =>
      _focusMin * _cycles + _restMin * (_cycles - 1); // آخر دورة بلا راحة

  Future<void> _start({bool group = false}) async {
    setState(() => _starting = true);
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.focusStart, body: {
        'focusMin': _focusMin,
        'restMin': _restMin,
        'cycles': _cycles,
        'type': group ? 'PULSE' : 'SOLO',
      });
      final sessionId = (res['session'] ?? res)['id']?.toString();
      if (mounted && sessionId != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => FocusSessionScreen(
              sessionId: sessionId,
              focusMin: _focusMin,
              restMin: _restMin,
              cycles: _cycles,
            ),
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['message'] ?? 'حصل خطأ')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(humanError(e, fallback: 'مقدرناش نبدأ الجلسة'))),
        );
      }
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      appBar: AppBar(title: const Text('التركيز')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          children: [
            Text('ظبط وقتك وابدأ',
                style: TextStyle(fontSize: 18.5, color: c.textSecondary)),
            const SizedBox(height: 23),
            _stepper(c, 'وقت التركيز', _focusMin, 'دقيقة', 5, 120,
                (v) => setState(() => _focusMin = v)),
            const SizedBox(height: 14),
            _stepper(c, 'فترة الراحة', _restMin, 'دقائق', 1, 10,
                (v) => setState(() => _restMin = v),
                locked: true),
            const SizedBox(height: 14),
            _stepper(c, 'التكرار', _cycles, 'دورات', 1, 8,
                (v) => setState(() => _cycles = v)),
            const SizedBox(height: 23),
            // الملخص التلقائي
            GlassCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$_focusMin دقيقة تركيز × $_cycles + راحة $_restMin بينهم',
                      style: TextStyle(
                          fontSize: 17.5,
                          fontWeight: FontWeight.w600,
                          color: c.text)),
                  const SizedBox(height: 7),
                  Text('الإجمالي: $_total دقيقة — آخر دورة = لوبي 🏁',
                      style: TextStyle(color: c.accent, fontSize: 15)),
                ],
              ),
            ),
            const SizedBox(height: 27.5),
            PillButton(
              label: 'ابدأ جلسة فردية',
              icon: Icons.play_arrow_rounded,
              loading: _starting,
              onPressed: () => _start(),
            ),
            const SizedBox(height: 14),
            // زر الجلسة الجماعية — تحت (زي ما طلبت)
            OutlinePillButton(
              label: 'جلسة جماعية',
              icon: Icons.groups_rounded,
              onPressed: _starting ? null : () => _start(group: true),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepper(BalColors c, String label, int value, String unit,
      int min, int max, ValueChanged<int> onChange,
      {bool locked = false}) {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      decoration: BoxDecoration(
        color: c.surfaceElevated.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w500, color: c.textSecondary)),
                const SizedBox(height: 2.5),
                Text('$value $unit',
                    style: TextStyle(
                        fontSize: 23, fontWeight: FontWeight.w700, color: c.text)),
              ],
            ),
          ),
          if (locked)
            Tooltip(
              message: 'الحد الأقصى 10 دقائق — قاعدة صارمة',
              child: Icon(Icons.lock_rounded, size: 18.5, color: c.accent),
            ),
          _stepBtn(c, Icons.remove_rounded,
              value > min ? () => onChange(value - 1) : null),
          const SizedBox(width: 9),
          _stepBtn(c, Icons.add_rounded,
              value < max ? () => onChange(value + 1) : null),
        ],
      ),
    );
  }

  Widget _stepBtn(BalColors c, IconData icon, VoidCallback? onTap) {
    return IconCircleButton(
      icon: icon,
      size: 43.5,
      onPressed: onTap,
    );
  }
}

/// ⏱️ جلسة التركيز النشطة — مثبّتة على وقت السيرفر
///
/// ️ الباج اللي اتصلح هنا:
///
///    النسخة القديمة كانت بتعمل `Timer.periodic` وتطرح ثانية كل
///    ثانية، وخلاص. يعني:
///      · المستخدم يقفل التطبيق ١٠ دقايق → العدّاد بيقف معاه،
///        بيرجع يلاقي نفسه في نفس اللحظة والسيرفر شايفه في
///        الراحة التانية. رقمين مختلفين لنفس الجلسة.
///      · التطبيق يتقفل خالص → الجلسة «بتضيع» من ناحية الواجهة،
///        رغم إنها لسه ACTIVE في قاعدة البيانات.
///
///    الحل: الوقت بيتحسب من `startedAt` بتاعة السيرفر، مش من
///    عدّاد محلي. المؤقت بقى بيحرّك الرسمة بس. ولما التطبيق
///    يرجع من الخلفية بنسأل `/focus/active` تاني عشان نتأكد إن
///    الجلسة لسه شغالة (يمكن اتلغت من جهاز تاني).
class FocusSessionScreen extends StatefulWidget {
  final String sessionId;
  final int focusMin;
  final int restMin;
  final int cycles;

  const FocusSessionScreen({
    super.key,
    required this.sessionId,
    required this.focusMin,
    required this.restMin,
    required this.cycles,
  });

  @override
  State<FocusSessionScreen> createState() => _FocusSessionScreenState();
}

class _FocusSessionScreenState extends State<FocusSessionScreen>
    with WidgetsBindingObserver {
  Timer? _ticker;
  bool _completed = false;

  /// نقطة الارتساء: بداية الجلسة بحسب السيرفر.
  /// لو السيرفر لسه مردّش بنستخدم «دلوقتي» مؤقتاً.
  DateTime _startedAt = DateTime.now();
  bool _anchored = false;

  /// فرق ساعة الجهاز عن ساعة السيرفر — ممكن يكون دقايق.
  Duration _clockSkew = Duration.zero;

  FocusPhaseState get _state => FocusCycle.at(
        elapsed: DateTime.now().add(_clockSkew).difference(_startedAt),
        focusMin: widget.focusMin,
        restMin: widget.restMin,
        cycles: widget.cycles,
      );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _sync();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (_state.isDone && !_completed) _complete(auto: true);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    /// ️ رجع من الخلفية → نعيد الارتساء. من غير كده العدّاد
    ///    بيفضل على آخر قيمة شافها قبل ما يروح.
    if (state == AppLifecycleState.resumed) _sync();
  }

  /// سؤال السيرفر عن الجلسة الجارية.
  Future<void> _sync() async {
    try {
      final sentAt = DateTime.now();
      final res = await ApiClient.instance.get(ApiEndpoints.focusActive);
      final session = (res['session'] as Map?)?.cast<String, dynamic>();

      if (!mounted) return;

      /// مفيش جلسة نشطة؟ يبقى اتقفلت من مكان تاني —
      /// منعرضش عدّاد لجلسة مش موجودة.
      if (session == null) {
        if (_anchored && !_completed) {
          setState(() => _completed = true);
        }
        return;
      }

      final startedRaw = session['startedAt']?.toString();
      final started = startedRaw == null ? null : DateTime.tryParse(startedRaw);
      if (started == null) return;

      /// تصحيح فرق الساعة: السيرفر قال «فات elapsedMin دقيقة»،
      /// فنعرف ساعته دلوقتي، ونقارنها بساعتنا.
      final elapsedMin = (session['elapsedMin'] as num?)?.toInt();
      var skew = Duration.zero;
      if (elapsedMin != null) {
        final serverNow = started.add(Duration(minutes: elapsedMin));
        final roundTrip = DateTime.now().difference(sentAt);
        skew = serverNow.difference(sentAt.toUtc().add(roundTrip ~/ 2));
        // فرق أكبر من ساعة = غالباً منطقة زمنية مش انحراف — نتجاهله
        if (skew.abs() > const Duration(hours: 1)) skew = Duration.zero;
      }

      setState(() {
        _startedAt = started.toLocal();
        _clockSkew = skew;
        _anchored = true;
      });
    } catch (_) {
      /// ️ الشبكة وقعت؟ نكمّل بالعدّاد المحلي بدل ما نوقف الجلسة
      ///    في وش المستخدم. الأرقام هتترتّب أول ما الاتصال يرجع.
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _complete({bool auto = false}) async {
    _ticker?.cancel();
    if (mounted) setState(() => _completed = true);
    try {
      await ApiClient.instance
          .post(ApiEndpoints.focusComplete(widget.sessionId), body: {
        'clientReportedMin': widget.focusMin * widget.cycles,
      });
    } catch (e) {
      if (mounted && !auto) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(humanError(e, fallback: 'مقدرناش نحفظ الجلسة'))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    if (_completed) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.celebration_rounded, size: 92, color: c.accent),
                const SizedBox(height: 23),
                Text('أحسنت! الجلسة خلصت 🎉',
                    style: TextStyle(
                        fontSize: 27.5,
                        fontWeight: FontWeight.w700,
                        color: c.text)),
                const SizedBox(height: 9),
                Text('${widget.focusMin * widget.cycles} دقيقة تركيز حقيقي',
                    style: TextStyle(color: c.textSecondary)),
                const SizedBox(height: 27.5),
                PillButton(
                  label: 'تمام',
                  icon: Icons.check_rounded,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final st = _state;
    final secs = st.remaining.inSeconds;
    final mm = (secs ~/ 60).toString().padLeft(2, '0');
    final ss = (secs % 60).toString().padLeft(2, '0');

    return Scaffold(
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
                st.isRest
                    ? 'راحة 🧘'
                    : 'جلسة تركيز · دورة ${st.cycleNumber} من ${widget.cycles}',
                style: TextStyle(
                    fontSize: 18.5,
                    fontWeight: FontWeight.w600,
                    color: c.textSecondary)),
            const SizedBox(height: 27.5),
            ProgressRing(
              progress: st.progress,
              size: 276,
              strokeWidth: 14,
              color: st.isRest ? c.accent : c.primary,
              center: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$mm:$ss',
                      style: TextStyle(
                          fontSize: 60,
                          fontWeight: FontWeight.w700,
                          color: c.text,
                          fontFeatures: const [FontFeature.tabularFigures()])),
                  const SizedBox(height: 4.5),
                  Text(st.isRest ? 'راحة' : 'دقيقة تركيز',
                      style: TextStyle(color: c.textSecondary, fontSize: 15)),
                ],
              ),
            ),
            const SizedBox(height: 14),
            //  الوقت الكلي الفاضل — عشان المستخدم يعرف هو فين من الرحلة
            Text(
              'باقي ${st.totalRemaining.inMinutes} دقيقة على خلاص الجلسة',
              style: TextStyle(color: c.textDisabled, fontSize: 13),
            ),
            const SizedBox(height: 27.5),
            if (!st.isRest)
              PillButton(
                label: 'أنا هنا 👋',
                icon: Icons.touch_app_rounded,
                height: 66.5,
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('تمام يا بطل — كمّل تركيزك 💪')),
                  );
                },
              )
            else
              OutlinePillButton(
                label: 'تخطي الراحة',
                onPressed: () {
                  /// ️ تخطي الراحة = بنقدّم نقطة البداية للورا،
                  ///    مش بنصفّر عدّاد. كده الحساب يفضل متطابق
                  ///    مع السيرفر في الدورات اللي بعدها.
                  setState(() {
                    _startedAt = _startedAt.subtract(st.remaining);
                  });
                },
              ),
            const SizedBox(height: 23),
            TextButton(
              onPressed: _complete,
              child:
                  Text('إنهاء الجلسة', style: TextStyle(color: c.textDisabled)),
            ),
          ],
        ),
      ),
    );
  }
}
