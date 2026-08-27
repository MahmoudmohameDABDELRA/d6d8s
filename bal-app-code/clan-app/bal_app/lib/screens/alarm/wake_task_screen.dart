import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';

/// 🧮 مهمة الصحيان — المنبه مش بيقفل بضغطة
///
/// السيرفر بيولّد مسألة ويوقّعها بـ token. الإجابة بتتراجع في السيرفر
/// مش في التطبيق — فمفيش طريقة تغش بيها من الواجهة.
///
/// ️ الـ token صالح 5 دقايق بس. لو خلص، بنطلب مسألة جديدة تلقائياً
///    بدل ما نسيب المستخدم قدام رسالة خطأ وهو نصه نايم.
class WakeTaskScreen extends StatefulWidget {
  /// معاينة = تجربة من شاشة المنبهات، مش صحيان حقيقي
  final bool isPreview;

  /// معرّف المنبه (في الصحيان الحقيقي)
  final String? alarmId;

  /// معاد المنبه "06:00" — السيرفر بيحتاجه لتسجيل الاستيقاظ
  final String? scheduledTime;

  const WakeTaskScreen({
    super.key,
    this.isPreview = false,
    this.alarmId,
    this.scheduledTime,
  });

  @override
  State<WakeTaskScreen> createState() => _WakeTaskScreenState();
}

class _WakeTaskScreenState extends State<WakeTaskScreen> {
  final _answer = TextEditingController();
  final _focus = FocusNode();

  String? _question;
  String? _token;
  bool _loading = true;
  bool _checking = false;
  String? _error;
  bool _wrong = false;

  /// كام مرة غلط — بنشجّعه مش نلومه
  int _attempts = 0;

  @override
  void initState() {
    super.initState();
    _fetchTask();
  }

  @override
  void dispose() {
    _answer.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _fetchTask() async {
    setState(() {
      _loading = true;
      _error = null;
      _wrong = false;
    });

    try {
      final res = await ApiClient.instance.get(ApiEndpoints.wakeTask);
      if (!mounted) return;
      setState(() {
        _question = res['task']?['question']?.toString();
        _token = res['task']?['token']?.toString();
        _loading = false;
      });
      _focus.requestFocus();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = humanError(e, fallback: 'مقدرناش نجيب المسألة');
      });
    }
  }

  Future<void> _submit() async {
    final text = _answer.text.trim();
    if (text.isEmpty || _checking) return;

    setState(() {
      _checking = true;
      _wrong = false;
    });

    /// المعاينة: مفيش تسجيل استيقاظ — بس نتأكد إن الإجابة صح
    if (widget.isPreview) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('كده انت عارف الفكرة 👍')),
      );
      return;
    }

    try {
      await ApiClient.instance.post(ApiEndpoints.wakeTaskSolve, body: {
        'token': _token,
        'answer': int.tryParse(text) ?? text,
        'alarmId': widget.alarmId,
        'scheduledTime': widget.scheduledTime,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      final s = e.toString();

      /// ️ انتهت المهلة → مسألة جديدة تلقائياً. عرض رسالة خطأ لحد
      ///    نصه نايم ومطالبته يضغط زرار = إحباط بلا داعي.
      if (s.contains('TASK_EXPIRED')) {
        setState(() => _checking = false);
        await _fetchTask();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('المسألة قدمت — جديدة أهي')),
          );
        }
        return;
      }

      setState(() {
        _checking = false;
        _attempts += 1;
        _wrong = true;
        _answer.clear();
      });
      _focus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return PopScope(
      /// ️ في الصحيان الحقيقي ممنوع الخروج بزرار الرجوع — ده كان
      ///    هيبقى باب خلفي يقفل بيه المنبه من غير ما يحل.
      canPop: widget.isPreview,
      child: Scaffold(
        backgroundColor: c.background,
        appBar: widget.isPreview
            ? AppBar(
                title: const Text('تجربة'),
                backgroundColor: Colors.transparent,
              )
            : null,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(AppTheme.spaceXxl),
              child: _loading
                  ? const CircularProgressIndicator()
                  : _error != null
                      ? _errorView(c)
                      : _taskView(c),
            ),
          ),
        ),
      ),
    );
  }

  Widget _taskView(BalColors c) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.wb_sunny_rounded, size: 70, color: c.accent),
        const SizedBox(height: AppTheme.spaceLg),
        Text(
          widget.isPreview ? 'كده بيبقى شكلها' : 'صباح الخير 🌅',
          style: TextStyle(
            fontSize: BalType.heading,
            fontWeight: FontWeight.w700,
            color: c.text,
          ),
        ),
        const SizedBox(height: AppTheme.spaceSm),
        Text(
          'حل المسألة عشان المنبه يقفل',
          style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
        ),
        const SizedBox(height: AppTheme.spaceXxxl),

        // ── المسألة ──
        Container(
          padding: const EdgeInsets.symmetric(
              horizontal: AppTheme.spaceXxl, vertical: AppTheme.spaceXl),
          decoration: BoxDecoration(
            color: c.surfaceElevated,
            borderRadius: BorderRadius.circular(AppTheme.radiusXl),
            border: Border.all(color: c.border),
          ),
          child: Text(
            _question ?? '',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: BalType.display,
              fontWeight: FontWeight.w700,
              color: c.text,
            ),
          ),
        ),

        const SizedBox(height: AppTheme.spaceXl),

        // ── الإجابة ──
        TextField(
          controller: _answer,
          focusNode: _focus,
          enabled: !_checking,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          onSubmitted: (_) => _submit(),
          style: TextStyle(
            fontSize: BalType.heading,
            fontWeight: FontWeight.w700,
            color: c.text,
          ),
          decoration: InputDecoration(
            hintText: '؟',
            hintStyle: TextStyle(fontSize: BalType.heading, color: c.textDisabled),
            filled: true,
            fillColor: c.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              borderSide: BorderSide(color: _wrong ? c.danger : c.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              borderSide: BorderSide(
                color: _wrong ? c.danger : c.border,
                width: _wrong ? 1.5 : 1,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              borderSide: BorderSide(color: c.primary, width: 1.5),
            ),
          ),
        ),

        if (_wrong) ...[
          const SizedBox(height: AppTheme.spaceMd),
          Text(
            /// ️ بلا لوم — نفس قاعدة الرفيق. الغلط وانت نايم طبيعي.
            _attempts >= 3 ? 'خد وقتك، مفيش استعجال' : 'مش دي — جرّب تاني',
            style: TextStyle(fontSize: BalType.small, color: c.textSecondary),
          ),
        ],

        const SizedBox(height: AppTheme.spaceXxl),

        PillButton(
          label: widget.isPreview ? 'تمام' : 'اقفل المنبه',
          icon: Icons.check_rounded,
          loading: _checking,
          onPressed: _submit,
        ),
      ],
    );
  }

  Widget _errorView(BalColors c) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.cloud_off_rounded, size: 55, color: c.textDisabled),
        const SizedBox(height: AppTheme.spaceLg),
        Text(
          _error!,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: BalType.body, color: c.textSecondary),
        ),
        const SizedBox(height: AppTheme.spaceXl),
        OutlinePillButton(
          label: 'جرّب تاني',
          icon: Icons.refresh_rounded,
          onPressed: _fetchTask,
        ),
      ],
    );
  }
}
