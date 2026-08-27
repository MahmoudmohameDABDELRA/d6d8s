import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/realtime/realtime_service.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/storage/token_store.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';

/// 💬 شاشة المحادثة — قراءة وإرسال الرسائل
///
/// ️ دي كانت **مفقودة تماماً**. السيرفر فيه 18 نقطة للشات، والتطبيق
///    كان بيستخدم اتنين بس (بحث + بدء محادثة). يعني تقدر تبدأ محادثة
///    ومتقدرش تقراها ولا ترد عليها — الكارت في القائمة مكانش قابل
///    للضغط أصلاً.
///
/// بتشتغل مع النوعين:
///   · محادثة فردية (DIRECT)
///   · شات عشيرة (CLAN) — بيعرض اسم المرسل فوق كل رسالة
class ConversationScreen extends StatefulWidget {
  final String conversationId;
  final String title;

  /// شات عشيرة؟ بنعرض اسم المرسل عشان فيه ناس كتير
  final bool isGroup;

  const ConversationScreen({
    super.key,
    required this.conversationId,
    required this.title,
    this.isGroup = false,
  });

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  List<ChatMessage> _messages = [];
  String? _myId;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  /// ️ الاستطلاع بقى **احتياطي** بس.
  ///
  ///    الرسايل بتوصل لحظياً عبر Socket.io. الاستطلاع فضل موجود
  ///    بفاصل أطول (15 ثانية بدل 5) عشان لو السوكيت اتقطع —
  ///    شبكة محدودة أو بروكسي بيمنع WebSocket — الشاشة ما تبقاش
  ///    ميتة. شيله خالص معناه إن فشل السوكيت = شات مش شغال.
  Timer? _poll;
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final user = await TokenStore.getUser();
    _myId = user?['id']?.toString();
    await _load();

    if (!mounted) return;
    final realtime = context.read<RealtimeService>();

    /// ندخل غرفة المحادثة عشان السيرفر يبعتلنا رسايلها
    realtime.joinConversation(widget.conversationId);

    _sub = realtime.onMessage.listen((msg) {
      /// ️ نتأكد إن الرسالة للمحادثة دي — القناة بتوصّل كل
      ///    محادثات المستخدم، فمن غير الفلتر ده هتظهر رسالة
      ///    من محادثة تانية هنا.
      final cid = (msg['conversationId'] ?? msg['conversation']?['id'])?.toString();
      if (cid != null && cid != widget.conversationId) return;
      _load(silent: true);
    });

    _poll = Timer.periodic(const Duration(seconds: 15), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _sub?.cancel();
    _poll?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final res = await ApiClient.instance
          .get(ApiEndpoints.chatMessages(widget.conversationId));
      final list = res['messages'] as List? ?? const [];
      if (!mounted) return;

      final loaded = list
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList();

      /// ️ ما نعملش setState لو مفيش جديد — الاستطلاع كل 5 ثواني
      ///    كان هيعيد بناء الشاشة باستمرار ويقطع اختيار المستخدم للنص.
      if (silent && loaded.length == _messages.length) return;

      setState(() {
        _messages = loaded;
        _loading = false;
        _error = null;
      });
      _toBottom();
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _error = humanError(e);
        _loading = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _input.clear();
    });

    try {
      await ApiClient.instance.post(
        ApiEndpoints.chatMessages(widget.conversationId),
        body: {'text': text},
      );
      if (!mounted) return;
      setState(() => _sending = false);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        /// ️ نرجّع النص للمستخدم بدل ما يضيع
        _input.text = text;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('مااتبعتش: ${_short(e)}')),
      );
    }
  }

  String _short(Object e) {
    final s = e.toString();
    if (s.contains('403')) return 'مش مسموح';
    if (s.contains('429')) return 'استنى شوية';
    if (s.contains('SocketException')) return 'مفيش اتصال';
    return s.replaceAll('Exception: ', '');
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: AppTheme.standard,
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? _errorView(c)
                      : _messages.isEmpty
                          ? _emptyView(c)
                          : _list(c),
            ),
            _composer(c),
          ],
        ),
      ),
    );
  }

  Widget _list(BalColors c) {
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      itemCount: _messages.length,
      itemBuilder: (_, i) => _bubble(c, _messages[i]),
    );
  }

  Widget _bubble(BalColors c, ChatMessage m) {
    final mine = m.senderId == _myId;

    if (m.isDeleted) {
      return Align(
        alignment: mine
            ? AlignmentDirectional.centerEnd
            : AlignmentDirectional.centerStart,
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
          child: Text(
            'الرسالة اتمسحت',
            style: TextStyle(
              fontSize: 13.5,
              fontStyle: FontStyle.italic,
              color: c.textDisabled,
            ),
          ),
        ),
      );
    }

    return Align(
      alignment:
          mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppTheme.spaceSm),
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spaceLg,
          vertical: AppTheme.spaceMd,
        ),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.75,
        ),
        decoration: BoxDecoration(
          color: mine ? c.primary : c.surfaceElevated,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: mine ? null : Border.all(color: c.border),
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            /// في شات العشيرة لازم نعرف مين بيتكلم
            if (widget.isGroup && !mine && m.senderName != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(
                  m.senderName!,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: c.accent,
                  ),
                ),
              ),
            Text(
              m.text,
              style: TextStyle(
                fontSize: 15.5,
                height: 1.4,
                color: mine ? c.onPrimary : c.text,
              ),
            ),
            if (m.createdAt != null)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(
                  _time(m.createdAt!),
                  style: TextStyle(
                    fontSize: 11,
                    color: mine
                        ? c.onPrimary.withValues(alpha: 0.7)
                        : c.textDisabled,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _time(DateTime t) {
    final local = t.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  Widget _composer(BalColors c) {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spaceMd),
      decoration: BoxDecoration(
        color: c.surface.withValues(alpha: 0.6),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: _input,
              enabled: !_sending,
              minLines: 1,
              maxLines: 4,
              maxLength: 2000,
              style: TextStyle(fontSize: 15.5, color: c.text),
              decoration: InputDecoration(
                hintText: 'اكتب رسالة…',
                hintStyle: TextStyle(color: c.textDisabled, fontSize: 15),
                counterText: '',
                filled: true,
                fillColor: c.surfaceElevated,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spaceLg,
                  vertical: AppTheme.spaceMd,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                  borderSide: BorderSide(color: c.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                  borderSide: BorderSide(color: c.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                  borderSide: BorderSide(color: c.primary, width: 1.5),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppTheme.spaceSm),
          IconCircleButton(
            icon: Icons.send_rounded,
            color: c.primary,
            onPressed: _sending ? null : _send,
            tooltip: 'ابعت',
          ),
        ],
      ),
    );
  }

  Widget _emptyView(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.waving_hand_rounded, size: 60, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text(
              'ابدأ الكلام',
              style: TextStyle(
                fontSize: 18.5,
                fontWeight: FontWeight.w600,
                color: c.text,
              ),
            ),
            const SizedBox(height: AppTheme.spaceSm),
            Text(
              'مفيش رسايل هنا لسه',
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
