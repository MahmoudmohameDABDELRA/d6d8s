import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'screens/focus_session_screen.dart';
import 'screens/focus_settings_screen.dart';
import 'screens/group_session_screen.dart';

void main() {
  runApp(const FocusApp());
}

class FocusApp extends StatelessWidget {
  const FocusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'جلسة تركيز',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      // Start on the settings screen (image 2) since it's the natural
      // entry point before a session starts; the other two are reachable
      // from here / via the routes below.
      initialRoute: '/settings',
      routes: {
        '/settings': (_) => const FocusSettingsScreen(),
        '/session': (_) => const FocusSessionScreen(),
        '/group': (_) => const GroupSessionScreen(),
      },
    );
  }
}
