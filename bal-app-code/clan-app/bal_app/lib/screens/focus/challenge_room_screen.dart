import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/user_avatar.dart';
import 'focus_setup_screen.dart';

/// 🎯 غرفة تحدي التركيز — تستنى الناس وتبدأوا سوا
///
/// الفلو:
///   صاحب العشيرة يعمل تحدي → إشعار لكل الأعضاء → اللي يقبل يدخل
///   الغرفة دي → لما الناس تتجمع، صاحب التحدي يضغط «ابدأوا» →
///   كلهم يدخلوا الجلسة في نفس اللحظة.
///
/// ️ السيرفر كان جاهز بالكامل (6 نقاط) وماكانش ليه أي واجهة —
///    المستخدم مكانش يقدر يوصل للفيتشر ده خالص.
class ChallengeRoomScreen extends StatefulWidget {
  final String challengeId;

  /// أنا اللي عملت التحدي؟ (بيبان الزرار)
  final bool amHost;

  const ChallengeRoomScreen({
    super.key,
    required this.challengeId,
    this.amHost = false,
  });

  @override
  State<ChallengeRoomScreen> createState() => _ChallengeRoomScreenState();
}

class _ChallengeRoomScreenState extends State<ChallengeRoomScreen> {
  FocusChallenge? _challenge;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  /// ️ استطلاع كل 3 ثواني عشان تشوف الناس وهي بتدخل. الغرفة
  ///    الساكنة بتخلي المستخدم يحس إن محدش جاي ويخرج.
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final res = await ApiClient.instance
          .get(ApiEndpoints.focusChallengeGet(widget.challengeId));
      if (!mounted) return;

      final ch = FocusChallenge.fromJson(
        (res['challenge'] as Map?)?.cast<String, dynamic>() ?? {},
      );

