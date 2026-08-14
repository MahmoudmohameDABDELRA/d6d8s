import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';

/// 💬 شاشة الرسائل — تبويبان (محادثات/عشيرة) + بحث (الرؤية 4.1-4.4)
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  int _tab = 0;
  bool _loading = true;
  List<Map<String, dynamic>> _conversations = [];
  List<Map<String, dynamic>> _searchResults = [];
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get('/chat/conversations');
      setState(() {
        _conversations = (res['conversations'] as List? ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
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
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_conversations.isEmpty) {
      return Center(
        child: Text('مفيش محادثات — ابحث عن ناس تبدأ',
            style: TextStyle(color: c.textSecondary)),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 23, vertical: 9),
      itemCount: _conversations.length,
      itemBuilder: (context, i) {
        final conv = _conversations[i];
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
                radius: 23.5,
                backgroundColor: c.friendship.withValues(alpha: 0.25),
                child: Icon(Icons.person_rounded, color: c.friendship),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text('${conv['title'] ?? 'محادثة'}',
                    style: TextStyle(
                        fontSize: 17.5,
                        fontWeight: FontWeight.w600,
                        color: c.text)),
              ),
            ],
          ),
        );
      },
    );
  }

  // قائمة العشائر
  Widget _clansList(BalColors c) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 23, vertical: 9),
      children: [
        GlassCard(
          margin: const EdgeInsets.only(bottom: 9),
          child: Row(
            children: [
              Icon(Icons.groups_rounded, color: c.friendship, size: 32),
              const SizedBox(width: 14),
              Expanded(
                child: Text('عشائر عامة (حسب اهتمامك)',
                    style: TextStyle(fontSize: 17.5, fontWeight: FontWeight.w600, color: c.text)),
              ),
              OutlinePillButton(label: 'دخول', onPressed: () {}),
            ],
          ),
        ),
        const SizedBox(height: 9),
        Text('العشائر الخاصة بتظهر هنا بعد ما تنضم',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.textSecondary, fontSize: 14)),
      ],
    );
  }
}
