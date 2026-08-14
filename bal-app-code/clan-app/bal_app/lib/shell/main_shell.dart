import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/checkin/checkin_watcher.dart';
import '../widgets/checkin_dialog.dart';
import '../widgets/floating_nav_bar.dart';
import '../screens/mountain/mountain_home_screen.dart';
import '../screens/tasks/tasks_screen.dart';
import '../screens/chat/chat_screen.dart';
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

  /// ⚠️ حارس ضد فتح بوب-أبين فوق بعض: الحلقة بتشتغل كل 30 ثانية،
  ///    ولو مهمتين خلصوا في نفس الوقت الاتنين هيتضافوا للطابور —
  ///    بس بنعرض واحد ولما يتقفل نعرض اللي بعده.
  bool _dialogOpen = false;

  static const _screens = [
    MountainHomeScreen(),
    TasksScreen(),
    ChatScreen(),
    ProfileScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    _watcher = context.read<CheckInWatcher>();
    _watcher.addListener(_onWatcherChanged);
    _watcher.start();

    // أسئلة اتخزنت في السيرفر والتطبيق كان مقفول
    _watcher.syncPending();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    /// ⚠️ المستخدم رجع للتطبيق بعد ما كان مقفول؟
    ///    ممكن يكون فات معاد مهمة وهو برة — نمسح فوراً بدل ما
    ///    نستنى الـ 30 ثانية الجاية، ونسحب أسئلة السيرفر كمان.
    if (state == AppLifecycleState.resumed) {
      _watcher.resume();
      _watcher.syncPending();
    }
  }

  void _onWatcherChanged() {
    if (!mounted || _dialogOpen) return;
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
    _watcher.removeListener(_onWatcherChanged);
    _watcher.stop();
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
        onSelect: (i) => setState(() => _index = i),
        onHeroFab: () => showCreateMenu(context),
      ),
    );
  }
}
