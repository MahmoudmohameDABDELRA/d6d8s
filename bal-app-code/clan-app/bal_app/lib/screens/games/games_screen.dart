import 'package:flutter/material.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_error.dart';
import '../../core/network/api_endpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/skeleton.dart';
import 'snake_game_screen.dart';

/// 🎮 غرف وقت الراحة
///
/// ️ قاعدة المنتج المفروضة من السيرفر — ومقصودة:
///
///    الألعاب **مقفولة برّه وقت الراحة**. `requireBreak()` في
///    الكنترولر بيرفض إنشاء غرفة أو الانضمام أثناء التركيز،
///    والغرف بتتقفل تلقائياً أول ما الراحة تخلص.
///
///    ده مش تقييد تعسّفي: «بال» تطبيق إنتاجية. لعبة متاحة طول
///    الوقت بتبقى وسيلة تهرّب من المهام. لعبة متاحة ٥ دقايق
///    بين جلستين بتبقى مكافأة — ودي اللي بتخلي الناس تكمّل.
///
///    والغرفة مربوطة بعشيرة، والانضمام مقصور على أعضائها.
class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key});

  @override
  State<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends State<GamesScreen> {
  bool _loading = true;
  bool _isBreak = false;
  int _remainingMin = 0;
  String? _error;
  bool _busy = false;

  List<Map<String, dynamic>> _games = const [];
  List<Map<String, dynamic>> _rooms = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.get(ApiEndpoints.games);
      if (!mounted) return;

      setState(() {
        _isBreak = res['isBreakTime'] == true;
        _remainingMin = (res['remainingMinutes'] as num?)?.toInt() ?? 0;
        _games = (res['games'] as List? ?? const [])
            .whereType<Map>()
            .map((g) => g.cast<String, dynamic>())
            .toList();
        _rooms = (res['openRooms'] as List? ?? const [])
            .whereType<Map>()
            .map((r) => r.cast<String, dynamic>())
            .toList();
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = humanError(e, fallback: 'مقدرناش نجيب الألعاب');
        _loading = false;
      });
    }
  }

  Future<void> _createRoom() async {
    if (_busy) return;
    setState(() => _busy = true);

    try {
      /// ️ بنجيب عشيرة المستخدم الأول — الغرفة لازم تتربط بعشيرة
      ///    عشان الانضمام يتقفل على أعضائها. من غير `clanId` أي
      ///    حد معاه الكود يدخل (وده كان مثبَّت كثغرة قبل كده).
      final clans = await ApiClient.instance.get(ApiEndpoints.myClans);
      final list = (clans['clans'] as List? ?? const []).whereType<Map>();

      if (list.isEmpty) {
        if (!mounted) return;
        setState(() => _busy = false);
        _snack('لازم تكون في عشيرة الأول — روح لتبويب العشائر');
        return;
      }

      final clanId = list.first['id']?.toString();

      final res = await ApiClient.instance.post(
        ApiEndpoints.gameRooms,
        body: {'type': 'SNAKE', if (clanId != null) 'clanId': clanId},
      );

      final room = (res['room'] as Map?)?.cast<String, dynamic>();
      if (!mounted) return;
      setState(() => _busy = false);

      if (room != null) _open(room['id']?.toString(), room['code']?.toString());
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(humanError(e, fallback: 'مقدرناش نعمل الغرفة'));
    }
  }

  Future<void> _joinByCode() async {
    final code = await _askCode();
    if (code == null || code.trim().isEmpty) return;

    setState(() => _busy = true);
    try {
      final res = await ApiClient.instance.post(
        ApiEndpoints.gameRoomJoin,
        body: {'code': code.trim().toUpperCase()},
      );
      final room = (res['room'] as Map?)?.cast<String, dynamic>();
      if (!mounted) return;
      setState(() => _busy = false);
      _open(
        room?['id']?.toString(),
        room?['code']?.toString() ?? code.trim().toUpperCase(),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      _snack(humanError(e, fallback: 'مقدرناش ندخلك'));
    }
  }

  void _open(String? id, String? code) {
    if (id == null) return;
    Navigator.of(context)
        .push(MaterialPageRoute(
          builder: (_) => SnakeGameScreen(roomId: id, roomCode: code ?? '—'),
        ))
        .then((_) => _load());
  }

  Future<String?> _askCode() {
    final ctrl = TextEditingController();
    final c = BalColors(context);

    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: c.surfaceElevated,
        title: Text('كود الغرفة', style: Theme.of(ctx).textTheme.titleMedium),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(hintText: 'مثال: A3F9K2'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('إلغاء'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text),
            child: const Text('يلا'),
          ),
        ],
      ),
    );
  }

  void _snack(String text) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final c = BalColors(context);

    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        title: const Text('وقت الراحة'),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: _loading
            ? const CardListSkeleton(count: 3, height: 110)
            : _error != null
                ? _errorView(c)
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(AppTheme.spaceLg),
                      children: [
                        _statusCard(c),
                        const SizedBox(height: AppTheme.spaceLg),
                        if (_isBreak) ...[
                          _actions(c),
                          const SizedBox(height: AppTheme.spaceXl),
                          if (_rooms.isNotEmpty) ...[
                            Text('غرف مفتوحة',
                                style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: AppTheme.spaceMd),
                            ..._rooms.map((r) => _roomCard(c, r)),
                            const SizedBox(height: AppTheme.spaceLg),
                          ],
                        ],
                        Text('الألعاب',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: AppTheme.spaceMd),
                        ..._games.map((g) => _gameCard(c, g)),
                      ],
                    ),
                  ),
      ),
    );
  }

  /// الكارت اللي بيقول: انت في راحة ولا في تركيز؟
  Widget _statusCard(BalColors c) {
    final text = Theme.of(context).textTheme;

    return GlassCard(
      padding: const EdgeInsets.all(AppTheme.spaceXl),
      child: Row(
        children: [
          Text(_isBreak ? '☕' : '🎯', style: const TextStyle(fontSize: BalEmoji.header)),
          const SizedBox(width: AppTheme.spaceLg),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isBreak ? 'وقت راحة' : 'وقت تركيز',
                  style: text.titleMedium?.copyWith(
                    color: _isBreak ? c.accent : c.primary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _isBreak
                      ? 'باقي $_remainingMin دقيقة — العب مع عشيرتك'
                      : 'الألعاب بتفتح في الراحة بس · باقي $_remainingMin دقيقة',
                  style: text.bodySmall?.copyWith(color: c.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actions(BalColors c) {
    return Row(
      children: [
        Expanded(
          child: PillButton(
            label: 'اعمل غرفة',
            icon: Icons.add_rounded,
            loading: _busy,
            onPressed: _createRoom,
          ),
        ),
        const SizedBox(width: AppTheme.spaceMd),
        Expanded(
          child: OutlinePillButton(
            label: 'ادخل بكود',
            icon: Icons.tag_rounded,
            onPressed: _busy ? null : _joinByCode,
          ),
        ),
      ],
    );
  }

  Widget _roomCard(BalColors c, Map<String, dynamic> r) {
    final text = Theme.of(context).textTheme;
    final players = (r['players'] as num?)?.toInt() ?? 0;
    final max = (r['maxPlayers'] as num?)?.toInt() ?? 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceMd),
      child: GlassCard(
        padding: const EdgeInsets.all(AppTheme.spaceLg),
        child: Row(
          children: [
            const Text('🐍', style: TextStyle(fontSize: BalEmoji.inline)),
            const SizedBox(width: AppTheme.spaceMd),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('غرفة ${r['code'] ?? ''}',
                      style: text.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  Text('$players من $max لاعب',
                      style:
                          text.bodySmall?.copyWith(color: c.textSecondary)),
                ],
              ),
            ),
            OutlinePillButton(
              label: 'ادخل',
              onPressed: () =>
                  _open(r['id']?.toString(), r['code']?.toString()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _gameCard(BalColors c, Map<String, dynamic> g) {
    final text = Theme.of(context).textTheme;
    final isSnake = g['type'] == 'SNAKE';

    return Padding(
      padding: const EdgeInsets.only(bottom: AppTheme.spaceMd),
      child: Opacity(
        //  اللي لسه مالوش واجهة بيبان مطفي — بلا كذب
        opacity: isSnake ? 1 : 0.45,
        child: GlassCard(
          padding: const EdgeInsets.all(AppTheme.spaceLg),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(isSnake ? '🐍' : '🎲', style: const TextStyle(fontSize: BalEmoji.item)),
              const SizedBox(width: AppTheme.spaceMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text((g['title'] ?? '').toString(),
                        style: text.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 3),
                    Text(
                      isSnake
                          ? (g['description'] ?? '').toString()
                          : 'لسه جاي — السيرفر جاهز والواجهة تحت الشغل',
                      style: text.bodySmall?.copyWith(color: c.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
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
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: c.textSecondary),
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
