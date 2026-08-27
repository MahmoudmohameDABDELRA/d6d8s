import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_state.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/network/api_error.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/skeleton.dart';
import '../alarm/alarms_screen.dart';
import '../games/games_screen.dart';

/// 👤 شاشة «أنا»
///
/// ═══════════════════════════════════════════════════════════
/// ️ اللي كان ناقص، والدرس المأخوذ من التطبيقات الكبيرة:
///
/// الشاشة كانت بتعرض **رقمين** (سلسلة + Sparks) من الكاش
/// المحلي، بينما `/auth/me/stats` بيرجّع بروفايل كامل: ساعات
/// التركيز، عدد الجلسات، مهام اليوم، الأوسمة المفتوحة، عدد
/// العشائر، وتاريخ الانضمام. كل ده كان بيتحسب في السيرفر
/// ومحدش بيسأل عنه.
///
/// **الدرس من دوولينجو وستريفا:** صفحة البروفايل مش صفحة
/// إعدادات فيها اسم. دي **سجلّ إنجاز** — المستخدم بيفتحها
/// عشان يشوف إنه بيتقدّم فعلاً. الرقم اللي بيكبر هو اللي
/// بيرجّعه بكرة.
///
/// **الدرس من ستريفا تحديداً:** «النهاردة» أهم من «الإجمالي».
/// الإجمالي بيمدح الماضي؛ النهاردة بيحرّك دلوقتي. فبنعرض
/// الاتنين — والنهاردة فوق.
///
/// ️ ومفيش رقم مخترع: أي حقل مش موجود في رد السيرفر مبيتعرضش
///   خالص. الشاشة القديمة كانت بتعرض «4:00 فجراً» وهو وقت
///   مالوش أي مصدر.
/// ═══════════════════════════════════════════════════════════
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _stats;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.meStats);
      if (!mounted) return;
      setState(() {
        _stats = res;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = humanError(e, fallback: 'مقدرناش نجيب إحصائياتك');
      });
    }
  }

  /// قراءة آمنة لقيمة متداخلة — `_num('focus', 'totalHours')`
  num? _num(String group, String key) {
    final g = _stats?[group];
    if (g is! Map) return null;
    return g[key] as num?;
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);
    final state = context.watch<AppState>();
    final user = state.user;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(AppTheme.spaceXxl),
            children: [
              Row(
                children: [
                  Text(
                    'أنا',
                    style: TextStyle(
                      fontSize: BalType.display,
                      fontWeight: FontWeight.w700,
                      color: c.text,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: Icon(
                      state.isDark
                          ? Icons.light_mode_rounded
                          : Icons.dark_mode_rounded,
                      color: c.textSecondary,
                    ),
                    tooltip: state.isDark ? 'الوضع الفاتح' : 'الوضع الداكن',
                    onPressed: () =>
                        context.read<AppState>().setDark(!state.isDark),
                  ),
                ],
              ),
              const SizedBox(height: AppTheme.spaceLg),

              _identityCard(c, user),
              const SizedBox(height: AppTheme.spaceLg),

              if (_loading)
                const CardListSkeleton(count: 2, height: 110)
              else ...[
                _todayCard(c),
                const SizedBox(height: AppTheme.spaceLg),
                _totalsCard(c),
              ],

              const SizedBox(height: AppTheme.spaceXl),

              _actionTile(
                context,
                Icons.alarm_rounded,
                'المنبهات',
                'صحيان بمهمة — بيرن حتى والتطبيق مقفول',
                () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const AlarmsScreen()),
                ),
              ),
              _actionTile(
                context,
                Icons.sports_esports_rounded,
                'ألعاب الراحة',
                'مفتوحة وقت الراحة بس',
                () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const GamesScreen()),
                ),
              ),

              const SizedBox(height: AppTheme.spaceXxl),
              OutlinePillButton(
                label: 'تسجيل الخروج',
                icon: Icons.logout_rounded,

                /// ️ `unawaited` مقصود: الخروج بقى async (بيلغي تسجيل
                ///    الجهاز في السيرفر الأول)، بس المستخدم مش المفروض
                ///    يستنى الشبكة عشان يخرج.
                onPressed: () => unawaited(context.read<AppState>().logout()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ══════════════════════════════════════════════
  //  الكروت
  // ══════════════════════════════════════════════

  Widget _identityCard(BalColors c, dynamic user) {
    final since = _stats?['profile']?['memberSince'];
    final joined = since == null ? null : DateTime.tryParse(since.toString());

    return GlassCard(
      child: Column(
        children: [
          CircleAvatar(
            radius: 38.5,
            backgroundColor: c.primary.withValues(alpha: 0.2),
            child: Icon(Icons.person_rounded, size: 46, color: c.primary),
          ),
          const SizedBox(height: AppTheme.spaceMd),
          Text(
            user?.username ?? 'مستخدم',
            style: TextStyle(
              fontSize: BalType.titleLg,
              fontWeight: FontWeight.w700,
              color: c.text,
            ),
          ),
          if (user?.companionName != null) ...[
            const SizedBox(height: 4.5),
            Text(
              'رفيقي: ${user!.companionName}',
              style: TextStyle(color: c.accent, fontSize: BalType.body),
            ),
          ],

          //  «معانا من…» — بيبني إحساس بالاستمرار
          if (joined != null) ...[
            const SizedBox(height: 6),
            Text(
              'معانا من ${_monthYear(joined)}',
              style: TextStyle(
                color: c.textDisabled,
                fontSize: BalType.caption,
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// 🎯 النهاردة — الكارت اللي بيحرّك
  ///
  /// ️ فوق «الإجمالي» عن قصد. الإجمالي بيمدح الماضي، والنهاردة
  ///    بيقول «فاضلك إيه دلوقتي». ستريفا ودوولينجو بيبدأوا
  ///    باليوم مش بالعمر — وده مش تفصيلة تصميم، ده اللي بيخلي
  ///    المستخدم يرجع.
  Widget _todayCard(BalColors c) {
    final focusMin = _num('today', 'focusMin')?.toInt() ?? 0;
    final tasks = _num('today', 'tasksCompleted')?.toInt() ?? 0;
    /**
     * ️ `streak` **كائن** مش رقم. اتأكدت بالتشغيل:
     *      "streak": { current, longest, activeToday, atRisk, ... }
     *
     *    الترتيب الغلط (`as num` الأول) كان بيرجّع صفر دايماً
     *    لأن الكائن مش رقم. الخطأ ده مبيرميش — بيعرض صفر بهدوء،
     *    وده أسوأ: المستخدم يفتكر إنه خسر سلسلته.
     */
    final streakObj = _stats?['streak'];
    final streak = streakObj is Map
        ? (streakObj['current'] as num?)?.toInt() ?? 0
        : (streakObj as num?)?.toInt() ?? 0;

    /// السلسلة في خطر النهاردة؟ السيرفر بيحسبها ومحدش كان بيسأل.
    final atRisk = streakObj is Map && streakObj['atRisk'] == true;
    final activeToday = streakObj is Map && streakObj['activeToday'] == true;

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'النهاردة',
                style: TextStyle(
                  fontSize: BalType.small,
                  fontWeight: FontWeight.w600,
                  color: c.textSecondary,
                ),
              ),
              const Spacer(),
              //  علامة صغيرة إن اليوم اتحسب خلاص
              if (activeToday)
                Icon(Icons.check_circle_rounded, size: 15, color: c.primary),
            ],
          ),
          const SizedBox(height: AppTheme.spaceMd),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _metric(c, '🔥', '$streak', 'سلسلة'),
              _metric(c, '⏱️', _duration(focusMin), 'تركيز'),
              _metric(c, '✅', '$tasks', 'مهمة'),
            ],
          ),

          /// ️ «سلسلتك في خطر» — السيرفر بيحسب `atRisk` ومحدش
          ///    كان بيسأل عنه.
          ///
          ///    الدرس من دوولينجو: التنبيه ده بيشتغل لأنه **خسارة
          ///    وشيكة** مش مكسب محتمل. الناس بتتحرك عشان ما تخسرش
          ///    أكتر ما بتتحرك عشان تكسب. بس بنستخدمه بجرعة واحدة
          ///    في اليوم وبنبرة هادية — الإلحاح بيولّد مناعة.
          if (atRisk && streak > 0) ...[
            const SizedBox(height: AppTheme.spaceMd),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: AppTheme.spaceMd,
                vertical: AppTheme.spaceSm,
              ),
              decoration: BoxDecoration(
                color: c.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              ),
              child: Row(
                children: [
                  const Text('⏳', style: TextStyle(fontSize: BalType.body)),
                  const SizedBox(width: AppTheme.spaceSm),
                  Expanded(
                    child: Text(
                      'سلسلة $streak يوم مستنياك النهاردة',
                      style: TextStyle(
                        fontSize: BalType.caption,
                        color: c.text,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// 📊 الإجمالي — سجلّ الإنجاز
  Widget _totalsCard(BalColors c) {
    final hours = _num('focus', 'totalHours');
    final sessions = _num('focus', 'totalSessions')?.toInt();
    final tasks = _num('tasks', 'completed')?.toInt();
    final unlocked = _num('achievements', 'unlocked')?.toInt();
    final totalAch = _num('achievements', 'total')?.toInt();
    final sparks = _num('sparks', 'balance')?.toInt();
    final clans = _num('clans', 'count')?.toInt();

    final streakObj = _stats?['streak'];
    final longestStreak =
        streakObj is Map ? (streakObj['longest'] as num?)?.toInt() : null;

    /**
     * ️ كل سطر بيتعرض **بس** لو السيرفر بعت قيمته.
     *
     *    الشاشة القديمة كانت بتعرض `?? 0` على طول، فالمستخدم
     *    اللي الشبكة وقعت عنده كان بيشوف أصفار — ويفتكر إنه
     *    خسر تقدّمه. الفراغ أصدق من صفر كاذب.
     */
    final rows = <Widget>[
      if (hours != null) _row(c, '⏱️', 'ساعات تركيز', _hours(hours)),
      if (sessions != null) _row(c, '🎯', 'جلسة خلصت', '$sessions'),
      if (tasks != null) _row(c, '✅', 'مهمة منجزة', '$tasks'),
      if (unlocked != null && totalAch != null)
        _row(c, '🏅', 'أوسمة', '$unlocked من $totalAch'),
      if (sparks != null) _row(c, '⭐', 'Sparks', '$sparks'),
      if (clans != null && clans > 0) _row(c, '🛡️', 'عشيرة', '$clans'),
      //  أطول سلسلة — رقم قياسي شخصي يستاهل يتشاف
      if (longestStreak != null && longestStreak > 0)
        _row(c, '🏆', 'أطول سلسلة', '$longestStreak يوم'),
    ];

    if (rows.isEmpty && _error != null) {
      return GlassCard(
        child: Row(
          children: [
            Icon(Icons.cloud_off_rounded, color: c.textDisabled, size: 20),
            const SizedBox(width: AppTheme.spaceSm),
            Expanded(
              child: Text(
                _error!,
                style: TextStyle(
                  fontSize: BalType.small,
                  color: c.textSecondary,
                ),
              ),
            ),
            TextButton(
              onPressed: _load,
              style: TextButton.styleFrom(minimumSize: const Size(0, 48)),
              child: const Text('جرّب تاني'),
            ),
          ],
        ),
      );
    }

    if (rows.isEmpty) return const SizedBox.shrink();

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'من البداية',
            style: TextStyle(
              fontSize: BalType.small,
              fontWeight: FontWeight.w600,
              color: c.textSecondary,
            ),
          ),
          const SizedBox(height: AppTheme.spaceSm),
          ...rows,
        ],
      ),
    );
  }

  // ══════════════════════════════════════════════
  //  عناصر صغيرة
  // ══════════════════════════════════════════════

  Widget _metric(BalColors c, String emoji, String value, String label) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: BalEmoji.inline)),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: BalType.titleLg,
            fontWeight: FontWeight.w700,
            color: c.text,
          ),
        ),
        Text(
          label,
          style: TextStyle(color: c.textSecondary, fontSize: BalType.caption),
        ),
      ],
    );
  }

  Widget _row(BalColors c, String emoji, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Text(emoji, style: const TextStyle(fontSize: BalType.body)),
          const SizedBox(width: AppTheme.spaceMd),
          Expanded(
            child: Text(
              label,
              style: TextStyle(fontSize: BalType.small, color: c.textSecondary),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: BalType.body,
              fontWeight: FontWeight.w700,
              color: c.text,
            ),
          ),
        ],
      ),
    );
  }

  /// دقايق → صيغة مقروءة. ️ «٩٠ دقيقة» أوضح من «1.5 ساعة»
  ///    تحت الساعتين، وبعدها العكس.
  String _duration(int minutes) {
    if (minutes < 60) return '$minutes د';
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return m == 0 ? '$h س' : '$h س $m د';
  }

  String _hours(num h) {
    if (h < 1) return '${(h * 60).round()} د';
    //  رقم عشري واحد بس — «12.4 ساعة» مش «12.37»
    return h % 1 == 0 ? '${h.toInt()}' : h.toStringAsFixed(1);
  }

  String _monthYear(DateTime d) {
    const months = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
    ];
    return '${months[d.month - 1]} ${d.year}';
  }

  Widget _actionTile(
    BuildContext context,
    IconData icon,
    String title,
    String subtitle,
    VoidCallback onTap,
  ) {
    final c = BalColors(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceSm),
      child: Material(
        color: c.surfaceElevated.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          child: Container(
            padding: const EdgeInsets.all(AppTheme.spaceMd),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              border: Border.all(color: c.border),
            ),
            child: Row(
              children: [
                Icon(icon, color: c.primary, size: 25.5),
                const SizedBox(width: AppTheme.spaceMd),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: BalType.body,
                          fontWeight: FontWeight.w600,
                          color: c.text,
                        ),
                      ),
                      if (subtitle.isNotEmpty)
                        Text(
                          subtitle,
                          style: TextStyle(
                            fontSize: BalType.caption,
                            color: c.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_left_rounded, color: c.textDisabled),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
