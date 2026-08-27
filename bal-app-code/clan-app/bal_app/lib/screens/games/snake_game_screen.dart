import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
//  `Ticker` مش في material — بيتصدّر من scheduler
import 'package:flutter/scheduler.dart' show Ticker;
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../core/network/api_endpoints.dart';
import '../../core/storage/token_store.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/buttons.dart';

/// 🐍 لعبة الثعبان — وقت الراحة مع العشيرة
///
/// ═══════════════════════════════════════════════════════════
/// ️ الحالة قبل الملف ده:
///
///    السيرفر فيه محرّك لعبة كامل (`snake.game.js` — ٦٦٣ سطر):
///    غرف منفصلة، توثيق JWT، حلقة ٣٠ إطار في الثانية، تصادم،
///    أكل، لوحة صدارة، إغلاق تلقائي آخر الراحة. و**مفيش ولا
///    ملف واحد في التطبيق بينده عليه**. المحرّك كان شغّال في
///    الفراغ.
///
/// ️ ليه الرسم بـ `CustomPainter` مش ويدجتس:
///
///    الساحة فيها لحد ٨ ثعابين × ٢٠٠ قطعة + ٥٠ أكلة = آلاف
///    العناصر بتتحدّث ٣٠ مرة في الثانية. شجرة ويدجتس بالحجم
///    ده هتقتل الفريم. الرسم المباشر بيعدّي كله في `paint` واحدة.
///
/// ️ الاستيفاء (interpolation) — أهم قرار في الملف:
///
///    السيرفر بيبعت ٣٠ تحديث/ثانية، والشاشة بترسم ٦٠. لو رسمنا
///    آخر حزمة وصلت زي ما هي، الحركة بتبان متقطّعة (كل إطارين
///    نفس الصورة). فبنحتفظ بآخر حزمتين وبنرسم **بينهم** حسب
///    الوقت اللي فات — الحركة بتبقى ناعمة من غير ما نكذب على
///    اللاعب: الموقع اللي بيتعرض حقيقي، هو بس متأخّر ٣٣ مللي.
/// ═══════════════════════════════════════════════════════════
class SnakeGameScreen extends StatefulWidget {
  final String roomId;
  final String roomCode;

  const SnakeGameScreen({
    super.key,
    required this.roomId,
    required this.roomCode,
  });

  @override
  State<SnakeGameScreen> createState() => _SnakeGameScreenState();
}

