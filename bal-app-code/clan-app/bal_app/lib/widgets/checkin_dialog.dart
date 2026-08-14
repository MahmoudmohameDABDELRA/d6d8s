import 'package:flutter/material.dart';

import '../core/checkin/checkin_phrases.dart';
import '../core/checkin/checkin_watcher.dart';
import '../core/network/api_client.dart';
import '../core/network/api_endpoints.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_theme.dart';
import 'buttons.dart';

/// 💬 بوب-أب الاطمئنان — أهم شاشة في التطبيق
///
/// الفلو الكامل (قرار المالك):
///   1. ييجي معاد نهاية المهمة → البوب-أب يطلع **تلقائياً**
///   2. الرفيق يسأل: «إيه الأخبار؟ عملت إيه في (الفطار)؟»
///   3. المستخدم يكتب اللي حصل **في نفس البوب-أب**
///   4. التطبيق يرفع المهمة والرد للسيرفر
///   5. رد الرفيق يظهر **في نفس المكان** — مش شاشة تانية
///
/// ⚠️ ملاحظات تصميم مقصودة:
///   · مفيش زر «إغلاق» في الأعلى — الخروج بـ «مش دلوقتي» عشان
///     المستخدم ياخد باله إن ده سؤال مش إعلان.
///   · بعد رد الرفيق، حقل الكتابة بيفضل مفتوح — ممكن يكمل الكلام.
///   · لو الـ AI واقع (`source == 'SYSTEM'`) الرد بيتعرض بشكل
///     مختلف (رمادي + أيقونة) — ما ندّعيش على الرفيق كلام مقالوش.
Future<void> showCheckInDialog(
  BuildContext context, {
  required CheckInPrompt prompt,
  VoidCallback? onDone,
}) async {
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => CheckInDialog(prompt: prompt),
  );
  onDone?.call();
}

class CheckInDialog extends StatefulWidget {
  final CheckInPrompt prompt;

  const CheckInDialog({super.key, required this.prompt});

  @override
  State<CheckInDialog> createState() => _CheckInDialogState();
}

