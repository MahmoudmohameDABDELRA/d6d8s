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
import '../../widgets/skeleton.dart';

/// 💬 شاشة المحادثة
///
/// ️ ليه الشاشة دي بالشكل ده بالتحديد:
///
///    السيرفر عنده ١٨ نقطة للشات؛ النسخة الأولى كانت بتستخدم
///    اتنين (قراية وإرسال). دلوقتي بتستخدم اللي **يخدم الشغل**:
///    ترقيم، رد، تعديل، حذف، تفاعل، «بيكتب…»، إيصال قراءة، إبلاغ.
///
///    اللي **متعملش عن قصد** — ستيكرز، قنوات، بوتات، حالات.
///    «بال» تطبيق إنتاجية فيه شات، مش تطبيق شات. الحاجات دي
///    بتخلي المستخدم يقعد في الشات بدل ما يخلص مهامه، وده عكس
///    الهدف. اللي اتنقل من تيليجرام هو **الإحساس** (سرعة،
///    فقاعات مريحة، رد واضح، مؤشر كتابة) مش قايمة الفيتشرز.
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

  /// ── الترقيم ──
  ///
  /// ️ الباج اللي اتصلح: الشاشة كانت بتطلب كل الرسايل مرة واحدة
  ///    بلا `before` ولا `limit`. محادثة فيها ٥٠٠٠ رسالة كانت
  ///    هتنزل كلها في كل استطلاع — كل ١٥ ثانية. السيرفر كان
  ///    بيدعم الترقيم بالمؤشّر من الأول (`before` + `hasMore`).
  bool _hasMore = false;
  bool _loadingMore = false;

  /// الرد على رسالة — لقطة مش مرجع (زي السيرفر بالظبط)
  ChatMessage? _replyTo;

  /// تعديل رسالة موجودة
  ChatMessage? _editing;

  /// مين بيكتب دلوقتي (غيري)
  final Set<String> _typingNames = {};
  Timer? _typingClear;
  Timer? _typingDebounce;
  bool _iAmTyping = false;

  Timer? _poll;
  final List<StreamSubscription> _subs = [];

  @override
  void initState() {
    super.initState();
    _boot();
    _scroll.addListener(_onScroll);
  }

  Future<void> _boot() async {
    final user = await TokenStore.getUser();
    _myId = user?['id']?.toString();
    await _load();

    if (!mounted) return;
    final realtime = context.read<RealtimeService>();
    realtime.joinConversation(widget.conversationId);

    _subs.add(realtime.onMessage.listen((msg) {
      if (!_isMine(msg)) return;
      _load(silent: true);
    }));

    /// «بيكتب…» — كان موجود في السيرفر ومحدش بيسمعه
    _subs.add(realtime.onTyping.listen((d) {
      if (!mounted) return;
      final who = (d['username'] ?? '').toString();
      final uid = (d['userId'] ?? '').toString();
      if (who.isEmpty || uid == _myId) return;

      setState(() {
        if (d['isTyping'] == true) {
          _typingNames.add(who);
        } else {
          _typingNames.remove(who);
        }
      });

      /// ️ حارس: لو المستخدم التاني قفل التطبيق وهو بيكتب،
      ///    `typing_stop` مش هيوصل والمؤشر هيفضل شغال للأبد.
      _typingClear?.cancel();
      _typingClear = Timer(const Duration(seconds: 6), () {
        if (mounted) setState(_typingNames.clear);
      });
    }));

    _subs.add(realtime.onRead.listen((_) {
      if (mounted) setState(() {});
    }));

    _poll =
        Timer.periodic(const Duration(seconds: 15), (_) => _load(silent: true));
  }

  bool _isMine(Map<String, dynamic> msg) {
    final cid =
        (msg['conversationId'] ?? msg['conversation']?['id'])?.toString();
    return cid == null || cid == widget.conversationId;
  }

  void _onScroll() {
    /// ️ فوق = الأقدم. بنحمّل الصفحة اللي قبلها لما نقرّب من
    ///    الحافة العليا، مش لما نوصلها — عشان التحميل يبقى
    ///    خلص قبل ما المستخدم يشوف فراغ.
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels <= 200 && _hasMore && !_loadingMore) {
      _loadOlder();
    }
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _typingClear?.cancel();
    _typingDebounce?.cancel();
    _poll?.cancel();
    _scroll.removeListener(_onScroll);

    /// ️ نخرج من الغرفة ونوقّف مؤشر الكتابة — من غير كده
    ///    الطرف التاني هيفضل شايف «بيكتب…» بعد ما نقفل الشاشة.
    final realtime = context.read<RealtimeService>();
    if (_iAmTyping) realtime.stopTyping(widget.conversationId);
    realtime.leaveConversation(widget.conversationId);

    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // ══════════════════════════════════════════════
  //  التحميل
  // ══════════════════════════════════════════════

  Future<void> _load({bool silent = false}) async {
    try {
      final res = await ApiClient.instance.get(
        ApiEndpoints.chatMessages(widget.conversationId),
        query: {'limit': 40},
      );
      if (!mounted) return;

      final loaded = _parse(res);

      /// ما نعملش setState لو مفيش جديد — الاستطلاع كان هيعيد
      /// بناء الشاشة باستمرار ويقطع اختيار المستخدم للنص.
      if (silent &&
          loaded.length == _messages.length &&
          (loaded.isEmpty || loaded.last.id == _messages.last.id)) {
        return;
      }

      setState(() {
        _messages = loaded;
        _hasMore = res['hasMore'] == true;
        _loading = false;
        _error = null;
      });
      _markLastRead();
      _toBottom();
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _error = humanError(e);
        _loading = false;
      });
    }
  }

  /// صفحة أقدم — بالمؤشّر مش بالإزاحة
  Future<void> _loadOlder() async {
    if (_messages.isEmpty || _loadingMore) return;
    setState(() => _loadingMore = true);

    final oldest = _messages.first.createdAt;
    if (oldest == null) {
      setState(() {
        _loadingMore = false;
        _hasMore = false;
      });
      return;
    }

    try {
      final res = await ApiClient.instance.get(
        ApiEndpoints.chatMessages(widget.conversationId),
        query: {'before': oldest.toUtc().toIso8601String(), 'limit': 40},
      );
      if (!mounted) return;

      final older = _parse(res);

      /// ️ نحافظ على مكان القراية: لو ضفنا فوق من غير ما نعوّض
      ///    الإزاحة، الشاشة بتنطّ والمستخدم بيضيع مكانه.
      final before = _scroll.position.maxScrollExtent;

      setState(() {
        _messages = [...older, ..._messages];
        _hasMore = res['hasMore'] == true && older.isNotEmpty;
        _loadingMore = false;
      });

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_scroll.hasClients) return;
        final after = _scroll.position.maxScrollExtent;
        _scroll.jumpTo(_scroll.position.pixels + (after - before));
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  List<ChatMessage> _parse(Map<String, dynamic> res) =>
      (res['messages'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ChatMessage.fromJson)
          .toList();

  void _markLastRead() {
    if (_messages.isEmpty) return;
    final last = _messages.last;
    if (last.senderId == _myId) return;
    context
        .read<RealtimeService>()
        .markMessageRead(widget.conversationId, last.id);
  }

  // ══════════════════════════════════════════════
  //  الإرسال والتعديل
  // ══════════════════════════════════════════════

  void _onInputChanged(String value) {
    final realtime = context.read<RealtimeService>();

    if (value.trim().isEmpty) {
      if (_iAmTyping) {
        _iAmTyping = false;
        realtime.stopTyping(widget.conversationId);
      }
      return;
    }

    if (!_iAmTyping) {
      _iAmTyping = true;
      realtime.startTyping(widget.conversationId);
    }

    /// ️ بنبعت `typing_stop` بعد سكوت ثانيتين بدل ما نستنى
    ///    المستخدم يمسح الحقل — الناس بتبطّل كتابة من غير ما تمسح.
    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(seconds: 2), () {
      if (!mounted || !_iAmTyping) return;
      _iAmTyping = false;
      realtime.stopTyping(widget.conversationId);
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;

    //  تعديل رسالة موجودة بدل إرسال جديدة
    if (_editing != null) return _saveEdit(text);

    final replyTo = _replyTo;
    setState(() {
      _sending = true;
      _input.clear();
      _replyTo = null;
    });

    _stopTypingNow();

    try {
      await ApiClient.instance.post(
        ApiEndpoints.chatMessages(widget.conversationId),
        body: {
          'text': text,
          if (replyTo != null) 'replyToId': replyTo.id,
          /// مفتاح عدم التكرار — السيرفر بيدعمه، والشبكة الضعيفة
          /// بتخلي نفس الطلب يتبعت مرتين
          'clientMessageId':
              '${DateTime.now().microsecondsSinceEpoch}_${_myId ?? ''}',
        },
      );
      if (!mounted) return;
      setState(() => _sending = false);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        //  نرجّع النص والرد للمستخدم بدل ما يضيعوا
        _input.text = text;
        _replyTo = replyTo;
      });
      _snack('مااتبعتش: ${_short(e)}');
    }
  }

  Future<void> _saveEdit(String text) async {
    final target = _editing!;
    setState(() {
      _sending = true;
      _input.clear();
      _editing = null;
    });

    try {
      await ApiClient.instance.patch(
        ApiEndpoints.editMessage(target.id),
        body: {'text': text},
      );
      if (!mounted) return;
      setState(() => _sending = false);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _input.text = text;
        _editing = target;
      });
      _snack('التعديل مانفعش: ${_short(e)}');
    }
  }

  void _stopTypingNow() {
    _typingDebounce?.cancel();
    if (_iAmTyping) {
      _iAmTyping = false;
      context.read<RealtimeService>().stopTyping(widget.conversationId);
    }
  }

  // ══════════════════════════════════════════════
  //  التفاعل والحذف والإبلاغ
  // ══════════════════════════════════════════════

  Future<void> _react(ChatMessage m, String emoji) async {
    /// ️ تحديث متفائل: التفاعل لازم يبان **فوراً**. لو استنينا
    ///    الشبكة، الضغطة بتحس إنها ضاعت والمستخدم بيضغط تاني —
    ///    والسيرفر بيعتبرها toggle فبتتشال.
    final mine = _myId ?? '';
    final had = m.reactedBy(mine, emoji);

    setState(() {
      _messages = _messages.map((x) {
        if (x.id != m.id) return x;
        final next = x.reactions.where((r) => r.userId != mine).toList();
        if (!had) next.add(MessageReaction(userId: mine, emoji: emoji));
        return x.copyWith(reactions: next);
      }).toList();
    });

    try {
      await ApiClient.instance
          .post(ApiEndpoints.reactToMessage(m.id), body: {'emoji': emoji});
    } catch (e) {
      if (!mounted) return;
      _snack('التفاعل مانفعش: ${_short(e)}');
      _load(silent: true); // نرجّع الحقيقة من السيرفر
    }
  }

  Future<void> _delete(ChatMessage m) async {
    final sure = await _confirm(
      'تمسح الرسالة؟',
      'هتختفي عند الكل. مش هتقدر ترجّعها.',
    );
    if (sure != true) return;

    try {
      await ApiClient.instance.delete(ApiEndpoints.deleteMessage(m.id));
      if (mounted) await _load();
    } catch (e) {
      if (mounted) _snack('المسح مانفعش: ${_short(e)}');
    }
  }

  Future<void> _report(ChatMessage m, {required bool alsoBlock}) async {
    final sure = await _confirm(
      alsoBlock ? 'تبلّغ وتحظر؟' : 'تبلّغ عن الرسالة؟',
      alsoBlock
          ? 'هيتبعت بلاغ للإدارة، ومش هتشوف رسايل الشخص ده تاني.'
          : 'هيتبعت بلاغ للإدارة بنص الرسالة.',
    );
    if (sure != true) return;

    try {
      await ApiClient.instance.post(
        alsoBlock
            ? ApiEndpoints.reportAndBlockMessage(m.id)
            : ApiEndpoints.reportMessage(m.id),
        body: {'reason': 'HARASSMENT'},
      );
      if (!mounted) return;
      _snack(alsoBlock ? 'اتبلّغ واتحظر' : 'اتبلّغ — شكراً');
      if (alsoBlock) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) _snack('البلاغ مانفعش: ${_short(e)}');
    }
  }

  Future<bool?> _confirm(String title, String body) {
    final c = BalColors(context);
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surfaceElevated,
        title: Text(title, style: Theme.of(ctx).textTheme.titleMedium),
        content: Text(body, style: Theme.of(ctx).textTheme.bodyMedium),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('لأ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('أيوه', style: TextStyle(color: c.danger)),
          ),
        ],
      ),
    );
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
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

  // ══════════════════════════════════════════════
  //  البناء
  // ══════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title),
            //  «بيكتب…» تحت الاسم زي ما المستخدم متوقع
            if (_typingNames.isNotEmpty)
              Text(
                widget.isGroup
                    ? '${_typingNames.join('، ')} بيكتب…'
                    : 'بيكتب…',
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: c.accent),
              ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const MessageListSkeleton()
                  : _error != null
                      ? _errorView(c)
                      : _messages.isEmpty
                          ? _emptyView(c)
                          : _list(c),
            ),
            if (_replyTo != null || _editing != null) _contextBar(c),
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
      //  عنصر إضافي فوق: مؤشر تحميل الأقدم
      itemCount: _messages.length + (_hasMore ? 1 : 0),
      itemBuilder: (_, i) {
        if (_hasMore && i == 0) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppTheme.spaceLg),
              child: _loadingMore
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : TextButton(
                      onPressed: _loadOlder,
                      child: const Text('حمّل الأقدم'),
                    ),
            ),
          );
        }
        final m = _messages[_hasMore ? i - 1 : i];
        return _bubble(c, m);
      },
    );
  }

  Widget _bubble(BalColors c, ChatMessage m) {
    final mine = m.senderId == _myId;
    final text = Theme.of(context).textTheme;

    if (m.isDeleted) {
      return Align(
        alignment: mine
            ? AlignmentDirectional.centerEnd
            : AlignmentDirectional.centerStart,
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
          child: Text(
            'الرسالة اتمسحت',
            style: text.bodySmall?.copyWith(
              fontStyle: FontStyle.italic,
              color: c.textDisabled,
            ),
          ),
        ),
      );
    }

    final counts = m.reactionCounts;

    return Align(
      alignment: mine
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: GestureDetector(
        onLongPress: () => _showActions(m, mine),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Container(
              margin: EdgeInsets.only(
                  bottom: counts.isEmpty ? AppTheme.spaceSm : 2),
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
                        style: text.bodySmall?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: c.accent,
                        ),
                      ),
                    ),

                  //  اقتباس الرد — لقطة، مش مرجع للرسالة الأصلية
                  if (m.replyToText != null && m.replyToText!.isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 9, vertical: 6),
                      decoration: BoxDecoration(
                        color: (mine ? c.onPrimary : c.text)
                            .withValues(alpha: 0.10),
                        borderRadius:
                            BorderRadius.circular(AppTheme.radiusSm),
                        border: BorderDirectional(
                          start: BorderSide(
                            color: mine ? c.onPrimary : c.accent,
                            width: 2.5,
                          ),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (m.replyToSender != null)
                            Text(
                              m.replyToSender!,
                              style: text.bodySmall?.copyWith(
                                fontWeight: FontWeight.w600,
                                color: mine ? c.onPrimary : c.accent,
                              ),
                            ),
                          Text(
                            m.replyToText!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: text.bodySmall?.copyWith(
                              color: (mine ? c.onPrimary : c.textSecondary)
                                  .withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
                    ),

                  Text(
                    m.text,
                    style: text.bodyMedium?.copyWith(
                      color: mine ? c.onPrimary : c.text,
                    ),
                  ),

                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (m.isEdited)
                          Text(
                            'معدَّلة · ',
                            style: text.bodySmall?.copyWith(
                              fontSize: BalType.micro,
                              color: mine
                                  ? c.onPrimary.withValues(alpha: 0.7)
                                  : c.textDisabled,
                            ),
                          ),
                        if (m.createdAt != null)
                          Text(
                            _time(m.createdAt!),
                            style: text.bodySmall?.copyWith(
                              fontSize: BalType.micro,
                              color: mine
                                  ? c.onPrimary.withValues(alpha: 0.7)
                                  : c.textDisabled,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            //  التفاعلات تحت الفقاعة
            if (counts.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
                child: Wrap(
                  spacing: 4,
                  children: counts.entries.map((e) {
                    final byMe = m.reactedBy(_myId ?? '', e.key);
                    return GestureDetector(
                      onTap: () => _react(m, e.key),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: byMe
                              ? c.primary.withValues(alpha: 0.18)
                              : c.surfaceElevated,
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusPill),
                          border: Border.all(
                            color: byMe ? c.primary : c.border,
                          ),
                        ),
                        child: Text(
                          '${e.key} ${e.value}',
                          style: text.bodySmall?.copyWith(fontSize: BalType.caption),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// قايمة الإجراءات — ضغطة مطوّلة على الفقاعة
  void _showActions(ChatMessage m, bool mine) {
    final c = BalColors(context);

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: c.surfaceElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.radiusXl),
        ),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            //  صف الإيموجي السريع
            Padding(
              padding: const EdgeInsets.symmetric(
                vertical: AppTheme.spaceMd,
                horizontal: AppTheme.spaceLg,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: ['👍', '❤️', '🔥', '😂', '💪', '🙏'].map((e) {
                  return InkWell(
                    onTap: () {
                      Navigator.of(ctx).pop();
                      _react(m, e);
                    },
                    borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                    child: Container(
                      /// ️ ٤٨×٤٨ — الحد الأدنى للمساحة القابلة للمس.
                      ///    أقل من كده الضغطة بتفشل على الموبايل.
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      child: Text(e, style: const TextStyle(fontSize: BalType.heading)),
                    ),
                  );
                }).toList(),
              ),
            ),
            Divider(color: c.border, height: 1),
            _action(ctx, c, Icons.reply_rounded, 'رد', () {
              setState(() {
                _replyTo = m;
                _editing = null;
              });
            }),
            if (mine)
              _action(ctx, c, Icons.edit_rounded, 'تعديل', () {
                setState(() {
                  _editing = m;
                  _replyTo = null;
                  _input.text = m.text;
                });
              }),
            if (mine)
              _action(ctx, c, Icons.delete_outline_rounded, 'مسح', () {
                _delete(m);
              }, danger: true),
            if (!mine)
              _action(ctx, c, Icons.flag_outlined, 'إبلاغ', () {
                _report(m, alsoBlock: false);
              }),
            if (!mine)
              _action(ctx, c, Icons.block_rounded, 'إبلاغ وحظر', () {
                _report(m, alsoBlock: true);
              }, danger: true),
            const SizedBox(height: AppTheme.spaceSm),
          ],
        ),
      ),
    );
  }

  Widget _action(
    BuildContext ctx,
    BalColors c,
    IconData icon,
    String label,
    VoidCallback onTap, {
    bool danger = false,
  }) {
    final color = danger ? c.danger : c.text;
    return ListTile(
      /// ️ ListTile الافتراضي ارتفاعه كفاية للمس (٥٦ نقطة)
      leading: Icon(icon, color: color),
      title: Text(
        label,
        style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: color),
      ),
      onTap: () {
        Navigator.of(ctx).pop();
        onTap();
      },
    );
  }

  /// شريط الرد/التعديل فوق حقل الكتابة
  Widget _contextBar(BalColors c) {
    final editing = _editing != null;
    final target = _editing ?? _replyTo!;
    final text = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spaceLg,
        vertical: AppTheme.spaceSm,
      ),
      decoration: BoxDecoration(
        color: c.surfaceElevated,
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: Row(
        children: [
          Icon(
            editing ? Icons.edit_rounded : Icons.reply_rounded,
            size: 18,
            color: c.accent,
          ),
          const SizedBox(width: AppTheme.spaceSm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  editing ? 'بتعدّل' : 'رد على ${target.senderName ?? ''}',
                  style: text.bodySmall?.copyWith(
                    color: c.accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  target.text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: text.bodySmall?.copyWith(color: c.textSecondary),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.close_rounded, color: c.textSecondary),
            tooltip: 'إلغاء',
            onPressed: () => setState(() {
              _replyTo = null;
              _editing = null;
              if (editing) _input.clear();
            }),
          ),
        ],
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
              onChanged: _onInputChanged,
              style: Theme.of(context).textTheme.bodyMedium,
              decoration: InputDecoration(
                hintText: _editing != null ? 'عدّل الرسالة…' : 'اكتب رسالة…',
                hintStyle: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: c.textDisabled),
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
            icon: _editing != null ? Icons.check_rounded : Icons.send_rounded,
            color: c.primary,
            onPressed: _sending ? null : _send,
            tooltip: _editing != null ? 'احفظ' : 'ابعت',
          ),
        ],
      ),
    );
  }

  Widget _emptyView(BalColors c) {
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxl),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.waving_hand_rounded, size: 60, color: c.textDisabled),
            const SizedBox(height: AppTheme.spaceLg),
            Text('ابدأ الكلام', style: text.titleMedium),
            const SizedBox(height: AppTheme.spaceSm),
            Text(
              'مفيش رسايل هنا لسه',
              style: text.bodyMedium?.copyWith(color: c.textSecondary),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorView(BalColors c) {
    final text = Theme.of(context).textTheme;
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
              style: text.bodyMedium?.copyWith(color: c.textSecondary),
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