class _SnakeGameScreenState extends State<SnakeGameScreen>
    with SingleTickerProviderStateMixin {
  io.Socket? _socket;
  late final Ticker _ticker;

  /// معرّف السوكيت بتاعي — بيحدد أنهي ثعبان أنا
  String? _meId;

  /// الثوابت اللي بتتبعت مرة واحدة عند الدخول (اسم، لون، أجزاء)
  final Map<String, _PlayerMeta> _meta = {};

  /// آخر حزمتين — للاستيفاء بينهم
  _Snapshot? _prev;
  _Snapshot? _curr;
  DateTime _currAt = DateTime.now();

  Size _arena = const Size(800, 600);
  int _expiresInSec = 0;
  String? _error;
  bool _connecting = true;
  bool _gameOver = false;
  String? _gameOverReason;

  List<_Score> _leaderboard = const [];

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((_) {
      if (mounted) setState(() {});
    })..start();
    _connect();
  }

  Future<void> _connect() async {
    final token = await TokenStore.getToken();
    if (token == null) {
      setState(() {
        _error = 'محتاج تسجّل دخول';
        _connecting = false;
      });
      return;
    }

    final socket = io.io(
      '${ApiEndpoints.origin}/game',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .build(),
    );

    socket.onConnect((_) {
      socket.emit('join_room', {'roomId': widget.roomId});
    });

    socket.on('player_joined', (d) {
      if (!mounted || d is! Map) return;

      final cfg = d['arenaConfig'];
      final roster = d['roster'];

      setState(() {
        _meId = d['playerId']?.toString();
        _connecting = false;
        _error = null;
        _expiresInSec = (d['expiresInSec'] as num?)?.toInt() ?? 0;

        if (cfg is Map) {
          _arena = Size(
            (cfg['width'] as num?)?.toDouble() ?? 800,
            (cfg['height'] as num?)?.toDouble() ?? 600,
          );
        }

        /// ️ الحزمة الدورية مضغوطة (بلا أسماء ولا ألوان ولا
        ///    أجزاء) عشان توفير النطاق. فالثوابت دي بتيجي هنا
        ///    مرة واحدة، وبنبني عليها كل تِك بعد كده.
        if (roster is List) {
          for (final p in roster.whereType<Map>()) {
            final id = p['id']?.toString();
            if (id == null) continue;
            _meta[id] = _PlayerMeta(
              nickname: (p['nickname'] ?? 'لاعب').toString(),
              color: _parseColor(p['color']?.toString()),
              segments: _points(p['segments']),
            );
          }
        }
      });
    });

    socket.on('player_connected', (d) {
      if (!mounted || d is! Map) return;
      final id = d['playerId']?.toString();
      if (id == null) return;
      setState(() {
        _meta[id] = _PlayerMeta(
          nickname: (d['nickname'] ?? 'لاعب').toString(),
          color: _parseColor(d['color']?.toString()),
          segments: _points(d['segments']),
        );
      });
    });

    socket.on('player_disconnected', (d) {
      if (!mounted || d is! Map) return;
      setState(() => _meta.remove(d['playerId']?.toString()));
    });

    socket.on('game_state_update', (d) {
      if (!mounted || d is! Map) return;
      _onState(d);
    });

    socket.on('game_over', (d) {
      if (!mounted) return;
      setState(() {
        _gameOver = true;
        _gameOverReason = (d is Map ? d['reason'] : null)?.toString();
      });
    });

    socket.on('error_message', (d) {
      if (!mounted) return;
      final code = (d is Map ? d['code'] : null)?.toString();
      setState(() {
        _connecting = false;
        _error = switch (code) {
          'NOT_A_MEMBER' => 'الغرفة دي لعشيرة انت مش فيها',
          'ROOM_EXPIRED' => 'وقت الراحة خلص — الغرفة اتقفلت',
          'ROOM_NOT_FOUND' => 'الغرفة مش موجودة',
          _ => 'مقدرناش ندخلك الغرفة',
        };
      });
    });

    socket.onConnectError((e) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error = 'مفيش اتصال بالسيرفر';
      });
    });

    _socket = socket;
  }

  void _onState(Map<dynamic, dynamic> d) {
    final players = <String, _Live>{};

    for (final p in (d['players'] as List? ?? const []).whereType<Map>()) {
      final id = p['i']?.toString();
      if (id == null) continue;
      players[id] = _Live(
        pos: Offset(
          (p['x'] as num?)?.toDouble() ?? 0,
          (p['y'] as num?)?.toDouble() ?? 0,
        ),
        //  الزاوية بتتبعت × ١٠٠ عشان تتشال كعدد صحيح
        angle: ((p['a'] as num?)?.toDouble() ?? 0) / 100,
        score: (p['s'] as num?)?.toInt() ?? 0,
        length: (p['l'] as num?)?.toInt() ?? 0,
        isDead: p['d'] == 1,
        isBoosting: p['b'] == 1,
      );
    }

    final food = <_Food>[];
    for (final f in (d['food'] as List? ?? const []).whereType<Map>()) {
      food.add(_Food(
        pos: Offset(
          (f['x'] as num?)?.toDouble() ?? 0,
          (f['y'] as num?)?.toDouble() ?? 0,
        ),
        value: (f['v'] as num?)?.toInt() ?? 1,
      ));
    }

    final board = <_Score>[];
    for (final e in (d['leaderboard'] as List? ?? const []).whereType<Map>()) {
      board.add(_Score(
        nickname: (e['nickname'] ?? e['n'] ?? '—').toString(),
        score: (e['score'] ?? e['s'] as num?)?.toInt() ?? 0,
      ));
    }

    setState(() {
      _prev = _curr;
      _curr = _Snapshot(players: players, food: food);
      _currAt = DateTime.now();
      _leaderboard = board;
      _expiresInSec = (d['expiresInSec'] as num?)?.toInt() ?? _expiresInSec;
    });
  }

  List<Offset> _points(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((s) => Offset(
              (s['x'] as num?)?.toDouble() ?? 0,
              (s['y'] as num?)?.toDouble() ?? 0,
            ))
        .toList();
  }

  Color _parseColor(String? hex) {
    if (hex == null || !hex.startsWith('#') || hex.length != 7) {
      return const Color(0xFF4ECDC4);
    }
    final v = int.tryParse(hex.substring(1), radix: 16);
    return v == null ? const Color(0xFF4ECDC4) : Color(0xFF000000 | v);
  }

  // ══════════════════════════════════════════════
  //  التحكّم
  // ══════════════════════════════════════════════

  /// ️ التوجيه بالمكان مش بالسحب: الصبع بيحدد **الاتجاه** من
  ///    نص الشاشة. ده أسهل بكتير من عصا افتراضية على شاشة صغيرة،
  ///    وبيشتغل بنفس المنطق سواء ضغطت أو سحبت.
  void _aimAt(Offset local, Size widgetSize) {
    final center = Offset(widgetSize.width / 2, widgetSize.height / 2);
    final v = local - center;
    if (v.distance < 12) return; // قريب من النص = مفيش اتجاه واضح
    _socket?.emit('change_direction', {'angle': math.atan2(v.dy, v.dx)});
  }

  void _boost() => _socket?.emit('boost');

  @override
  void dispose() {
    _ticker.dispose();
    _socket?.dispose();
    super.dispose();
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
        title: Text('الثعبان · ${widget.roomCode}'),
        backgroundColor: Colors.transparent,
        actions: [
          if (!_connecting && _error == null)
            Padding(
              padding: const EdgeInsets.only(left: AppTheme.spaceLg),
              child: Center(
                child: Text(
                  _remaining(),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: _expiresInSec < 60 ? c.danger : c.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                ),
              ),
            ),
        ],
      ),
      body: SafeArea(
        child: _error != null
            ? _errorView(c)
            : _connecting
                ? _connectingView(c)
                : _arenaView(c),
      ),
    );
  }

  String _remaining() {
    final m = _expiresInSec ~/ 60;
    final s = _expiresInSec % 60;
    return '⏳ $m:${s.toString().padLeft(2, '0')}';
  }

  Widget _arenaView(BalColors c) {
    return Stack(
      children: [
        Positioned.fill(
          child: LayoutBuilder(
            builder: (_, box) {
              final view = Size(box.maxWidth, box.maxHeight);
              return GestureDetector(
                onTapDown: (e) => _aimAt(e.localPosition, view),
                onPanUpdate: (e) => _aimAt(e.localPosition, view),
                onDoubleTap: _boost,
                onLongPress: _boost,
                child: CustomPaint(
                  size: view,
                  painter: _ArenaPainter(
                    snapshot: _interpolated(),
                    meta: _meta,
                    meId: _meId,
                    arena: _arena,
                    grid: c.border.withValues(alpha: 0.25),
                    background: c.surface,
                  ),
                ),
              );
            },
          ),
        ),

        //  لوحة الصدارة
        if (_leaderboard.isNotEmpty)
          Positioned(
            top: AppTheme.spaceMd,
            right: AppTheme.spaceMd,
            child: _scoreCard(c),
          ),

        //  تلميح التحكّم — بيختفي أول ما تلعب
        if (_curr == null)
          Positioned(
            bottom: AppTheme.spaceXxl,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppTheme.spaceLg,
                  vertical: AppTheme.spaceSm,
                ),
                decoration: BoxDecoration(
                  color: c.surfaceElevated.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(AppTheme.radiusPill),
                ),
                child: Text(
                  'اسحب عشان توجّه · دوس مرتين عشان تجري',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          ),

        if (_gameOver) _gameOverView(c),
      ],
    );
  }

  /// حالة الرسم دلوقتي — بين آخر حزمتين
  _Snapshot? _interpolated() {
    final curr = _curr;
    if (curr == null) return null;
    final prev = _prev;
    if (prev == null) return curr;

    /// السيرفر بيبعت ٣٠ حزمة/ثانية → ٣٣ مللي بين كل واحدة
    final since = DateTime.now().difference(_currAt).inMilliseconds;
    final t = (since / 33.0).clamp(0.0, 1.0);

    final players = <String, _Live>{};
    for (final entry in curr.players.entries) {
      final now = entry.value;
      final was = prev.players[entry.key];
      if (was == null) {
        players[entry.key] = now;
        continue;
      }

      /// ️ الزاوية بتلفّ عند ٢π. الاستيفاء المباشر بين ٣٥٠° و١٠°
      ///    بيلفّ الثعبان دورة كاملة بالعكس بدل ما يعدّي ٢٠ درجة.
      var da = now.angle - was.angle;
      while (da > math.pi) {
        da -= 2 * math.pi;
      }
      while (da < -math.pi) {
        da += 2 * math.pi;
      }

      players[entry.key] = now.copyWith(
        pos: Offset.lerp(was.pos, now.pos, t)!,
        angle: was.angle + da * t,
      );
    }

    //  الأكل مبيتحركش — مفيش استيفاء
    return _Snapshot(players: players, food: curr.food);
  }

  Widget _scoreCard(BalColors c) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppTheme.spaceMd,
        vertical: AppTheme.spaceSm,
      ),
      decoration: BoxDecoration(
        color: c.surfaceElevated.withValues(alpha: 0.88),
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('الصدارة',
              style: text.bodySmall?.copyWith(
                color: c.textSecondary,
                fontWeight: FontWeight.w600,
              )),
          const SizedBox(height: 4),
          ..._leaderboard.take(5).map(
                (e) => Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    '${e.nickname} · ${e.score}',
                    style: text.bodySmall,
                  ),
                ),
              ),
        ],
      ),
    );
  }

  Widget _gameOverView(BalColors c) {
    final text = Theme.of(context).textTheme;
    return Positioned.fill(
      child: Container(
        color: Colors.black.withValues(alpha: 0.72),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppTheme.spaceXxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🐍', style: TextStyle(fontSize: BalEmoji.display)),
                const SizedBox(height: AppTheme.spaceLg),
                Text(
                  _gameOverReason == 'EXPIRED'
                      ? 'وقت الراحة خلص'
                      : 'اللعبة خلصت',
                  style: text.headlineSmall,
                ),
                const SizedBox(height: AppTheme.spaceSm),
                Text(
                  'يلا نرجّع نركّز 💪',
                  style: text.bodyMedium?.copyWith(color: c.textSecondary),
                ),
                const SizedBox(height: AppTheme.spaceXl),
                PillButton(
                  label: 'رجوع',
                  icon: Icons.arrow_back_rounded,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _connectingView(BalColors c) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: AppTheme.spaceLg),
            Text(
              'بنوصّلك بالغرفة…',
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: c.textSecondary),
            ),
          ],
        ),
      );

  Widget _errorView(BalColors c) => Center(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.spaceXxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.videogame_asset_off_rounded,
                  size: 55, color: c.textDisabled),
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
                label: 'رجوع',
                icon: Icons.arrow_back_rounded,
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
        ),
      );
}

