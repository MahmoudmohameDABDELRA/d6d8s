import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../models/models.dart';
import 'conversation_screen.dart';

/// 💬 شاشة الرسائل — تبويبان (محادثات/عشيرة) + بحث (الرؤية 4.1-4.4)
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  int _tab = 0;
  bool _loading = true;
  List<Conversation> _conversations = [];
  List<Clan> _clans = [];
  List<Map<String, dynamic>> _searchResults = [];
  bool _searching = false;

  /// ️ كان `catch (_)` بيبلع الخطأ، فلو السيرفر واقع المستخدم
  ///    يشوف «مفيش محادثات» ويفتكر إن دي الحقيقة.
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      /// المحادثات وشاتات العشائر مع بعض — نداءين متوازيين
      final results = await Future.wait([
        ApiClient.instance.get(ApiEndpoints.conversations),
        ApiClient.instance.get(ApiEndpoints.clanChats).catchError(
              (_) => <String, dynamic>{},
            ),
      ]);

      if (!mounted) return;
      setState(() {
        _conversations = (results[0]['conversations'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(Conversation.fromJson)
            .toList();
        _clans = (results[1]['clans'] as List? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(Clan.fromJson)
            .toList();
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().contains('SocketException')
            ? 'مفيش اتصال بالسيرفر'
            : e.toString().replaceAll('Exception: ', '');
      });
    }
  }

  /// يفتح المحادثة — دي كانت مفقودة تماماً
  void _openConversation(Conversation conv) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ConversationScreen(
          conversationId: conv.id,
          title: conv.title,
        ),
      ),
    ).then((_) => _load());
  }

  /// يفتح شات العشيرة (بينشئه لو أول مرة)
  Future<void> _openClanChat(Clan clan) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res =
          await ApiClient.instance.get(ApiEndpoints.openClanChat(clan.id));
      final convId = (res['conversationId'] ?? res['conversation']?['id'])
          ?.toString();
      if (convId == null) throw Exception('مفيش شات للعشيرة دي');
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ConversationScreen(
            conversationId: convId,
            title: clan.name,
            isGroup: true,
          ),
        ),
      ).then((_) => _load());
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) {
      setState(() {
        _searchResults = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.searchUsers,
          query: {'q': q.trim()});
      setState(() {
        _searchResults = (res['users'] as List? ?? res['results'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
        _searching = false;
      });
    } catch (_) {
      setState(() => _searching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  AppTheme.spaceXxl, AppTheme.spaceLg, AppTheme.spaceXxl, 0),
              child: Text('الرسائل',
                  style: TextStyle(
                      fontSize: 32, fontWeight: FontWeight.w700, color: c.text)),
            ),
            // البحث
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: TextField(
                style: TextStyle(color: c.text),
                onChanged: _search,
                decoration: InputDecoration(
                  hintText: 'ابحث بالاسم أو الاهتمام',
                  hintStyle: TextStyle(color: c.textDisabled),
                  prefixIcon: Icon(Icons.search_rounded, color: c.textSecondary),
                  filled: true,
                  fillColor: c.surface.withValues(alpha: 0.5),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            // التبويبان
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 23),
              child: Row(
                children: [
                  _tabBtn(context, 0, 'المحادثات'),
                  const SizedBox(width: 9),
                  _tabBtn(context, 1, 'العشيرة'),
                ],
              ),
            ),
            const SizedBox(height: 9),
            Expanded(
              child: _searching
                  ? _searchList(c)
                  : _tab == 0
                      ? _conversationsList(c)
                      : _clansList(c),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tabBtn(BuildContext context, int idx, String label) {
    final c = BalColors(context);
    final active = _tab == idx;
    return GestureDetector(
      onTap: () => setState(() => _tab = idx),
      child: AnimatedContainer(
        duration: AppTheme.standard,
        padding: const EdgeInsets.symmetric(horizontal: 20.5, vertical: 10.5),
        decoration: BoxDecoration(
          color: active ? c.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(AppTheme.radiusPill),
          border: Border.all(color: active ? c.primary : c.border),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: active ? c.onPrimary : c.textSecondary)),
      ),
    );
  }

  // نتائج البحث
  Widget _searchList(BalColors c) {
    if (_searchResults.isEmpty) {
      return Center(
        child: Text('اكتب اسم أو اهتمام للبحث',
            style: TextStyle(color: c.textSecondary)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 23, vertical: 9),
      itemCount: _searchResults.length,
      itemBuilder: (context, i) {
        final u = _searchResults[i];
        return Container(
          margin: const EdgeInsets.only(bottom: 9),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: c.surfaceElevated.withValues(alpha: 0.7),
            borderRadius: BorderRadius.circular(AppTheme.radiusLg),
            border: Border.all(color: c.border),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 21.5,
                backgroundColor: c.primary.withValues(alpha: 0.2),
                child: Icon(Icons.person_rounded, color: c.primary),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${u['username'] ?? ''}',
                        style: TextStyle(
                            fontSize: 17.5,
                            fontWeight: FontWeight.w600,
                            color: c.text)),
                    Text('${u['domain'] ?? 'اهتمام'}',
                        style: TextStyle(color: c.textSecondary, fontSize: 14)),
                  ],
                ),
              ),
              // إرسال طلب صداقة (نظام انستقرام)
              IconCircleButton(
                icon: Icons.person_add_alt_1_rounded,
                size: 43.5,
                onPressed: () async {
                  /// ️ نمسك الـ messenger **قبل** الـ await.
                  ///
                  ///    الكود القديم كان بيعمل `ScaffoldMessenger.of(context)`
                  ///    بعد الـ await، محمي بـ `mounted` بتاع الـ State — لكن
                  ///    الـ context هنا جاي من Builder داخلي، فالحماية كانت
                  ///    على ويدجت والاستخدام على ويدجت تانية. لو الشاشة
                  ///    اتقفلت أثناء الطلب، ده كراش.
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    final res = await ApiClient.instance
                        .post(ApiEndpoints.chatStart, body: {
                      'targetUserId': u['id'],
                      'text': 'أهلاً! عايز أتعرف عليك',
                    });
                    if (!mounted) return;
                    messenger.showSnackBar(
                      SnackBar(
                          content: Text(res['isFriendRequest'] == true
                              ? 'اتبعت طلب صداقة 💌'
                              : 'اتبعت الرسالة')),
                    );

                    /// ️ لو اتفتحت محادثة فعلية (مش طلب صداقة) نودّيه
                    ///    فيها على طول. الكود القديم كان بيبعت الرسالة
                    ///    ويسيب المستخدم في شاشة البحث بلا أي طريق
                    ///    يوصل بيها للمحادثة.
                    final convId = (res['conversationId'] ??
                            res['conversation']?['id'])
                        ?.toString();
                    if (res['isFriendRequest'] != true && convId != null) {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => ConversationScreen(
                            conversationId: convId,
                            title: (u['username'] ?? 'محادثة').toString(),
                          ),
                        ),
                      );
                      if (mounted) _load();
                    }
                  } catch (e) {
                    if (!mounted) return;
                    messenger.showSnackBar(
                      SnackBar(
                          content: Text(
                              e.toString().replaceAll('Exception: ', ''))),
                    );
                  }
                },
              ),
            ],
          ),
        );
      },
    );
  }

  // قائمة المحادثات
  Widget _conversationsList(BalColors c) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _errorView(c);

    if (_conversations.isEmpty) {
      return _empty(c, Icons.forum_rounded, 'مفيش محادثات',
          'دوّر على حد في تبويب البحث وابدأ كلام');
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.spaceXl, vertical: AppTheme.spaceSm),
        itemCount: _conversations.length,
        itemBuilder: (context, i) => _conversationTile(c, _conversations[i]),
      ),
    );
  }

  /// ️ الكارت ده كان **مش قابل للضغط** — مجرد صندوق ميت. المستخدم
  ///    كان يقدر يبدأ محادثة ومش يقدر يفتحها.
  Widget _conversationTile(BalColors c, Conversation conv) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
      child: GlassCard(
        padding: const EdgeInsets.all(AppTheme.spaceMd),
        onTap: () => _openConversation(conv),
        child: Row(
          children: [
            Stack(
              children: [
                CircleAvatar(
                  radius: 25,
                  backgroundColor: c.friendship.withValues(alpha: 0.25),
                  backgroundImage:
                      conv.avatar != null ? NetworkImage(conv.avatar!) : null,
                  child: conv.avatar == null
                      ? Text(
                          conv.title.isNotEmpty ? conv.title[0] : '؟',
                          style: TextStyle(
                            fontSize: 18.5,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        )
                      : null,
                ),
                if (conv.isOnline)
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
                  Text(
                    conv.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16.5,
                      fontWeight: FontWeight.w600,
                      color: c.text,
                    ),
                  ),
                  if (conv.lastMessage != null) ...[
                    const SizedBox(height: 2.5),
                    Text(
                      conv.lastMessage!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        color: conv.unread > 0 ? c.text : c.textSecondary,
                        fontWeight: conv.unread > 0
                            ? FontWeight.w500
                            : FontWeight.w400,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            /// عداد غير المقروء — السيرفر بيحسبه وماكانش بيتعرض
            if (conv.unread > 0)
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppTheme.spaceSm, vertical: 2.5),
                decoration: BoxDecoration(
                  color: c.primary,
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                ),
                child: Text(
                  '${conv.unread}',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: c.onPrimary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// قائمة شاتات العشائر — كانت نص ثابت مش بيانات
  Widget _clansList(BalColors c) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _errorView(c);

    if (_clans.isEmpty) {
      return _empty(c, Icons.groups_rounded, 'مفيش عشائر',
          'انضم لعشيرة من تبويب العشائر وهتلاقي شاتها هنا');
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(
            horizontal: AppTheme.spaceXl, vertical: AppTheme.spaceSm),
        itemCount: _clans.length,
        itemBuilder: (context, i) {
          final clan = _clans[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
            child: GlassCard(
              padding: const EdgeInsets.all(AppTheme.spaceMd),
              onTap: () => _openClanChat(clan),
              child: Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: c.friendship.withValues(alpha: 0.25),
                    ),
                    child: Icon(
                      clan.isPrivate ? Icons.lock_rounded : Icons.groups_rounded,
                      color: c.friendship,
                      size: 25,
                    ),
                  ),
                  const SizedBox(width: AppTheme.spaceMd),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          clan.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 16.5,
                            fontWeight: FontWeight.w600,
                            color: c.text,
                          ),
                        ),
                        const SizedBox(height: 2.5),
                        Text(
                          '${clan.membersCount} عضو',
                          style: TextStyle(
                              fontSize: 14, color: c.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_left_rounded, color: c.textSecondary),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _empty(BalColors c, IconData icon, String title, String hint) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 65, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text(
              title,
              style: TextStyle(
                fontSize: 18.5,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
            const SizedBox(height: AppTheme.spaceSm),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, color: c.textSecondary),
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
            Icon(Icons.cloud_off_rounded, size: 55, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 15, color: c.textSecondary),
            ),
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