      /// ️ التحدي بدأ؟ ندخل الجلسة تلقائياً — ده بالظبط معنى
      ///    «نبدأ سوا». استنى المستخدم يضغط زرار = مش سوا.
      if (ch.isActive && (_challenge?.isActive != true)) {
        _poll?.cancel();
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => FocusSessionScreen(
              sessionId: ch.id,
              focusMin: ch.focusMin,
              restMin: ch.restMin,
              cycles: ch.cycles,
            ),
          ),
        );
        return;
      }

      setState(() {
        _challenge = ch;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _loading = false;
        _error = humanError(e, fallback: 'مقدرناش نجيب التحدي');
      });
    }
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ApiClient.instance
          .post(ApiEndpoints.focusChallengeStart(widget.challengeId));
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(
        SnackBar(content: Text(humanError(e, fallback: 'مقدرناش نبدأ'))),
      );
    }
  }

  Future<void> _leave() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await ApiClient.instance
          .post(ApiEndpoints.focusChallengeLeave(widget.challengeId));
      if (!mounted) return;
      navigator.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      messenger.showSnackBar(
        SnackBar(content: Text(humanError(e, fallback: 'مقدرناش نخرجك'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: const Text('غرفة التحدي'),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _errorView(c)
                : _room(c),
      ),
    );
  }

  Widget _room(BalColors c) {
    final ch = _challenge!;

    if (ch.isOver) return _overView(c, ch);

    return ListView(
      padding: const EdgeInsets.all(AppTheme.spaceXl),
      children: [
        // ── تفاصيل التحدي ──
        GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                ch.title,
                style: TextStyle(
                  fontSize: BalType.titleLg,
                  fontWeight: FontWeight.w700,
                  color: c.text,
                ),
              ),
              if (ch.hostName != null) ...[
                const SizedBox(height: 4.5),
                Text(
                  'من ${ch.hostName}',
                  style: TextStyle(fontSize: BalType.small, color: c.textSecondary),
                ),
              ],
              const SizedBox(height: AppTheme.spaceLg),
              Row(
                children: [
                  _stat(c, '${ch.focusMin}د', 'تركيز'),
                  _divider(c),
                  _stat(c, '${ch.cycles}', 'دورات'),
                  _divider(c),
                  _stat(c, '${ch.totalMin}د', 'إجمالي', color: c.primary),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: AppTheme.spaceXl),

        // ── الناس ──
        Row(
          children: [
            Text(
              'مستنيين البداية',
              style: TextStyle(
                fontSize: BalType.bodyLg,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
            const SizedBox(width: AppTheme.spaceSm),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spaceSm, vertical: 2.5),
              decoration: BoxDecoration(
                color: c.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(AppTheme.radiusPill),
              ),
              child: Text(
                '${ch.peopleCount}',
                style: TextStyle(
                  fontSize: BalType.small,
                  fontWeight: FontWeight.w700,
                  color: c.primary,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppTheme.spaceMd),

        if (ch.peopleCount == 0)
          _waitingAlone(c)
        else
          Wrap(
            spacing: AppTheme.spaceMd,
            runSpacing: AppTheme.spaceMd,
            children: [
              for (final p in [...ch.active, ...ch.waiting])
                Column(
                  children: [
                    UserAvatar(
                      imageUrl: p.profileImage,
                      name: p.username,
                      radius: 27,
                    ),
                    const SizedBox(height: 4.5),
                    SizedBox(
                      width: 64,
                      child: Text(
                        p.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: BalType.caption, color: c.textSecondary),
                      ),
                    ),
                  ],
                ),
            ],
          ),

        const SizedBox(height: AppTheme.spaceXxxl),

        // ── الأزرار ──
        if (widget.amHost)
          PillButton(
            label: ch.peopleCount > 0 ? 'ابدأوا سوا' : 'ابدأ لوحدك',
            icon: Icons.play_arrow_rounded,
            loading: _busy,
            onPressed: _start,
          )
        else
          Column(
            children: [
              Container(
                padding: const EdgeInsets.all(AppTheme.spaceLg),
                decoration: BoxDecoration(
                  color: c.surface.withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                ),
                child: Row(
                  children: [
                    SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: c.textSecondary),
                    ),
                    const SizedBox(width: AppTheme.spaceMd),
                    Expanded(
                      child: Text(
                        'مستنيين ${ch.hostName ?? 'صاحب التحدي'} يبدأ',
                        style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

        const SizedBox(height: AppTheme.spaceMd),
        OutlinePillButton(
          label: 'اخرج',
          icon: Icons.logout_rounded,
          onPressed: _busy ? null : _leave,
        ),
      ],
    );
  }

  Widget _waitingAlone(BalColors c) {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spaceXl),
      decoration: BoxDecoration(
        color: c.surface.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: c.border),
      ),
      child: Column(
        children: [
          Icon(Icons.hourglass_empty_rounded, size: 37, color: c.textDisabled),
          const SizedBox(height: AppTheme.spaceSm),
          Text(
            'لسه محدش دخل',
            style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
          ),
          const SizedBox(height: 2.5),
          Text(
            'الإشعار وصلهم — استنى شوية',
            style: TextStyle(fontSize: BalType.small, color: c.textDisabled),
          ),
        ],
      ),
    );
  }

  Widget _overView(BalColors c, FocusChallenge ch) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              ch.status == 'FINISHED'
                  ? Icons.check_circle_rounded
                  : Icons.cancel_rounded,
              size: 70,
              color: ch.status == 'FINISHED' ? c.primary : c.textDisabled,
            ),
            const SizedBox(height: AppTheme.spaceLg),
            Text(
              ch.status == 'FINISHED' ? 'التحدي خلص 🎉' : 'التحدي اتلغى',
              style: TextStyle(
                fontSize: BalType.titleLg,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
            const SizedBox(height: AppTheme.spaceXl),
            OutlinePillButton(
              label: 'تمام',
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(BalColors c, String value, String label, {Color? color}) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: BalType.titleLg,
              fontWeight: FontWeight.w700,
              color: color ?? c.text,
            ),
          ),
          Text(label, style: TextStyle(fontSize: BalType.caption, color: c.textSecondary)),
        ],
      ),
    );
  }

  Widget _divider(BalColors c) =>
      Container(width: 1, height: 32, color: c.border);

  Widget _errorView(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded, size: 55, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text(_error!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: BalType.body, color: c.textSecondary)),
            const SizedBox(height: AppTheme.spaceXl),
            OutlinePillButton(
              label: 'جرّب تاني',
              icon: Icons.refresh_rounded,
              onPressed: () {
                setState(() => _loading = true);
                _load();
              },
            ),
          ],
        ),
      ),
    );
  }
}