// ══════════════════════════════════════════════
//  الرسم
// ══════════════════════════════════════════════

class _ArenaPainter extends CustomPainter {
  final _Snapshot? snapshot;
  final Map<String, _PlayerMeta> meta;
  final String? meId;
  final Size arena;
  final Color grid;
  final Color background;

  _ArenaPainter({
    required this.snapshot,
    required this.meta,
    required this.meId,
    required this.arena,
    required this.grid,
    required this.background,
  });

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = background);

    final snap = snapshot;
    if (snap == null) return;

    /// ️ الكاميرا بتتبع ثعباني: الساحة ٨٠٠×٦٠٠ والشاشة أصغر،
    ///    فلو رسمنا كل حاجة مصغّرة الثعبان هيبقى نقطة. بنعرض
    ///    جزء من الساحة حوالين اللاعب بدل ما نضغطها كلها.
    final me = meId == null ? null : snap.players[meId];
    final scale = 1.15;

    final focus = me?.pos ?? Offset(arena.width / 2, arena.height / 2);
    final dx = size.width / 2 - focus.dx * scale;
    final dy = size.height / 2 - focus.dy * scale;

    canvas.save();
    canvas.translate(dx, dy);
    canvas.scale(scale);

    _drawGrid(canvas);
    _drawWalls(canvas);

    //  الأكل
    for (final f in snap.food) {
      canvas.drawCircle(
        f.pos,
        3.5 + f.value.toDouble(),
        Paint()..color = const Color(0xFFF7DC6F),
      );
    }

    //  الثعابين — أنا آخر واحد عشان أبان فوق الكل
    final ids = snap.players.keys.toList()
      ..sort((a, b) => a == meId ? 1 : (b == meId ? -1 : 0));

    for (final id in ids) {
      _drawSnake(canvas, id, snap.players[id]!);
    }

    canvas.restore();
  }

  void _drawGrid(Canvas canvas) {
    final paint = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (double x = 0; x <= arena.width; x += 50) {
      canvas.drawLine(Offset(x, 0), Offset(x, arena.height), paint);
    }
    for (double y = 0; y <= arena.height; y += 50) {
      canvas.drawLine(Offset(0, y), Offset(arena.width, y), paint);
    }
  }

  void _drawWalls(Canvas canvas) {
    canvas.drawRect(
      Offset.zero & arena,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = const Color(0xFFFF6B6B).withValues(alpha: 0.55),
    );
  }

  void _drawSnake(Canvas canvas, String id, _Live live) {
    final info = meta[id];
    final color = info?.color ?? const Color(0xFF4ECDC4);
    final isMe = id == meId;

    if (live.isDead) return;

    /// ️ الأجزاء بتيجي في اللقطة الأولى بس (توفير نطاق). الحزمة
    ///    الدورية فيها الراس والطول بس، فبنرسم الجسم كذيل ورا
    ///    الراس على خط الاتجاه. مش نسخة طبق الأصل من حالة
    ///    السيرفر، لكنه يقرا صح ويوفّر ٩٥٪ من البيانات.
    final n = live.length.clamp(1, 60);
    for (var i = n; i > 0; i -= 1) {
      final back = i * 7.0;
      final p = live.pos -
          Offset(math.cos(live.angle) * back, math.sin(live.angle) * back);
      canvas.drawCircle(
        p,
        5,
        Paint()..color = color.withValues(alpha: 0.55 + 0.45 * (1 - i / n)),
      );
    }

    //  هالة الاندفاع
    if (live.isBoosting) {
      canvas.drawCircle(
        live.pos,
        13,
        Paint()..color = color.withValues(alpha: 0.28),
      );
    }

    //  الراس
    canvas.drawCircle(live.pos, 6.5, Paint()..color = color);

    //  حلقة بيضا حوالين ثعباني — عشان ألاقي نفسي وسط الزحمة
    if (isMe) {
      canvas.drawCircle(
        live.pos,
        9,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = Colors.white.withValues(alpha: 0.9),
      );
    }
  }

  @override
  bool shouldRepaint(_ArenaPainter old) => true;
}

// ══════════════════════════════════════════════
//  أنواع البيانات
// ══════════════════════════════════════════════

class _PlayerMeta {
  final String nickname;
  final Color color;
  final List<Offset> segments;

  const _PlayerMeta({
    required this.nickname,
    required this.color,
    required this.segments,
  });
}

class _Live {
  final Offset pos;
  final double angle;
  final int score;
  final int length;
  final bool isDead;
  final bool isBoosting;

  const _Live({
    required this.pos,
    required this.angle,
    required this.score,
    required this.length,
    required this.isDead,
    required this.isBoosting,
  });

  _Live copyWith({Offset? pos, double? angle}) => _Live(
        pos: pos ?? this.pos,
        angle: angle ?? this.angle,
        score: score,
        length: length,
        isDead: isDead,
        isBoosting: isBoosting,
      );
}

class _Food {
  final Offset pos;
  final int value;

  const _Food({required this.pos, required this.value});
}

class _Snapshot {
  final Map<String, _Live> players;
  final List<_Food> food;

  const _Snapshot({required this.players, required this.food});
}

class _Score {
  final String nickname;
  final int score;

  const _Score({required this.nickname, required this.score});
}
