import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/user_avatar.dart';
import '../../widgets/buttons.dart';
import '../focus/challenge_room_screen.dart';
import '../../widgets/skeleton.dart';

/// 👥 أعضاء العشيرة
///
/// بيوضح مين موجود دلوقتي (آخر ظهور خلال 5 دقايق) — عشان تعرف
/// مين تقدر تعمل معاه جلسة تركيز.
class ClanMembersScreen extends StatefulWidget {
  final Clan clan;

  const ClanMembersScreen({super.key, required this.clan});

  @override
  State<ClanMembersScreen> createState() => _ClanMembersScreenState();
}

class _ClanMembersScreenState extends State<ClanMembersScreen> {
  List<ClanMember> _members = [];
  bool _loading = true;
  bool _creating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res =
          await ApiClient.instance.get(ApiEndpoints.clanMembers(widget.clan.id));
      final list = res['members'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        _members = list
            .whereType<Map<String, dynamic>>()
            .map(ClanMember.fromJson)
            .toList();
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = humanError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final online = _members.where((m) => m.isOnline).length;

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text(widget.clan.name),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: _loading
              ? const MemberListSkeleton()
              : _error != null
                  ? _errorView(c)
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(
                          AppTheme.spaceXl, 0, AppTheme.spaceXl, 120),
                      children: [
                        _summary(c, online),
                        const SizedBox(height: AppTheme.spaceMd),
                        /// ️ التحدي لصاحب العشيرة الخاصة بس — السيرفر
                        ///    بيرفض غير كده بـ 400/403. عرض الزرار للكل
                        ///    معناه إن المستخدم يضغط ويترفض بلا سبب واضح.
                        if (widget.clan.isPrivate && widget.clan.isLeader)
                          _startChallengeButton(c)
                        else
                          _challengeHint(c),
                        const SizedBox(height: AppTheme.spaceLg),
                        ..._members.map((m) => _memberTile(c, m)),
                      ],
                    ),
        ),
      ),
    );
  }

  /// ️ من غير الزرار ده مفيش أي طريقة تبدأ بيها تحدي جماعي —
  ///    السيرفر كان جاهز والفيتشر مالوش مدخل خالص.
  Widget _startChallengeButton(BalColors c) {
    return PillButton(
      label: 'تحدي تركيز جماعي',
      icon: Icons.groups_rounded,
      loading: _creating,
      onPressed: _createChallenge,
    );
  }

  /// يشرح ليه الزرار مش موجود بدل ما يختفي بلا تفسير
  Widget _challengeHint(BalColors c) {
    final reason = !widget.clan.isPrivate
        ? 'التحديات الجماعية في العشائر الخاصة بس'
        : 'صاحب العشيرة بس اللي يقدر يبدأ تحدي';

    return Container(
      padding: const EdgeInsets.all(AppTheme.spaceMd),
      decoration: BoxDecoration(
        color: c.surface.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: c.textDisabled),
          const SizedBox(width: AppTheme.spaceSm),
          Expanded(
            child: Text(
              reason,
              style: TextStyle(fontSize: BalType.small, color: c.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _createChallenge() async {
    final cfg = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _ChallengeSetupDialog(),
    );
    if (cfg == null) return;

    setState(() => _creating = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      final res = await ApiClient.instance.post(
        ApiEndpoints.focusChallenge,
        body: {'clanId': widget.clan.id, ...cfg},
      );
      final id = res['challenge']?['id']?.toString();
      if (!mounted) return;
      setState(() => _creating = false);
      if (id == null) throw Exception('مفيش معرّف للتحدي');

      navigator.push(
        MaterialPageRoute(
          builder: (_) => ChallengeRoomScreen(challengeId: id, amHost: true),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      messenger.showSnackBar(
        SnackBar(
          content: Text(humanError(e, fallback: 'مقدرناش نعمل التحدي')),
        ),
      );
    }
  }

  Widget _summary(BalColors c, int online) {
    return GlassCard(
      child: Row(
        children: [
          _stat(c, '${_members.length}', 'عضو'),
          Container(width: 1, height: 37, color: c.border),
          _stat(c, '$online', 'موجود دلوقتي', color: c.primary),
        ],
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
              fontSize: BalType.heading,
              fontWeight: FontWeight.w700,
              color: color ?? c.text,
            ),
          ),
          const SizedBox(height: 2.5),
          Text(label, style: TextStyle(fontSize: BalType.small, color: c.textSecondary)),
        ],
      ),
    );
  }

  Widget _memberTile(BalColors c, ClanMember m) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
      child: GlassCard(
        padding: const EdgeInsets.all(AppTheme.spaceMd),
        child: Row(
          children: [
            UserAvatar(
              imageUrl: m.profileImage,
              name: m.username,
              radius: 23,
              isOnline: m.isOnline,
            ),
            const SizedBox(width: AppTheme.spaceMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          m.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: BalType.bodyLg,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        ),
                      ),
                      if (m.isLeader) ...[
                        const SizedBox(width: 6),
                        Icon(Icons.star_rounded, size: 16, color: c.accent),
                      ],
                    ],
                  ),
                  if (m.specialty != null)
                    Text(
                      m.specialty!,
                      style: TextStyle(fontSize: BalType.small, color: c.textSecondary),
                    ),
                ],
              ),
            ),
            if (m.isOnline)
              Text(
                'متاح',
                style: TextStyle(fontSize: BalType.small, color: c.primary),
              ),
          ],
        ),
      ),
    );
  }

  Widget _errorView(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded, size: 60, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text(_error!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: BalType.body, color: c.textSecondary)),
          ],
        ),
      ),
    );
  }
}

