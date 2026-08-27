import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/glass_card.dart';

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
        _error = e.toString().replaceAll('Exception: ', '');
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
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? _errorView(c)
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(
                          AppTheme.spaceXl, 0, AppTheme.spaceXl, 120),
                      children: [
                        _summary(c, online),
                        const SizedBox(height: AppTheme.spaceLg),
                        ..._members.map((m) => _memberTile(c, m)),
                      ],
                    ),
        ),
      ),
    );
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
              fontSize: 25.5,
              fontWeight: FontWeight.w700,
              color: color ?? c.text,
            ),
          ),
          const SizedBox(height: 2.5),
          Text(label, style: TextStyle(fontSize: 14, color: c.textSecondary)),
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
            Stack(
              children: [
                CircleAvatar(
                  radius: 23,
                  backgroundColor: c.surface,
                  backgroundImage: m.profileImage != null
                      ? NetworkImage(m.profileImage!)
                      : null,
                  child: m.profileImage == null
                      ? Text(
                          m.username.isNotEmpty ? m.username[0] : '؟',
                          style: TextStyle(
                            fontSize: 18.5,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        )
                      : null,
                ),
                /// نقطة خضرا = موجود دلوقتي
                if (m.isOnline)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: c.primary,
                        shape: BoxShape.circle,
                        border: Border.all(color: c.background, width: 2),
                      ),
                    ),
                  ),
              ],
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
                            fontSize: 16.5,
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
                      style: TextStyle(fontSize: 13.5, color: c.textSecondary),
                    ),
                ],
              ),
            ),
            if (m.isOnline)
              Text(
                'متاح',
                style: TextStyle(fontSize: 13.5, color: c.primary),
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
                style: TextStyle(fontSize: 16, color: c.textSecondary)),
          ],
        ),
      ),
    );
  }
}
