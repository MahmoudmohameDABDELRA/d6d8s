import 'dart:async';

import 'package:flutter/foundation.dart';

import '../network/api_client.dart';
import '../realtime/realtime_service.dart';
import '../network/api_endpoints.dart';
import '../../models/models.dart';

/// ⏰ مراقب مواعيد المهام — القلب اللي بيفتح البوب-أب لوحده
///
/// الفكرة (قرار المالك):
///   التطبيق **نفسه عارف** إن مهمة الفطار من 5 لـ 6. فمش محتاج يستنى
///   السيرفر يقوله. الساعة 6 بالظبط يفتح البوب-أب ويسأل:
///   «إيه الأخبار؟ عملت إيه في (الفطار)؟»
///
/// ليه ده أحسن من إننا نعتمد على السيرفر لوحده:
///   · فوري بالثانية — مفيش تأخير استطلاع
///   · بيشتغل حتى لو النت فصل لحظتها (المهام محمّلة أصلاً)
///   · بيوفّر طلبات شبكة كتير
///
/// والسيرفر بيفضل **الاحتياطي**: لو التطبيق كان مقفول وقت المهمة،
/// الإشعار المخزّن هناك بيتسحب أول ما التطبيق يفتح (`syncPending`).
///
/// ⚠️ الحارس الأهم: الحلقة دي بتتنفذ كل 30 ثانية على مدار اليوم.
///    أي سؤال اتسأل مرة **ممنوع يتكرر** — عشان كده فيه `_asked`
///    (ذاكرة الجلسة) + فحص السيرفر عند الإرسال.
class CheckInWatcher extends ChangeNotifier {
  CheckInWatcher();

  /// كل كام نتحقق من المواعيد. 30 ثانية = دقة كافية بلا استنزاف بطارية.
  static const _tick = Duration(seconds: 30);

  /// ⚠️ نافذة السماح: لو المستخدم فتح التطبيق الساعة 6:40 والمهمة
  ///    خلصت 6:00، لسه منطقي نسأله. أبعد من ساعتين بقى سؤال متأخر
  ///    وغير مناسب — «عملت إيه في الفطار؟» الساعة 11 بالليل مزعج.
  static const _graceWindow = Duration(hours: 2);

  Timer? _timer;
  List<BalTask> _tasks = const [];

  /// ️ الاشتراكات في البث اللحظي — الإشعار بيوصل في نفس اللحظة
  ///    بدل ما يستنى `syncPending` عند فتح التطبيق.
  final List<StreamSubscription> _subs = [];

  /// المهام اللي اتسألت في الجلسة دي — ضد التكرار
  final Set<String> _asked = {};

  /// طابور الأسئلة المستنية عرض (البوب-أب بيعرض واحد في المرة)
  final List<CheckInPrompt> _queue = [];

  /// ️ دعوات تحدي التركيز — طابور منفصل عن الاطمئنان عن قصد.
  ///    الاتنين نوعين مختلفين من المقاطعة: الاطمئنان سؤال عن الماضي،
  ///    والدعوة قرار عن الحاضر ولها صلاحية. خلطهم في طابور واحد كان
  ///    هيخلي دعوة تستنى ورا سؤال المستخدم مأجّله.
  final List<ChallengeInvite> _invites = [];

  bool _paused = false;

  /// السؤال اللي المفروض يتعرض دلوقتي — أو null
  CheckInPrompt? get current => _queue.isEmpty ? null : _queue.first;

  bool get hasPending => _queue.isNotEmpty;

  /// أول دعوة تحدي مستنية — أو null
  ChallengeInvite? get currentInvite =>
      _invites.isEmpty ? null : _invites.first;

  void dismissInvite() {
    if (_invites.isNotEmpty) _invites.removeAt(0);
    notifyListeners();
  }

