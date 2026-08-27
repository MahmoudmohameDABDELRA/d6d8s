import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import 'clan_members_screen.dart';
import '../../widgets/skeleton.dart';

/// 🛡️ شاشة العشائر — الناس اللي زيك
///
/// العشيرة نوعين:
///   · **عامة** — بتتعيّن تلقائياً حسب اهتمامك، بلا مالك وبلا حد أعضاء
///   · **خاصة** — تعملها بنفسك وتدعو ناس بكود، 15 عضو كحد أقصى
///
/// السيرفر كان جاهز بالكامل (12 نقطة API) وماكانش ليه أي واجهة —
/// المستخدم مكانش يقدر يوصل للفيتشر ده خالص.
class ClansScreen extends StatefulWidget {
  const ClansScreen({super.key});

  @override
  State<ClansScreen> createState() => _ClansScreenState();
}

class _ClansScreenState extends State<ClansScreen> {
  List<Clan> _clans = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.myClans);
      final list = res['clans'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        _clans = list
            .whereType<Map<String, dynamic>>()
            .map(Clan.fromJson)
            .toList();
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _msg(e);
        _loading = false;
      });
    }
  }

  String _msg(Object e) {
    final s = e.toString();
    if (s.contains('SocketException') || s.contains('Connection refused')) {
      return 'مفيش اتصال بالسيرفر';
    }
    return s.replaceAll('Exception: ', '');
  }

  void _toast(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// انضمام تلقائي لعشيرة اهتمامك
  Future<void> _autoAssign() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.clansAutoAssign);
      final name = res['clan']?['name'] ?? 'عشيرتك';
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text('أهلاً بيك في $name 🎉')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(_msg(e))));
    }
  }

  Future<void> _createPrivate() async {
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => const _CreateClanDialog(),
    );
    if (created == true) await _load();
  }

  Future<void> _joinByCode() async {
    final joined = await showDialog<bool>(
      context: context,
      builder: (_) => const _JoinClanDialog(),
    );
    if (joined == true) await _load();
  }

  Future<void> _leave(Clan clan) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تسيب العشيرة؟'),
        content: Text('هتخرج من «${clan.name}».'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('اخرج'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ApiClient.instance.delete(ApiEndpoints.clanLeave(clan.id));
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('خرجت من العشيرة')));
      await _load();
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(_msg(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _header(c)),
              if (_loading)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: CardListSkeleton(count: 3, height: 104),
                )
              else if (_error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _errorView(c),
                )
              else if (_clans.isEmpty)
                SliverFillRemaining(hasScrollBody: false, child: _emptyView(c))
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                      AppTheme.spaceXl, 0, AppTheme.spaceXl, 120),
                  sliver: SliverList.builder(
                    itemCount: _clans.length,
                    itemBuilder: (_, i) => _clanCard(c, _clans[i]),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BalColors c) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.spaceXl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'العشائر',
            style: TextStyle(
              fontSize: BalType.display,
              fontWeight: FontWeight.w700,
              color: c.text,
            ),
          ),
          const SizedBox(height: 4.5),
          Text(
            'ناس زيك — بتتسلق نفس الجبل',
            style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
          ),
          const SizedBox(height: AppTheme.spaceXl),
          Row(
            children: [
              Expanded(
                child: OutlinePillButton(
                  label: 'اعمل عشيرة',
                  icon: Icons.add_rounded,
                  onPressed: _createPrivate,
                ),
              ),
              const SizedBox(width: AppTheme.spaceMd),
              Expanded(
                child: OutlinePillButton(
                  label: 'انضم بكود',
                  icon: Icons.vpn_key_rounded,
                  onPressed: _joinByCode,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _clanCard(BalColors c, Clan clan) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceMd),
      child: GlassCard(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ClanMembersScreen(clan: clan)),
        ),
        child: Row(
          children: [
            Container(
              width: 55,
              height: 55,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: clan.isPrivate
                      ? [c.accent, c.accent.withValues(alpha: 0.6)]
                      : [c.primary, c.primary.withValues(alpha: 0.6)],
                ),
              ),
              child: Icon(
                clan.isPrivate ? Icons.lock_rounded : Icons.public_rounded,
                color: clan.isPrivate ? c.text : c.onPrimary,
                size: 26,
              ),
            ),
            const SizedBox(width: AppTheme.spaceLg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          clan.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: BalType.bodyLg,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        ),
                      ),
                      if (clan.isLeader) ...[
                        const SizedBox(width: 6),
                        Icon(Icons.star_rounded, size: 17, color: c.accent),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4.5),
                  Row(
                    children: [
                      Icon(Icons.people_rounded,
                          size: 15, color: c.textSecondary),
                      const SizedBox(width: 4.5),
                      Text(
                        clan.maxMembers != null
                            ? '${clan.membersCount} / ${clan.maxMembers}'
                            : '${clan.membersCount} عضو',
                        style:
                            TextStyle(fontSize: BalType.small, color: c.textSecondary),
                      ),
                      const SizedBox(width: AppTheme.spaceMd),
                      Text(
                        clan.isPrivate ? 'خاصة' : 'عامة',
                        style: TextStyle(fontSize: BalType.small, color: c.textDisabled),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              icon: Icon(Icons.more_horiz_rounded, color: c.textSecondary),
              onPressed: () => _clanMenu(c, clan),
            ),
          ],
        ),
      ),
    );
  }

  void _clanMenu(BalColors c, Clan clan) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(AppTheme.radiusXl)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppTheme.spaceMd),
            ListTile(
              leading: Icon(Icons.people_rounded, color: c.text),
              title: const Text('الأعضاء'),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => ClanMembersScreen(clan: clan)),
                );
              },
            ),
            /// ️ كود الدعوة للعشائر الخاصة بس — العامة مالهاش كود
            if (clan.isPrivate && clan.inviteCode != null)
              ListTile(
                leading: Icon(Icons.vpn_key_rounded, color: c.accent),
                title: const Text('كود الدعوة'),
                subtitle: Text(clan.inviteCode!),
                onTap: () {
                  Navigator.pop(ctx);
                  _toast('الكود: ${clan.inviteCode}');
                },
              ),
            ListTile(
              leading: Icon(Icons.logout_rounded, color: c.danger),
              title: Text('اخرج من العشيرة',
                  style: TextStyle(color: c.danger)),
              onTap: () {
                Navigator.pop(ctx);
                _leave(clan);
              },
            ),
            const SizedBox(height: AppTheme.spaceMd),
          ],
        ),
      ),
    );
  }

  Widget _emptyView(BalColors c) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.groups_rounded, size: 80, color: c.textDisabled),
          const SizedBox(height: AppTheme.spaceLg),
          Text(
            'لسه مانضمتش لعشيرة',
            style: TextStyle(
              fontSize: BalType.titleLg,
              fontWeight: FontWeight.w600,
              color: c.text,
            ),
          ),
          const SizedBox(height: AppTheme.spaceSm),
          Text(
            'عشيرة اهتمامك مستنياك — ناس بتتسلق نفس الجبل',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
          ),
          const SizedBox(height: AppTheme.spaceXxl),
          PillButton(
            label: 'انضم لعشيرة اهتمامي',
            icon: Icons.auto_awesome_rounded,
            fullWidth: false,
            onPressed: _autoAssign,
          ),
        ],
      ),
    );
  }

  Widget _errorView(BalColors c) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.spaceXxl),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_rounded, size: 60, color: c.textDisabled),
          const SizedBox(height: AppTheme.spaceLg),
          Text(_error!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: BalType.body, color: c.textSecondary)),
          const SizedBox(height: AppTheme.spaceXl),
          OutlinePillButton(
            label: 'جرّب تاني',
            icon: Icons.refresh_rounded,
            onPressed: _load,
          ),
        ],
      ),
    );
  }
}

