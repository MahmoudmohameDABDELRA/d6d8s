import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/buttons.dart';
import '../../widgets/progress_ring.dart';

/// ✅ شاشة المهام — القائمة الحية (مولدة من الجبل + يدوية)
class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  List<BalTask> _tasks = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.tasks);
      final list = res['tasks'] as List? ?? res['data'] as List? ?? [];
      setState(() {
        _tasks = list
            .whereType<Map<String, dynamic>>()
            .map(BalTask.fromJson)
            .toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  /// إتمام المهمة → السلسلة الكاملة (Task → JourneyDay → ...)
  Future<void> _complete(BalTask task) async {
    try {
      final res = await ApiClient.instance
          .patch(ApiEndpoints.completeTask(task.id));
      if (mounted) {
        final mountain = res['mountain'];
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mountain != null && (mountain['summit'] == true)
                  ? '🏁 وصلت القمة — حققت هدفك!'
                  : 'أحسنت! مهمة منجزة',
            ),
          ),
        );
      }
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('فشل الإنجاز: ${e.toString().replaceAll('Exception: ', '')}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final pending = _tasks.where((t) => !t.isCompleted).toList();
    final done = _tasks.where((t) => t.isCompleted).toList();
    final progress = _tasks.isEmpty ? 0.0 : pending.length / _tasks.length;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: c.primary,
          backgroundColor: c.surfaceElevated,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: _header(context, c, progress)),
              if (_loading)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _errorView(c),
                )
              else ...[
                if (pending.isEmpty && done.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _emptyView(c),
                  )
                else ...[
                  if (pending.isNotEmpty)
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => _TaskTile(
                            task: pending[i],
                            onComplete: () => _complete(pending[i]),
                          ),
                          childCount: pending.length,
                        ),
                      ),
                    ),
                  if (done.isNotEmpty) ...[
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                      sliver: SliverToBoxAdapter(
                        child: Text('منجز',
                            style: TextStyle(color: c.textSecondary, fontSize: 13)),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, i) => _TaskTile(
                            task: done[i],
                            onComplete: null,
                          ),
                          childCount: done.length,
                        ),
                      ),
                    ),
                  ],
                ],
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 110)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, BalColors c, double progress) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          AppTheme.spaceXxl, AppTheme.spaceLg, AppTheme.spaceXxl, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('مهامك',
                  style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: c.text)),
              const Spacer(),
              IconCircleButton(
                icon: Icons.add_rounded,
                onPressed: () => showAddTaskSheet(context).then((_) => _load()),
                tooltip: 'إضافة مهمة',
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: LinearProgressBar(progress: progress),
              ),
              const SizedBox(width: 12),
              Text(
                '${_tasks.where((t) => !t.isCompleted).length} باقي',
                style: TextStyle(color: c.textSecondary, fontSize: 13),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _errorView(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded, size: 56, color: c.textDisabled),
            const SizedBox(height: 16),
            Text('مفيش اتصال بالباك',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.text)),
            const SizedBox(height: 20),
            OutlinePillButton(label: 'إعادة المحاولة', icon: Icons.refresh_rounded, onPressed: _load),
          ],
        ),
      ),
    );
  }

  Widget _emptyView(BalColors c) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.task_alt_rounded, size: 70, color: c.textDisabled),
            const SizedBox(height: 16),
            Text('يومك فاضي — أحلى حاجة',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.text)),
            const SizedBox(height: 8),
            // ️ كانت بتقول «هتيجي لوحدها» وهي مش بتيجي إلا لما
            //    المستخدم يوافق على جبله. الوعد الكاذب أسوأ من الصمت.
            Text('لو مثبّت جبلك، مهام النهاردة بتنزل هنا لوحدها كل يوم — وتقدر تضيف مهامك براحتك',
                textAlign: TextAlign.center,
                style: TextStyle(color: c.textSecondary)),
          ],
        ),
      ),
    );
  }
}

/// بطاقة مهمة
class _TaskTile extends StatelessWidget {
  final BalTask task;
  final VoidCallback? onComplete;

  const _TaskTile({required this.task, this.onComplete});

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final isMountain = task.fromMountain;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(AppTheme.spaceLg),
      decoration: BoxDecoration(
        color: c.surfaceElevated.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(
          color: isMountain ? c.primary.withValues(alpha: 0.4) : c.border,
          width: isMountain ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: c.isDark ? 0.12 : 0.05),
            offset: const Offset(0, 4),
            blurRadius: 14,
          ),
        ],
      ),
      child: Row(
        children: [
          // زر الإنجاز
          GestureDetector(
            onTap: onComplete,
            child: AnimatedContainer(
              duration: AppTheme.standard,
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: task.isCompleted ? c.primary : Colors.transparent,
                border: Border.all(
                  color: task.isCompleted ? c.primary : c.textDisabled,
                  width: 2,
                ),
              ),
              child: task.isCompleted
                  ? Icon(Icons.check_rounded,
                      size: 18,
                      color: c.isDark ? const Color(0xFF0A1F14) : Colors.white)
                  : null,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        task.title,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: task.isCompleted ? c.textDisabled : c.text,
                          decoration: task.isCompleted
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (isMountain) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: c.primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.terrain_rounded, size: 10, color: c.primary),
                            const SizedBox(width: 3),
                            Text('من الجبل',
                                style: TextStyle(fontSize: 9, color: c.primary, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                if (task.startTime != null || task.endTime != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    '${task.startTime ?? '--'} - ${task.endTime ?? '--'}',
                    style: TextStyle(color: c.textSecondary, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ➕ شيت إضافة مهمة يدوية (POST /tasks)
Future<void> showAddTaskSheet(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _AddTaskSheet(),
  );
}

class _AddTaskSheet extends StatefulWidget {
  const _AddTaskSheet();

  @override
  State<_AddTaskSheet> createState() => _AddTaskSheetState();
}

class _AddTaskSheetState extends State<_AddTaskSheet> {
  final _title = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ApiClient.instance.post(ApiEndpoints.tasks, body: {
        'title': title,
      });
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('المهمة اتضافت ✅')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('فشل: ${e.toString().replaceAll('Exception: ', '')}')),
        );
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: BoxDecoration(
          color: c.glassStrong,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                      color: c.textDisabled,
                      borderRadius: BorderRadius.circular(999))),
            ),
            const SizedBox(height: 20),
            Text('مهمة جديدة',
                style: TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w700, color: c.text)),
            const SizedBox(height: 16),
            TextField(
              controller: _title,
              style: TextStyle(color: c.text),
              autofocus: true,
              decoration: InputDecoration(
                hintText: 'عنوان المهمة...',
                hintStyle: TextStyle(color: c.textDisabled),
                filled: true,
                fillColor: c.surface.withValues(alpha: 0.5),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  borderSide: BorderSide(color: c.border),
                ),
              ),
            ),
            const SizedBox(height: 16),
            PillButton(
              label: 'حفظ المهمة',
              icon: Icons.check_rounded,
              loading: _saving,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