class _CheckInDialogState extends State<CheckInDialog> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  /// المحادثة المعروضة — بتكبر مع كل تبادلة
  final List<_Msg> _messages = [];

  String _title = 'رفيقك بيسأل عنك';
  bool _sending = false;
  bool _loadingQuestion = true;
  String? _error;

  /// معرّف الإشعار في السيرفر — بيتعرف بعد أول إرسال لو كان محلي
  String? _notificationId;

  @override
  void initState() {
    super.initState();
    _notificationId = widget.prompt.notificationId;
    _prepareQuestion();
  }

  /// السؤال: من السيرفر لو موجود، وإلا من البنك المحلي
  Future<void> _prepareQuestion() async {
    final fromServer = widget.prompt.serverQuestion;

    final question = (fromServer != null && fromServer.trim().isNotEmpty)
        ? fromServer.trim()
        : await CheckInPhrases.nextQuestion(widget.prompt.task.title);

    final title = await CheckInPhrases.nextTitle();

    if (!mounted) return;
    setState(() {
      _messages.add(_Msg(text: question, fromCompanion: true));
      _title = title;
      _loadingQuestion = false;
    });

    // لو الخيط موجود على السيرفر، نجيب المحادثة السابقة
    if (_notificationId != null) _loadThread();
  }

  /// ⚠️ المستخدم ممكن يكون رد قبل كده وقفل التطبيق — نرجّع كلامه
  Future<void> _loadThread() async {
    try {
      final res = await ApiClient.instance
          .get(ApiEndpoints.notificationThread(_notificationId!));
      final list = res['messages'] as List? ?? const [];
      if (list.isEmpty || !mounted) return;

      setState(() {
        for (final m in list) {
          if (m is! Map) continue;
          _messages.add(_Msg(
            text: (m['text'] ?? '').toString(),
            fromCompanion: m['sender'] == 'companion',
          ));
        }
      });
      _scrollToEnd();
    } catch (_) {
      /* فايل-أوبن: المحادثة السابقة رفاهية، السؤال أهم */
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _messages.add(_Msg(text: text, fromCompanion: false));
      _sending = true;
      _error = null;
      _controller.clear();
    });
    _scrollToEnd();

    try {
      // مفيش إشعار على السيرفر؟ يبقى السؤال اتولد محلياً —
      // بنبعت المهمة الأول عشان السيرفر يعرف بيتكلم عن إيه.
      final id = _notificationId ?? await _createServerThread();

      final res = await ApiClient.instance.post(
        ApiEndpoints.notificationReply(id),
        body: {'text': text},
      );

      final reply = (res['reply'] ?? '').toString();
      final source = (res['source'] ?? 'AI').toString();

      if (!mounted) return;
      setState(() {
        _notificationId = id;
        _messages.add(_Msg(
          text: reply.isEmpty ? 'وصلني كلامك ✅' : reply,
          fromCompanion: true,
          isSystem: source == 'SYSTEM',
          isCrisis: res['crisis'] == true,
        ));
        _sending = false;
      });
      _scrollToEnd();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = _friendlyError(e);
      });
    }
  }

  /// السؤال اتولد محلياً → نفتح خيط على السيرفر للمهمة دي.
  ///
  /// ⚠️ بنبعت **نص السؤال اللي المستخدم شافه فعلاً** عشان اللي
  ///    اتخزن يطابق اللي اتعرض — لو سبنا السيرفر يخترع نص تاني،
  ///    المستخدم هيرجع للمحادثة يلاقي سؤال مشافهوش.
  ///
  /// ⚠️ Idempotent من ناحية السيرفر: لو الجوب سبقنا وولّد إشعار
  ///    للمهمة دي، بيرجّعه بدل ما يعمل خيط تاني.
  Future<String> _createServerThread() async {
    final firstQuestion = _messages.isNotEmpty && _messages.first.fromCompanion
        ? _messages.first.text
        : null;

    final res = await ApiClient.instance.post(
      ApiEndpoints.checkinOpen,
      body: {
        'taskId': widget.prompt.task.id,
        ?'question': firstQuestion,
      },
    );

    final id = res['notificationId']?.toString();
    if (id == null || id.isEmpty) {
      throw Exception('CHECKIN_THREAD_UNAVAILABLE');
    }
    return id;
  }

  String _friendlyError(Object e) {
    final s = e.toString();
    if (s.contains('CHECKIN_THREAD_UNAVAILABLE')) {
      return 'رفيقك لسه بيجهّز — كلامك محفوظ، جرّب كمان شوية.';
    }
    if (s.contains('429')) return 'استنى شوية كده — بعتنا كتير ورا بعض.';
    if (s.contains('403')) return 'السؤال ده اتقفل خلاص.';
    if (s.contains('SocketException') || s.contains('Connection refused')) {
      return 'مفيش اتصال — كلامك هيتبعت أول ما النت يرجع.';
    }
    return 'مقدرناش نوصل لرفيقك دلوقتي.';
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: AppTheme.standard,
        curve: Curves.easeOut,
      );
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final replied = _messages.any((m) => !m.fromCompanion);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spaceLg,
        vertical: AppTheme.spaceXxl,
      ),
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
            _header(c),
            Flexible(child: _conversation(c)),
            if (_error != null) _errorBar(c),
            _composer(c, replied),
          ],
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════
  Widget _header(BalColors c) {
    return Container(
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      decoration: BoxDecoration(
        color: c.primary.withValues(alpha: 0.10),
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(AppTheme.radiusXl),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 48.5,
            height: 48.5,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [c.primary, c.primary.withValues(alpha: 0.7)],
              ),
            ),
            child: Icon(Icons.favorite_rounded, color: c.onPrimary, size: 24),
          ),
          const SizedBox(width: AppTheme.spaceMd),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _title,
                  style: TextStyle(
                    fontSize: 18.5,
                    fontWeight: FontWeight.w700,
                    color: c.text,
                  ),
                ),
                const SizedBox(height: 2.5),
                Text(
                  widget.prompt.task.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14.5, color: c.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _conversation(BalColors c) {
    if (_loadingQuestion) {
      return Padding(
        padding: const EdgeInsets.all(AppTheme.spaceXxxl),
        child: Center(
          child: CircularProgressIndicator(color: c.primary, strokeWidth: 3),
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      shrinkWrap: true,
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      itemCount: _messages.length + (_sending ? 1 : 0),
      itemBuilder: (_, i) {
        if (i >= _messages.length) return _typing(c);
        return _bubble(c, _messages[i]);
      },
    );
  }

  Widget _bubble(BalColors c, _Msg m) {
    final isCompanion = m.fromCompanion;

    // ⚠️ رد النظام (الـ AI واقع) بيتعرض رمادي بأيقونة —
    //    ممنوع ندّعي إن ده كلام الرفيق.
    final bg = !isCompanion
        ? c.primary
        : m.isSystem
            ? c.surface
            : c.primary.withValues(alpha: 0.12);

    final fg = !isCompanion
        ? c.onPrimary
        : m.isSystem
            ? c.textSecondary
            : c.text;

    return Align(
      alignment:
          isCompanion ? AlignmentDirectional.centerStart : AlignmentDirectional.centerEnd,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppTheme.spaceSm),
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spaceLg,
          vertical: AppTheme.spaceMd,
        ),
        /**
         * ️ نسبة من الشاشة مش رقم ثابت.
         *
         *    كانت `maxWidth: 320` وبعد التكبير بقت 368 — أوسع من
         *    المساحة المتاحة على شاشة 360 بكسل بـ 82 بكسل، فالفقاعة
         *    كانت هتتقص. النسبة بتشتغل على كل المقاسات.
         */
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.72,
        ),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: m.isCrisis
              ? Border.all(color: c.accent, width: 1.5)
              : m.isSystem
                  ? Border.all(color: c.border)
                  : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (m.isSystem)
              Padding(
                padding: const EdgeInsets.only(bottom: 4.5),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.info_outline_rounded,
                        size: 15, color: c.textDisabled),
                    const SizedBox(width: 4.5),
                    Text(
                      'رسالة من التطبيق',
                      style: TextStyle(fontSize: 12.5, color: c.textDisabled),
                    ),
                  ],
                ),
              ),
            Text(
              m.text,
              style: TextStyle(fontSize: 16.5, height: 1.5, color: fg),
            ),
          ],
        ),
      ),
    );
  }

  Widget _typing(BalColors c) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppTheme.spaceSm),
        padding: const EdgeInsets.symmetric(
          horizontal: AppTheme.spaceLg,
          vertical: AppTheme.spaceMd,
        ),
        decoration: BoxDecoration(
          color: c.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2.5, color: c.primary),
            ),
            const SizedBox(width: AppTheme.spaceSm),
            Text('بيكتب…',
                style: TextStyle(fontSize: 15, color: c.textSecondary)),
          ],
        ),
      ),
    );
  }

  Widget _errorBar(BalColors c) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spaceLg,
        vertical: AppTheme.spaceSm,
      ),
      color: c.danger.withValues(alpha: 0.12),
      child: Text(
        _error!,
        style: TextStyle(fontSize: 14.5, color: c.danger),
      ),
    );
  }

  Widget _composer(BalColors c, bool replied) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  enabled: !_sending,
                  maxLines: 4,
                  minLines: 1,
                  maxLength: 1000,
                  textInputAction: TextInputAction.newline,
                  style: TextStyle(fontSize: 16.5, color: c.text),
                  decoration: InputDecoration(
                    hintText: 'اكتب اللي حصل…',
                    hintStyle: TextStyle(color: c.textDisabled, fontSize: 16),
                    counterText: '',
                    filled: true,
                    fillColor: c.surface,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: AppTheme.spaceLg,
                      vertical: AppTheme.spaceMd,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                      borderSide: BorderSide(color: c.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                      borderSide: BorderSide(color: c.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(AppTheme.radiusLg),
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
          const SizedBox(height: AppTheme.spaceSm),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(
              onPressed: _sending ? null : () => Navigator.of(context).pop(),
              child: Text(
                // بعد ما يرد، الخروج بقى «تمام» مش «مش دلوقتي»
                replied ? 'تمام، شكراً' : 'مش دلوقتي',
                style: TextStyle(color: c.textSecondary, fontSize: 15.5),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Msg {
  final String text;
  final bool fromCompanion;
  final bool isSystem;
  final bool isCrisis;

  const _Msg({
    required this.text,
    required this.fromCompanion,
    this.isSystem = false,
    this.isCrisis = false,
  });
}
