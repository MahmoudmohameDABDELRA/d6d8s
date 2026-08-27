import 'package:flutter/material.dart';

import '../core/checkin/checkin_watcher.dart';
import '../core/network/api_client.dart';
import '../core/network/api_endpoints.dart';
import '../core/network/api_error.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import '../screens/focus/challenge_room_screen.dart';

/// 🎯 دعوة لتحدي تركيز — تقبل أو تعتذر
///
/// بتطلع لوحدها لما حد من عشيرتك يعمل تحدي.
///
/// ️ ليه بوب-أب مش إشعار في قائمة:
///    التحدي **بيبدأ في وقت محدد**. لو الدعوة استنت لحد ما المستخدم
///    يفتح شاشة الإشعارات، التحدي هيكون بدأ أو خلص. الدعوة ليها
///    صلاحية زمنية فلازم تقاطع.
Future<void> showChallengeInvite(
  BuildContext context, {
  required ChallengeInvite invite,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ChallengeInviteDialog(invite: invite),
  );
}

class _ChallengeInviteDialog extends StatefulWidget {
  final ChallengeInvite invite;

  const _ChallengeInviteDialog({required this.invite});

  @override
  State<_ChallengeInviteDialog> createState() => _ChallengeInviteDialogState();
}

class _ChallengeInviteDialogState extends State<_ChallengeInviteDialog> {
  bool _busy = false;
  String? _error;

  Future<void> _accept() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    final navigator = Navigator.of(context);
    try {
      await ApiClient.instance
          .post(ApiEndpoints.focusChallengeAccept(widget.invite.challengeId));
      if (!mounted) return;
      navigator.pop();
      navigator.push(
        MaterialPageRoute(
          builder: (_) => ChallengeRoomScreen(
            challengeId: widget.invite.challengeId,
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = humanError(e, fallback: 'مقدرناش ندخّلك');
      });
    }
  }

  Future<void> _decline() async {
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    try {
      await ApiClient.instance
          .post(ApiEndpoints.focusChallengeDecline(widget.invite.challengeId));
    } catch (_) {
      /// ️ فشل الاعتذار ما يحبسش المستخدم في البوب-أب. الأسوأ من
      ///    اعتذار مش متسجّل إنه يفضل قدام نافذة مش قادر يقفلها.
    }
    if (!mounted) return;
    navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(AppTheme.spaceXl),
      child: Container(
        decoration: BoxDecoration(
          color: c.surfaceElevated,
          borderRadius: BorderRadius.circular(AppTheme.radiusXl),
          border: Border.all(color: c.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              offset: const Offset(0, 12),
              blurRadius: 32,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── الرأس ──
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppTheme.spaceXl),
              decoration: BoxDecoration(
                color: c.accent.withValues(alpha: 0.12),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppTheme.radiusXl),
                ),
              ),
              child: Column(
                children: [
                  Container(
                    width: 55,
                    height: 55,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [c.accent, c.accent.withValues(alpha: 0.7)],
                      ),
                    ),
                    child: Icon(Icons.groups_rounded,
                        color: c.text, size: 28),
                  ),
                  const SizedBox(height: AppTheme.spaceMd),
                  Text(
                    widget.invite.title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 18.5,
                      fontWeight: FontWeight.w700,
                      color: c.text,
                    ),
                  ),
                ],
              ),
            ),

            // ── التفاصيل ──
            Padding(
              padding: const EdgeInsets.all(AppTheme.spaceXl),
              child: Text(
                widget.invite.body,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15.5,
                  height: 1.5,
                  color: c.textSecondary,
                ),
              ),
            ),

            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spaceXl, vertical: AppTheme.spaceSm),
                child: Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: c.danger),
                ),
              ),

            // ── الأزرار ──
            Padding(
              padding: const EdgeInsets.fromLTRB(AppTheme.spaceXl, 0,
                  AppTheme.spaceXl, AppTheme.spaceXl),
              child: Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: _busy ? null : _decline,
                      child: Text(
                        'مش دلوقتي',
                        style: TextStyle(color: c.textSecondary, fontSize: 15),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppTheme.spaceMd),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: c.primary,
                        foregroundColor: c.onPrimary,
                        padding: const EdgeInsets.symmetric(
                            vertical: AppTheme.spaceMd),
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusPill),
                        ),
                      ),
                      onPressed: _busy ? null : _accept,
                      child: _busy
                          ? SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2.5, color: c.onPrimary),
                            )
                          : const Text('أنا معاكم',
                              style: TextStyle(
                                  fontSize: 15.5, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
