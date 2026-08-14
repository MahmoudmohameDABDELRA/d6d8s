import 'package:flutter/material.dart';
import '../widgets/floating_nav_bar.dart';
import '../screens/mountain/mountain_home_screen.dart';
import '../screens/tasks/tasks_screen.dart';
import '../screens/chat/chat_screen.dart';
import '../screens/profile/profile_screen.dart';
import '../widgets/create_menu.dart';

/// 🧭 الشل الرئيسي — الناف بار الطافي + الـ Hero FAB + التنقل
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  static const _screens = [
    MountainHomeScreen(),
    TasksScreen(),
    ChatScreen(),
    ProfileScreen(),
  ];

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
