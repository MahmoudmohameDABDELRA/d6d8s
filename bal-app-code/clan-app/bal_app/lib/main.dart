import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'core/app_state.dart';
import 'core/theme/app_theme.dart';
import 'screens/auth/auth_gate.dart';
import 'shell/main_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BalApp());
}

/// 🏔️ «بال» — رفيقك للقمة
class BalApp extends StatelessWidget {
  const BalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..bootstrap(),
      child: Consumer<AppState>(
        builder: (context, state, _) {
          return MaterialApp(
            title: 'بال',
            debugShowCheckedModeBanner: false,
            theme: AppTheme.light(),
            darkTheme: AppTheme.dark(),
            themeMode: state.isDark ? ThemeMode.dark : ThemeMode.light,
            // RTL عربي
            locale: const Locale('ar'),
            supportedLocales: const [Locale('ar'), Locale('en')],
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const RootGate(),
          );
        },
      ),
    );
  }
}

/// البوابة: لو مش مسجل → دخول/تسجيل · لو مسجل → الشل الرئيسي
class RootGate extends StatelessWidget {
  const RootGate({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.loading && state.user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!state.loggedIn) return const AuthGate();
    return const MainShell();
  }
}
