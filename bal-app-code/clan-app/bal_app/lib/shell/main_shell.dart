import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/checkin/checkin_watcher.dart';
import '../core/realtime/realtime_service.dart';
import '../core/alarm/native_alarm.dart';
import '../screens/alarm/wake_task_screen.dart';
import '../widgets/checkin_dialog.dart';
import '../widgets/challenge_invite_dialog.dart';
import '../widgets/floating_nav_bar.dart';
import '../screens/mountain/mountain_home_screen.dart';
import '../screens/tasks/tasks_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/clans/clans_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../widgets/create_menu.dart';

/// 🧭 الشل الرئيسي — الناف بار الطافي + الـ Hero FAB + التنقل
///
/// ⭐ وكمان: هنا بيعيش مراقب مواعيد المهام.
///
/// ليه هنا بالذات؟ لأن الشل موجود في **كل** الشاشات — فالبوب-أب
/// بيطلع للمستخدم مهما كان فاتح إيه (الجبل، المهام، الشات، البروفايل).
/// لو حطيناه في شاشة المهام، المستخدم اللي قاعد في الشات مكانش
/// هيتسأل — وده يفرّغ الفيتشر من معناه.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  int _index = 0;

  late final CheckInWatcher _watcher;
  late final RealtimeService _realtime;

  StreamSubscription<AlarmRinging>? _alarmSub;

  /// ⚠️ حارس ضد فتح بوب-أبين فوق بعض: الحلقة بتشتغل كل 30 ثانية،
  ///    ولو مهمتين خلصوا في نفس الوقت الاتنين هيتضافوا للطابور —
  ///    بس بنعرض واحد ولما يتقفل نعرض اللي بعده.
  bool _dialogOpen = false;

  /// ️ الترتيب لازم يطابق `FloatingNavBar.items` بالظبط.
  ///
  ///    الفهرس 2 هو الـ FAB في نص الناف بار — مش تبويب، فبيتنده
  ///    عليه `showCreateMenu` مش تغيير شاشة. بس `IndexedStack`
  ///    محتاج عنصر في المكان ده عشان الفهارس تفضل مظبوطة.
  ///
  ///    الباج القديم: الناف بار كان بيبعت الفهرس 4 لـ«أنا» والقايمة
  ///    فيها 4 عناصر بس (0-3) — الضغط على «أنا» كان بيرمي
  ///    RangeError ويكسر الشاشة.
  static const _screens = [
    MountainHomeScreen(),   // 0
    TasksScreen(),          // 1
    SizedBox.shrink(),      // 2 — مكان الـ FAB
    ClansScreen(),          // 3
    ProfileScreen(),        // 4
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _watcher = context.read<CheckInWatcher>();
    _watcher.addListener(_onWatcherChanged);
    _watcher.start();

    /// 📡 الوصول المستمر
    _realtime = context.read<RealtimeService>();
    _watcher.bindRealtime(_realtime);
    _realtime.connect();

    // أسئلة اتخزنت في السيرفر والتطبيق كان مقفول
    _watcher.syncPending();

    _wireAlarm();
  }

  /// ⏰ ربط المنبه الأصلي بالواجهة.
  ///
  /// ️ الحلقة اللي كانت ناقصة:
  ///
  ///    محرّك المنبه بيرن على مستوى النظام (خدمة أمامية + شاشة
  ///    فوق القفل) — ده شغّال من غير التطبيق أصلاً. لكن **مهمة
  ///    الصحيان** في Flutter، فلازم التطبيق يعرف إن المنبه رنّ
  ///    عشان يفتحها ويسجّل الاستيقاظ.
  ///
  ///    من غير الربط ده: المنبه بيرن، المستخدم بيقفله من
  ///    الشاشة الأصلية، والتطبيق مايعرفش حاجة — فمفيش تسجيل
  ///    ولا سلسلة ولا مهمة.
  void _wireAlarm() {
    if (!NativeAlarm.isSupported) return;

    _alarmSub = NativeAlarm.onRinging.listen((event) {
      if (!mounted) return;
      _openWakeTask(event.alarmId);
    });

    /// ️ المنبه ممكن يكون بيرن **دلوقتي** والتطبيق لسه بيفتح
    ///    (النظام هو اللي فتحه). الحدث فات علينا، فبنسأل.
    NativeAlarm.ringingAlarmId().then((id) {
      if (id != null && mounted) _openWakeTask(id);
    });

    /// شبكة أمان: نعيد الجدولة عند كل فتح للتطبيق.
    /// تحديث التطبيق أو تنظيف النظام ممكن يمسح المجدول.
    NativeAlarm.rescheduleAll();
  }

  Future<void> _openWakeTask(String alarmId) async {
    if (_dialogOpen) return;
    _dialogOpen = true;
    _watcher.pause();

    final solved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => WakeTaskScreen(alarmId: alarmId),
        fullscreenDialog: true,
      ),
    );

    /// ️ الصوت بيقف **بعد** الحل بس. ده جوهر الفكرة: لو وقف
    ///    بمجرد فتح الشاشة، المستخدم يقدر يرجع ينام وهو فاتح
    ///    الشاشة — والمنبه اتقفل من غير ما يصحى.
    if (solved == true) await NativeAlarm.dismiss(alarmId);

    _dialogOpen = false;
    _watcher.resume();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    /// ⚠️ المستخدم رجع للتطبيق بعد ما كان مقفول؟
    ///    ممكن يكون فات معاد مهمة وهو برة — نمسح فوراً بدل ما
    ///    نستنى الـ 30 ثانية الجاية، ونسحب أسئلة السيرفر كمان.
    if (state == AppLifecycleState.resumed) {
      _watcher.resume();
      _watcher.syncPending();

      /// ️ نظام التشغيل بيقفل السوكيت لما التطبيق يروح للخلفية.
      ///    من غير إعادة الاتصال، الرسايل بتبطل توصل والمستخدم
      ///    مش هيعرف ليه.
      if (!_realtime.isConnected) _realtime.connect();
    }
  }

  void _onWatcherChanged() {
    if (!mounted || _dialogOpen) return;

    /**
     * ️ الدعوة الأول.
     *
     *    التحدي بيبدأ في وقت محدد ودعوته ليها صلاحية — لو استنت
     *    ورا سؤال اطمئنان (اللي ممكن يفضل مأجّل)، التحدي هيبدأ
     *    من غير المستخدم. سؤال «عملت إيه امبارح؟» يستنى، الدعوة لأ.
     */
    final invite = _watcher.currentInvite;
    if (invite != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted || _dialogOpen) return;
        _dialogOpen = true;
        _watcher.pause();

        await showChallengeInvite(context, invite: invite);

        _dialogOpen = false;
        _watcher.dismissInvite();
        _watcher.resume();
      });
      return;
    }

    final prompt = _watcher.current;
    if (prompt == null) return;

    // ⚠️ ما نفتحش الديالوج جوه callback مباشرةً — ممكن يكون الفريم
    //    لسه بيتبني. addPostFrameCallback بيأجّلها لبعد ما يخلص.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted || _dialogOpen) return;

      _dialogOpen = true;
      _watcher.pause();

      await showCheckInDialog(context, prompt: prompt);

      _dialogOpen = false;
      _watcher.dismissCurrent();
      _watcher.resume();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _alarmSub?.cancel();
    _watcher.removeListener(_onWatcherChanged);
    _watcher.stop();
    _realtime.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: Stack(
        children: [
          IndexedStack(index: _index, children: _screens),
        ],
      ),
      bottomNavigationBar: FloatingNavBar(
        selectedIndex: _index,
        /// ️ الفهرس 2 هو الـ FAB — لو وصلنا بأي طريقة نتجاهله
        ///    بدل ما نعرض شاشة فاضية.
        onSelect: (i) {
          if (i == 2) return;
          setState(() => _index = i);
        },
        onHeroFab: () => showCreateMenu(context),
      ),
    );
  }
}