  /// يبدأ المراقبة
  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(_tick, (_) => _sweep());
    _sweep();
  }

  /// يوصّل البث اللحظي — الإشعارات توصل من السيرفر فوراً.
  ///
  /// ️ المسح المحلي **ما اتشالش**: التطبيق عارف مواعيد المهام
  ///    بنفسه، فالبوب-أب بيطلع في ميعاده حتى لو النت مقطوع.
  ///    السوكيت بيضيف الإشعارات اللي السيرفر بيولّدها (دعوات
  ///    التحدي مثلاً) — مش بديل عن المسح.
  void bindRealtime(RealtimeService realtime) {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();

    _subs.add(realtime.onNotification.listen(_ingestNotification));

    /// مهام النهاردة نزلت — نحدّث القائمة عشان المواعيد تتراقب
    _subs.add(realtime.onTasksGenerated.listen((_) => notifyListeners()));
  }

  /// يحوّل إشعار جاي من السوكيت لعنصر في الطابور المناسب
  void _ingestNotification(Map<String, dynamic> raw) {
    final data = raw['data'];
    if (data is! Map) return;

    final nid = raw['id']?.toString();
    if (nid == null) return;

    // دعوة تحدي
    if (data['action'] == 'FOCUS_CHALLENGE') {
      final cid = data['challengeId']?.toString();
      if (cid == null) return;
      if (_invites.any((i) => i.notificationId == nid)) return;

      _invites.add(ChallengeInvite(
        notificationId: nid,
        challengeId: cid,
        title: (raw['title'] ?? 'تحدي تركيز').toString(),
        body: (raw['body'] ?? '').toString(),
      ));
      notifyListeners();
      return;
    }

    // سؤال اطمئنان
    if (raw['type'] == 'TASK_CHECKIN' && data['canReply'] == true) {
      if (_queue.any((p) => p.notificationId == nid)) return;

      final taskId = data['taskId']?.toString();
      if (taskId != null) _asked.add(taskId);

      _queue.add(CheckInPrompt(
        task: _findTask(taskId) ??
            BalTask(
              id: taskId ?? '',
              title: (data['taskTitle'] ?? 'مهمتك').toString(),
            ),
        dueAt: DateTime.tryParse(raw['createdAt']?.toString() ?? '') ?? DateTime.now(),
        notificationId: nid,
        serverQuestion: raw['body']?.toString(),
      ));
      notifyListeners();
    }
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// إيقاف مؤقت — بيتنادى وقت ما البوب-أب يكون مفتوح فعلاً
  /// عشان ما نكوّمش أسئلة فوق بعض في وش المستخدم.
  void pause() => _paused = true;
  void resume() {
    _paused = false;
    _sweep();
  }

  /// تحديث قائمة المهام — بتتنادى من شاشة المهام بعد كل تحميل
  void updateTasks(List<BalTask> tasks) {
    _tasks = tasks;
    _sweep();
  }

  /// المستخدم خلص من السؤال ده (رد أو أجّله)
  void dismissCurrent() {
    if (_queue.isNotEmpty) _queue.removeAt(0);
    notifyListeners();
  }

  /// ══════════════════════════════════════════════
  ///  المسح: مين خلص وقته ومتسألش؟
  /// ══════════════════════════════════════════════
  void _sweep() {
    if (_paused) return;

    final now = DateTime.now();
    var added = false;

    for (final task in _tasks) {
      if (_asked.contains(task.id)) continue;
      if (_queue.any((p) => p.task.id == task.id)) continue;

      final end = _resolveEnd(task, now);
      if (end == null) continue;

      // لسه الوقت مجاش
      if (now.isBefore(end)) continue;

      // فات أوي — ما نسألش عن مهمة الصبح بالليل
      if (now.difference(end) > _graceWindow) {
        _asked.add(task.id); // نعلّمها عشان ما نفحصهاش تاني
        continue;
      }

      _queue.add(CheckInPrompt(task: task, dueAt: end));
      _asked.add(task.id);
      added = true;
    }

    if (added) notifyListeners();
  }

  /// حساب لحظة انتهاء المهمة من بياناتها.
  ///
  /// ⚠️ `endTime` جاي من الباك كنص "18:00" **بلا تاريخ**، فبنركّبه
  ///    على تاريخ المهمة (`dueDate`) أو على النهاردة لو مفيش تاريخ.
  ///    وبنحسبه بالتوقيت المحلي للجهاز — وده المطلوب بالظبط: المستخدم
  ///    قال «من 5 لـ 6» بساعته هو.
  static DateTime? _resolveEnd(BalTask task, DateTime now) {
    if (task.isCompleted) {
      // ⚠️ المهمة المنجزة لسه بتستاهل اطمئنان، بس مش قبل معادها.
      // بنكمل عادي — الفرق إن السؤال هيتصاغ بنبرة تهنئة في السيرفر.
    }

    final endText = task.endTime;
    if (endText == null || endText.isEmpty) return null;

    final parts = endText.split(':');
    if (parts.length < 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    // تاريخ المهمة — أو النهاردة
    DateTime day = DateTime(now.year, now.month, now.day);
    final due = task.dueDate;
    if (due != null && due.isNotEmpty) {
      final parsed = DateTime.tryParse(due);
      if (parsed != null) {
        final local = parsed.toLocal();
        day = DateTime(local.year, local.month, local.day);
      }
    }

    return DateTime(day.year, day.month, day.day, hour, minute);
  }

  /// ══════════════════════════════════════════════
  ///  الاحتياطي: أسئلة اتخزّنت والتطبيق مقفول
  /// ══════════════════════════════════════════════
  ///
  /// السيرفر كمان بيولّد سؤال الاطمئنان (جوب TASK_CHECKIN). لو التطبيق
  /// كان مقفول وقت المهمة، السؤال بيبقى مستنّي هناك — بنسحبه هنا.
  ///
  /// ⚠️ فايل-أوبن: فشل السحب ما يوقفش المراقبة المحلية.
  Future<void> syncPending() async {
    try {
      final res = await ApiClient.instance.get(
        ApiEndpoints.notifications,
        query: {'unreadOnly': 'true', 'limit': 10},
      );

      final list = res['notifications'] as List? ?? const [];
      var added = false;

      /// ️ الدعوات المعروفة — ما نعرضش نفس الدعوة مرتين
      final knownInvites = _invites.map((i) => i.notificationId).toSet();

      for (final raw in list) {
        if (raw is! Map<String, dynamic>) continue;

        // ═══ دعوة تحدي تركيز ═══
        final data0 = raw['data'];
        if (data0 is Map && data0['action'] == 'FOCUS_CHALLENGE') {
          final nid = raw['id']?.toString();
          final cid = data0['challengeId']?.toString();
          if (nid == null || cid == null) continue;
          if (knownInvites.contains(nid)) continue;

          _invites.add(ChallengeInvite(
            notificationId: nid,
            challengeId: cid,
            title: (raw['title'] ?? 'تحدي تركيز').toString(),
            body: (raw['body'] ?? '').toString(),
          ));
          added = true;
          continue;
        }

        if (raw['type'] != 'TASK_CHECKIN') continue;

        final data = raw['data'];
        if (data is! Map || data['canReply'] != true) continue;

        final id = raw['id']?.toString();
        if (id == null) continue;
        if (_queue.any((p) => p.notificationId == id)) continue;

        final taskId = data['taskId']?.toString();
        // ⚠️ لو السيرفر سأل عن المهمة دي، ما نسألش عنها محلياً كمان
        if (taskId != null) _asked.add(taskId);

        _queue.add(
          CheckInPrompt(
            task: _findTask(taskId) ??
                BalTask(
                  id: taskId ?? '',
                  title: (data['taskTitle'] ?? 'مهمتك').toString(),
                ),
            dueAt: DateTime.tryParse(raw['createdAt']?.toString() ?? '') ??
                DateTime.now(),
            notificationId: id,
            serverQuestion: raw['body']?.toString(),
          ),
        );
        added = true;
      }

      if (added) notifyListeners();
    } catch (e) {
      debugPrint('⚠️ تعذّر سحب أسئلة الاطمئنان المعلّقة: $e');
    }
  }

  BalTask? _findTask(String? id) {
    if (id == null) return null;
    for (final t in _tasks) {
      if (t.id == id) return t;
    }
    return null;
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _timer?.cancel();
    super.dispose();
  }
}

/// دعوة لتحدي تركيز جماعي
class ChallengeInvite {
  final String notificationId;
  final String challengeId;
  final String title;
  final String body;

  const ChallengeInvite({
    required this.notificationId,
    required this.challengeId,
    required this.title,
    required this.body,
  });
}

/// سؤال اطمئنان جاهز للعرض
class CheckInPrompt {
  final BalTask task;

  /// اللحظة اللي المهمة خلصت فيها
  final DateTime dueAt;

  /// معرّف الإشعار في السيرفر — null لو السؤال اتولد محلياً
  final String? notificationId;

  /// نص السؤال الجاي من السيرفر (لو موجود)
  final String? serverQuestion;

  const CheckInPrompt({
    required this.task,
    required this.dueAt,
    this.notificationId,
    this.serverQuestion,
  });
}
