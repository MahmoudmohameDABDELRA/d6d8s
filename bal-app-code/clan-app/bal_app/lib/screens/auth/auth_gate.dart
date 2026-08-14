import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/app_state.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/ai_orb.dart';
import '../../shell/main_shell.dart';
import 'interest_screen.dart';

/// 🔐 بوابة الدخول — تسجيل/دخول (مربوطة بالباك حي)
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _register = false;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _username = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _username.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final state = context.read<AppState>();
    final ok = _register
        ? await state.register(
            username: _username.text.trim(),
            email: _email.text.trim(),
            password: _password.text,
            domain: 'TECH',
          )
        : await state.login(_email.text.trim(), _password.text);
    if (ok && mounted) {
      // لو مسجل جديد → اختيار الاهتمام ← تسمية الرفيق · لو موجود → الشل
      if (_register) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const InterestScreen()),
        );
      } else {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const MainShell()),
        );
      }
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.error ?? 'حصل خطأ')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final state = context.watch<AppState>();

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(AppTheme.spaceXxl),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // الشعار
                Container(
                  width: 87.5,
                  height: 87.5,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [c.primary, c.accent],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: c.primary.withValues(alpha: 0.4),
                        blurRadius: 24,
                      ),
                    ],
                  ),
                  child: Icon(Icons.terrain_rounded,
                      size: 46, color: c.isDark ? const Color(0xFF0A1F14) : Colors.white),
                ),
                const SizedBox(height: 23),
                Text('بال',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 39,
                        fontWeight: FontWeight.w700,
                        color: c.text)),
                const SizedBox(height: 4.5),
                Text('رفيقك للقمة 🏔️',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.textSecondary, fontSize: 16)),
                const SizedBox(height: 37),
                GlassCard(
                  padding: const EdgeInsets.all(AppTheme.spaceXl),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_register) ...[
                        TextField(
                          controller: _username,
                          style: TextStyle(color: c.text),
                          decoration: _dec(c, 'الاسم', Icons.person_rounded),
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextField(
                        controller: _email,
                        style: TextStyle(color: c.text),
                        keyboardType: TextInputType.emailAddress,
                        decoration: _dec(c, 'البريد الإلكتروني', Icons.email_rounded),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _password,
                        style: TextStyle(color: c.text),
                        obscureText: _obscure,
                        decoration: _dec(c, 'كلمة المرور', Icons.lock_rounded)
                            .copyWith(
                          suffixIcon: IconButton(
                            icon: Icon(
                                _obscure ? Icons.visibility_off : Icons.visibility,
                                color: c.textSecondary),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                      ),
                      const SizedBox(height: 23),
                      PillButton(
                        label: _register ? 'إنشاء الحساب' : 'دخول',
                        loading: state.loading,
                        onPressed: _submit,
                        icon: Icons.login_rounded,
                      ),
                      const SizedBox(height: 14),
                      TextButton(
                        onPressed: () => setState(() => _register = !_register),
                        child: Text(
                          _register
                              ? 'عندي حساب — دخول'
                              : 'مفيش حساب؟ — إنشاء حساب',
                          style: TextStyle(color: c.primary, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _dec(BalColors c, String label, IconData icon) =>
      InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: c.textSecondary),
        prefixIcon: Icon(icon, color: c.textSecondary),
        filled: true,
        fillColor: c.surface.withValues(alpha: 0.5),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide: BorderSide(color: c.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide: BorderSide(color: c.primary, width: 1.5),
        ),
      );
}

/// 💬 تسمية الرفيق (Onboarding بعد التسجيل) — PATCH /auth/companion
class CompanionNamingScreen extends StatefulWidget {
  const CompanionNamingScreen({super.key});

  @override
  State<CompanionNamingScreen> createState() => _CompanionNamingScreenState();
}

class _CompanionNamingScreenState extends State<CompanionNamingScreen> {
  final _name = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) return;
    setState(() => _saving = true);
    final state = context.read<AppState>();
    final ok = await state.setCompanionName(name);
    if (mounted) {
      if (ok) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const MainShell()),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.error ?? 'فشل الحفظ')),
        );
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AIOrb(size: 83),
              const SizedBox(height: 23),
              Text('بماذا تريد أن تناديني؟',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 25.5,
                      fontWeight: FontWeight.w600,
                      color: c.text)),
              const SizedBox(height: 9),
              Text('أنا رفيقك — سمّيني باي اسم تحبه، وهيبقى اسمي معاك في كل حتة',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.textSecondary, fontSize: 16)),
              const SizedBox(height: 32),
              TextField(
                controller: _name,
                style: TextStyle(color: c.text),
                textAlign: TextAlign.center,
                decoration: InputDecoration(
                  hintText: 'مثال: ليكم',
                  hintStyle: TextStyle(color: c.textDisabled),
                  filled: true,
                  fillColor: c.surface.withValues(alpha: 0.5),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                    borderSide: BorderSide(color: c.border),
                  ),
                ),
              ),
              const SizedBox(height: 23),
              PillButton(
                label: 'هو ده — يلا نبدأ 🚀',
                loading: _saving,
                onPressed: _save,
                icon: Icons.check_rounded,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
