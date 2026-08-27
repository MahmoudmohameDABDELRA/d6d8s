/// ═══════════════════════════════════════════════════════════
///  حساب طور دورة التركيز — نسخة التطبيق
///
///  ️ لازم تطابق `src/utils/focusCycle.js` في السيرفر **بالظبط**.
///     فيه اختبار (`test/focus-cycle-parity.test.mjs`) بيشغّل
///     النسختين على آلاف اللحظات ويقارن رقم برقم — لو حد عدّل
///     واحدة بس، الاختبار بيقع.
///
///  ليه محتاجين النسختين؟
///     السيرفر هو الحقيقة، بس منقدرش نسأله كل ثانية — ده هيولّع
///     البطارية ويغرق الشبكة. فبنسأله مرة واحدة عند الفتح ونعرف
///     `startedAt`، وبعدين نحسب محلياً من نفس النقطة. النتيجة:
///     العدّاد سلس، ولو المستخدم قفل التطبيق ساعة ورجع بيلاقي
///     نفسه في المكان الصح — مش واقف عند اللحظة اللي قفل فيها.
library;

enum FocusPhase { focus, rest, done }

class FocusPhaseState {
  final FocusPhase phase;
  final int cycleNumber;
  final Duration remaining;
  final Duration phaseTotal;
  final Duration totalRemaining;

  const FocusPhaseState({
    required this.phase,
    required this.cycleNumber,
    required this.remaining,
    required this.phaseTotal,
    required this.totalRemaining,
  });

  bool get isRest => phase == FocusPhase.rest;
  bool get isDone => phase == FocusPhase.done;

  /// نسبة اللي فاضل من الطور الحالي — للحلقة الدائرية
  double get progress {
    if (phaseTotal.inSeconds <= 0) return 0;
    return (remaining.inSeconds / phaseTotal.inSeconds).clamp(0.0, 1.0);
  }
}

abstract final class FocusCycle {
  /// الطول الكامل للجلسة — آخر دورة بلا راحة
  static Duration total({
    required int focusMin,
    required int restMin,
    required int cycles,
  }) {
    final f = (focusMin < 1 ? 1 : focusMin) * 60;
    final r = restMin < 0 ? 0 : restMin * 60;
    final n = cycles < 1 ? 1 : cycles;
    return Duration(seconds: n * (f + r) - r);
  }

  /// الطور عند لحظة معيّنة من بداية الجلسة.
  static FocusPhaseState at({
    required Duration elapsed,
    required int focusMin,
    required int restMin,
    required int cycles,
  }) {
    final f = (focusMin < 1 ? 1 : focusMin) * 60;
    final r = restMin < 0 ? 0 : restMin * 60;
    final n = cycles < 1 ? 1 : cycles;

    final cycleLen = f + r;
    final totalSec = n * cycleLen - r;
    final t = elapsed.inSeconds < 0 ? 0 : elapsed.inSeconds;

    //  خلصت — مش بنلفّ من الأول (ده كان باج في السيرفر)
    if (t >= totalSec) {
      return FocusPhaseState(
        phase: FocusPhase.done,
        cycleNumber: n,
        remaining: Duration.zero,
        phaseTotal: Duration(seconds: f),
        totalRemaining: Duration.zero,
      );
    }

    final cycleIdx = (t ~/ cycleLen) < n - 1 ? (t ~/ cycleLen) : n - 1;
    final inCycle = t - cycleIdx * cycleLen;
    final isLast = cycleIdx == n - 1;

    //  آخر دورة كلها تركيز
    if (isLast || inCycle < f) {
      return FocusPhaseState(
        phase: FocusPhase.focus,
        cycleNumber: cycleIdx + 1,
        remaining: Duration(seconds: f - inCycle),
        phaseTotal: Duration(seconds: f),
        totalRemaining: Duration(seconds: totalSec - t),
      );
    }

    return FocusPhaseState(
      phase: FocusPhase.rest,
      cycleNumber: cycleIdx + 1,
      remaining: Duration(seconds: cycleLen - inCycle),
      phaseTotal: Duration(seconds: r),
      totalRemaining: Duration(seconds: totalSec - t),
    );
  }
}
