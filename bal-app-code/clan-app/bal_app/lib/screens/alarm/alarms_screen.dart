import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import 'wake_task_screen.dart';

/// ⏰ المنبهات
///
/// ️ السيرفر فيه 14 نقطة للمنبه (منبهات · مهمة فك النوم · غفوة بنداء
///    AI · إثبات استيقاظ · سلسلة · تحديات) وماكانش ليه **أي** شاشة.
///    كان فيه زرار «منبه» في قايمة الإنشاء بـ TODO بيقفل القائمة
///    ومش بيعمل حاجة — شيلته وقتها ودلوقتي بيرجع شغال.
///
/// الفكرة المميزة: المنبه مش بيقفل بضغطة — لازم تحل مسألة.
class AlarmsScreen extends StatefulWidget {
  const AlarmsScreen({super.key});

  @override
  State<AlarmsScreen> createState() => _AlarmsScreenState();
}

class _AlarmsScreenState extends State<AlarmsScreen> {
  List<BalAlarm> _alarms = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.alarms);
      final list = res['alarms'] as List? ?? const [];
      if (!mounted) return;
      setState(() {
        _alarms = list
            .whereType<Map<String, dynamic>>()
            .map(BalAlarm.fromJson)
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

  Future<void> _add() async {
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => const _AlarmDialog(),
    );
    if (created == true) await _load();
  }

  Future<void> _toggle(BalAlarm a) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ApiClient.instance.patch(
        ApiEndpoints.alarm(a.id),
        body: {'isActive': !a.isActive},
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  Future<void> _delete(BalAlarm a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تمسح المنبه؟'),
        content: Text('منبه ${a.time} — ${a.daysLabel}'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('إلغاء')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('امسح')),
        ],
      ),
    );
    if (ok != true) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ApiClient.instance.delete(ApiEndpoints.alarm(a.id));
      await _load();
    } catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: const Text('المنبهات'),
        backgroundColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: _add,
            tooltip: 'منبه جديد',
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? _errorView(c)
                : RefreshIndicator(
                    onRefresh: _load,
                    child: _alarms.isEmpty
                        ? _emptyView(c)
                        : ListView(
                            padding: const EdgeInsets.fromLTRB(
                                AppTheme.spaceXl, 0, AppTheme.spaceXl, 40),
                            children: [
                              if (_bestStreak > 0) _streakCard(c),
                              const SizedBox(height: AppTheme.spaceMd),
                              ..._alarms.map((a) => _alarmCard(c, a)),
                              const SizedBox(height: AppTheme.spaceXl),
                              _tryWakeTask(c),
                            ],
                          ),
                  ),
      ),
    );
  }

  int get _bestStreak => _alarms.isEmpty
      ? 0
      : _alarms.map((a) => a.wakeStreak).reduce((a, b) => a > b ? a : b);

  Widget _streakCard(BalColors c) {
    return GlassCard(
      child: Row(
        children: [
          Icon(Icons.local_fire_department_rounded, color: c.accent, size: 32),
          const SizedBox(width: AppTheme.spaceMd),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$_bestStreak يوم ورا بعض',
                  style: TextStyle(
                    fontSize: 18.5,
                    fontWeight: FontWeight.w700,
                    color: c.text,
                  ),
                ),
                Text(
                  'صحيت في معادك',
                  style: TextStyle(fontSize: 14, color: c.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _alarmCard(BalColors c, BalAlarm a) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceMd),
      child: GlassCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    a.time,
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                      /// المنبه المقفول باهت — الحالة تبان من غير قراءة
                      color: a.isActive ? c.text : c.textDisabled,
                    ),
                  ),
                  const SizedBox(height: 2.5),
                  Text(
                    a.daysLabel,
                    style: TextStyle(
                      fontSize: 14.5,
                      color: a.isActive ? c.textSecondary : c.textDisabled,
                    ),
                  ),
                  if (a.requireProof) ...[
                    const SizedBox(height: AppTheme.spaceSm),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.psychology_rounded,
                            size: 15, color: c.accent),
                        const SizedBox(width: 4.5),
                        Text(
                          'بمسألة',
                          style: TextStyle(fontSize: 13, color: c.accent),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Column(
              children: [
                Switch(
                  value: a.isActive,
                  activeThumbColor: c.primary,
                  onChanged: (_) => _toggle(a),
                ),
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded,
                      color: c.textDisabled, size: 22),
                  onPressed: () => _delete(a),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// تجربة مهمة فك النوم من غير ما تستنى المنبه
  Widget _tryWakeTask(BalColors c) {
    return OutlinePillButton(
      label: 'جرّب مهمة الصحيان',
      icon: Icons.play_circle_outline_rounded,
      onPressed: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const WakeTaskScreen(isPreview: true)),
      ),
    );
  }

  Widget _emptyView(BalColors c) {
    return ListView(
      children: [
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.15),
        Padding(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          child: Column(
            children: [
              Icon(Icons.alarm_rounded, size: 80, color: c.textDisabled),
              const SizedBox(height: AppTheme.spaceLg),
              Text(
                'مفيش منبهات',
                style: TextStyle(
                  fontSize: 20.5,
                  fontWeight: FontWeight.w600,
                  color: c.text,
                ),
              ),
              const SizedBox(height: AppTheme.spaceSm),
              Text(
                'المنبه هنا مش بيقفل بضغطة — لازم تحل مسألة الأول',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15.5, color: c.textSecondary),
              ),
              const SizedBox(height: AppTheme.spaceXxl),
              PillButton(
                label: 'اعمل منبه',
                icon: Icons.add_rounded,
                fullWidth: false,
                onPressed: _add,
              ),
            ],
          ),
        ),
      ],
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
            Text(_error!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 15, color: c.textSecondary)),
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

// ══════════════════════════════════════════════
//  إضافة منبه
// ══════════════════════════════════════════════

class _AlarmDialog extends StatefulWidget {
  const _AlarmDialog();

  @override
  State<_AlarmDialog> createState() => _AlarmDialogState();
}

class _AlarmDialogState extends State<_AlarmDialog> {
  TimeOfDay _time = const TimeOfDay(hour: 6, minute: 0);

  /// الافتراضي أيام الشغل — أكتر حالة استخدام
  final Set<int> _days = {0, 1, 2, 3, 4};
  bool _requireProof = true;
  bool _busy = false;
  String? _error;

  String get _timeString =>
      '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}';

  Future<void> _pickTime() async {
    final picked = await showTimePicker(context: context, initialTime: _time);
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _submit() async {
    if (_days.isEmpty) {
      setState(() => _error = 'اختار يوم على الأقل');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ApiClient.instance.post(ApiEndpoints.alarms, body: {
        'time': _timeString,
        'days': _days.toList()..sort(),
        'requireProof': _requireProof,
      });
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      final s = e.toString();
      setState(() {
        _busy = false;
        if (s.contains('409') && s.contains('MAX')) {
          _error = 'وصلت للحد الأقصى من المنبهات';
        } else if (s.contains('409')) {
          _error = 'عندك منبه في نفس الوقت واليوم';
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
      title: const Text('منبه جديد'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: GestureDetector(
                onTap: _busy ? null : _pickTime,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: AppTheme.spaceXxl,
                      vertical: AppTheme.spaceMd),
                  decoration: BoxDecoration(
                    color: c.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                  ),
                  child: Text(
                    _timeString,
                    style: TextStyle(
                      fontSize: 39,
                      fontWeight: FontWeight.w700,
                      color: c.primary,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppTheme.spaceLg),
            Text('الأيام',
                style: TextStyle(fontSize: 14.5, color: c.textSecondary)),
            const SizedBox(height: AppTheme.spaceSm),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: List.generate(7, (i) {
                final on = _days.contains(i);
                return GestureDetector(
                  onTap: _busy
                      ? null
                      : () => setState(() {
                            on ? _days.remove(i) : _days.add(i);
                          }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppTheme.spaceMd, vertical: AppTheme.spaceSm),
                    decoration: BoxDecoration(
                      color: on ? c.primary : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                      border: Border.all(color: on ? c.primary : c.border),
                    ),
                    child: Text(
                      BalAlarm.dayNames[i],
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: on ? FontWeight.w600 : FontWeight.w400,
                        color: on ? c.onPrimary : c.textSecondary,
                      ),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: AppTheme.spaceMd),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _requireProof,
              activeThumbColor: c.primary,
              onChanged: _busy ? null : (v) => setState(() => _requireProof = v),
              title: Text('يقفل بمسألة',
                  style: TextStyle(fontSize: 15, color: c.text)),
              subtitle: Text(
                'من غيرها هتقفله وانت نايم',
                style: TextStyle(fontSize: 13, color: c.textSecondary),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppTheme.spaceSm),
              Text(_error!, style: TextStyle(color: c.danger, fontSize: 14)),
            ],
          ],
        ),
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
              : const Text('احفظ'),
        ),
      ],
    );
  }
}