// ══════════════════════════════════════════════
//  إعداد التحدي
// ══════════════════════════════════════════════

class _ChallengeSetupDialog extends StatefulWidget {
  const _ChallengeSetupDialog();

  @override
  State<_ChallengeSetupDialog> createState() => _ChallengeSetupDialogState();
}

class _ChallengeSetupDialogState extends State<_ChallengeSetupDialog> {
  final _title = TextEditingController(text: 'نذاكر سوا');
  int _focusMin = 25;
  int _restMin = 5;
  int _cycles = 2;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  int get _total => _focusMin * _cycles + _restMin * (_cycles - 1);

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return AlertDialog(
      backgroundColor: c.surfaceElevated,
      title: const Text('تحدي تركيز'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _title,
              maxLength: 100,
              decoration: const InputDecoration(
                labelText: 'اسم التحدي',
                counterText: '',
              ),
            ),
            const SizedBox(height: AppTheme.spaceMd),
            _stepper(c, 'تركيز', '$_focusMin د', () {
              if (_focusMin > 5) setState(() => _focusMin -= 5);
            }, () {
              if (_focusMin < 120) setState(() => _focusMin += 5);
            }),
            /// ️ السيرفر بيرفض راحة أكتر من 10 دقايق — بنحترم الحد
            ///    هنا بدل ما نسيب المستخدم يختار ويترفض.
            _stepper(c, 'راحة', '$_restMin د', () {
              if (_restMin > 1) setState(() => _restMin -= 1);
            }, () {
              if (_restMin < 10) setState(() => _restMin += 1);
            }),
            _stepper(c, 'دورات', '$_cycles', () {
              if (_cycles > 1) setState(() => _cycles -= 1);
            }, () {
              if (_cycles < 8) setState(() => _cycles += 1);
            }),
            const SizedBox(height: AppTheme.spaceMd),
            Center(
              child: Text(
                'إجمالي $_total دقيقة',
                style: TextStyle(
                  fontSize: BalType.body,
                  fontWeight: FontWeight.w600,
                  color: c.primary,
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('إلغاء'),
        ),
        TextButton(
          onPressed: () {
            final t = _title.text.trim();
            if (t.isEmpty) return;
            Navigator.pop(context, {
              'title': t,
              'focusMin': _focusMin,
              'restMin': _restMin,
              'cycles': _cycles,
            });
          },
          child: const Text('اطلق'),
        ),
      ],
    );
  }

  Widget _stepper(
    BalColors c,
    String label,
    String value,
    VoidCallback onMinus,
    VoidCallback onPlus,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppTheme.spaceXs),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(fontSize: BalType.body, color: c.textSecondary)),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline_rounded),
            color: c.textSecondary,
            onPressed: onMinus,
          ),
          SizedBox(
            width: 55,
            child: Text(
              value,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: BalType.bodyLg,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded),
            color: c.primary,
            onPressed: onPlus,
          ),
        ],
      ),
    );
  }
}