// ══════════════════════════════════════════════
//  إنشاء عشيرة خاصة
// ══════════════════════════════════════════════

class _CreateClanDialog extends StatefulWidget {
  const _CreateClanDialog();

  @override
  State<_CreateClanDialog> createState() => _CreateClanDialogState();
}

class _CreateClanDialogState extends State<_CreateClanDialog> {
  final _name = TextEditingController();
  final _desc = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.length < 3) {
      setState(() => _error = 'الاسم لازم يكون 3 حروف على الأقل');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final res = await ApiClient.instance.post(
        ApiEndpoints.clansPrivateCreate,
        body: {
          'name': name,
          if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
        },
      );
      if (!mounted) return;
      final code = res['clan']?['inviteCode'];
      Navigator.pop(context, true);
      if (code != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('اتعملت! كود الدعوة: $code')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString().contains('409')
            ? 'عندك عشيرة خاصة بالفعل — واحدة بس مسموحة'
            : humanError(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return AlertDialog(
      backgroundColor: c.surfaceElevated,
      title: const Text('عشيرة جديدة'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            enabled: !_busy,
            maxLength: 30,
            decoration: const InputDecoration(
              labelText: 'اسم العشيرة',
              counterText: '',
            ),
          ),
          const SizedBox(height: AppTheme.spaceMd),
          TextField(
            controller: _desc,
            enabled: !_busy,
            maxLength: 100,
            decoration: const InputDecoration(
              labelText: 'وصف (اختياري)',
              counterText: '',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppTheme.spaceMd),
            Text(_error!,
                style: TextStyle(color: c.danger, fontSize: BalType.small)),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('إلغاء'),
        ),
        TextButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('اعمل'),
        ),
      ],
    );
  }
}

// ══════════════════════════════════════════════
//  انضمام بكود
// ══════════════════════════════════════════════

class _JoinClanDialog extends StatefulWidget {
  const _JoinClanDialog();

  @override
  State<_JoinClanDialog> createState() => _JoinClanDialogState();
}

class _JoinClanDialogState extends State<_JoinClanDialog> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _error = 'اكتب الكود');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ApiClient.instance.post(
        ApiEndpoints.clansPrivateJoin,
        body: {'inviteCode': code},
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      final s = e.toString();
      setState(() {
        _busy = false;
        if (s.contains('404')) {
          _error = 'الكود ده مش موجود';
        } else if (s.contains('409')) {
          _error = 'انت عضو بالفعل';
        } else {
          _error = s.replaceAll('Exception: ', '');
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return AlertDialog(
      backgroundColor: c.surfaceElevated,
      title: const Text('انضم بكود دعوة'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _code,
            enabled: !_busy,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(
              labelText: 'كود الدعوة',
              hintText: 'ABC123',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppTheme.spaceMd),
            Text(_error!, style: TextStyle(color: c.danger, fontSize: BalType.small)),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('إلغاء'),
        ),
        TextButton(
          onPressed: _busy ? null : _submit,
          child: _busy
              ? const SizedBox(
                  width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('انضم'),
        ),
      ],
    );
  }
}
