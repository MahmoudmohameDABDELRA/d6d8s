import 'dart:async';

import 'package:flutter/foundation.dart';

import '../network/api_client.dart';
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

  /// المهام اللي اتسألت في الجلسة دي — ضد التكرار
  final Set<String> _asked = {};

  /// طابور الأسئلة المستنية عرض (البوب-أب بيعرض واحد في المرة)
  final List<CheckInPrompt> _queue = [];

  bool _paused = false;

  /// السؤال اللي المفروض يتعرض دلوقتي — أو null
  CheckInPrompt? get current => _queue.isEmpty ? null : _queue.first;

  bool get hasPending => _queue.isNotEmpty;

  /// يبدأ المراقبة
  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(_tick, (_) => _sweep());
    _sweep();
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

      for (final raw in list) {
        if (raw is! Map<String, dynamic>) continue;
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
    _timer?.cancel();
    super.dispose();
  }
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
