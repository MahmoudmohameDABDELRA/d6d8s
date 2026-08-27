import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../network/api_endpoints.dart';
import '../storage/token_store.dart';

/// 📡 الوصول المستمر — Socket.io
///
/// السيرفر عنده قناتين جاهزتين:
///   · `/notifications` — الإشعارات وردود الاطمئنان ودعوات التحدي
///   · `/chat` — الرسايل اللحظية
///
/// ️ قبل كده كانت الشاشات بتستطلع كل 3-5 ثواني. ده شغّال بس:
///   · الرسالة بتتأخر لحد 5 ثواني
///   · طلب شبكة كل 5 ثواني حتى لو مفيش جديد — بطارية ونت
///   · الغرفة الساكنة بتخلي المستخدم يحس إن محدش جاي
///
/// ️ الاستطلاع **ما اتشالش** — بقى احتياطي. لو السوكيت فشل
///    (شبكة محدودة، بروكسي بيقطع WebSocket)، الشاشة بترجع
///    للاستطلاع بدل ما تفضل ميتة.
class RealtimeService extends ChangeNotifier {
  io.Socket? _notifications;
  io.Socket? _chat;

  bool _connected = false;
  bool get isConnected => _connected;

  /// آخر خطأ اتصال — للتشخيص، مش للعرض للمستخدم
  String? lastError;

  // ── الأحداث ──
  final _notificationCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _checkinReplyCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _tasksGeneratedCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _messageCtrl = StreamController<Map<String, dynamic>>.broadcast();

  /// إشعار جديد (اطمئنان · دعوة تحدي · تذكير)
  Stream<Map<String, dynamic>> get onNotification => _notificationCtrl.stream;

  /// رد الرفيق وصل لجهاز تاني
  Stream<Map<String, dynamic>> get onCheckinReply => _checkinReplyCtrl.stream;

  /// مهام النهاردة اتولدت
  Stream<Map<String, dynamic>> get onTasksGenerated => _tasksGeneratedCtrl.stream;

  /// رسالة جديدة في محادثة
  Stream<Map<String, dynamic>> get onMessage => _messageCtrl.stream;

  /// يوصّل القناتين. آمن لو اتنادى أكتر من مرة.
  Future<void> connect() async {
    final token = await TokenStore.getToken();
    if (token == null) return;

    /// ️ نقفل القديم الأول — الاتصال المزدوج بيوصّل كل حدث مرتين
    disconnect();

    final origin = ApiEndpoints.origin;

    _notifications = _open('$origin/notifications', token, (s) {
      s.on('notification:new', (d) => _emit(_notificationCtrl, d));
      s.on('notification:pending', (d) {
        /// دفعة أولى: إشعارات اتراكمت والتطبيق كان مقفول
        final list = (d is Map ? d['notifications'] : null) as List?;
        for (final n in list ?? const []) _emit(_notificationCtrl, n);
      });
      s.on('checkin:reply', (d) => _emit(_checkinReplyCtrl, d));
      s.on('tasks:generated', (d) => _emit(_tasksGeneratedCtrl, d));
    });

    _chat = _open('$origin/chat', token, (s) {
      s.on('new_message', (d) => _emit(_messageCtrl, d));
      s.on('message', (d) => _emit(_messageCtrl, d));
    });
  }

  io.Socket _open(String url, String token, void Function(io.Socket) wire) {
    final socket = io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          /// ️ محاولات لا نهائية بفاصل متزايد: النت بيرجع بعد
          ///    دقايق أحياناً، والاستسلام معناه تطبيق ميت لحد
          ///    ما المستخدم يقفله ويفتحه.
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .build(),
    );

    socket.onConnect((_) {
      _connected = true;
      lastError = null;
      notifyListeners();
    });

    socket.onDisconnect((_) {
      _connected = false;
      notifyListeners();
    });

    socket.onConnectError((e) {
      lastError = e?.toString();
      _connected = false;
      notifyListeners();
      debugPrint('⚠️ فشل الاتصال بـ $url: $e');
    });

    wire(socket);
    return socket;
  }

  void _emit(StreamController<Map<String, dynamic>> ctrl, dynamic data) {
    if (ctrl.isClosed) return;
    if (data is Map) ctrl.add(Map<String, dynamic>.from(data));
  }

  /// يدخل غرفة محادثة عشان يستقبل رسايلها
  void joinConversation(String conversationId) {
    _chat?.emit('join_conversation', {'conversationId': conversationId});
  }

  /// يعلّم إشعار كمقروء عبر السوكيت (أرخص من نداء REST)
  void markSeen(String notificationId) {
    _notifications?.emit('notification:seen', {'notificationId': notificationId});
  }

  void disconnect() {
    _notifications?.dispose();
    _chat?.dispose();
    _notifications = null;
    _chat = null;
    _connected = false;
  }

  @override
  void dispose() {
    disconnect();
    _notificationCtrl.close();
    _checkinReplyCtrl.close();
    _tasksGeneratedCtrl.close();
    _messageCtrl.close();
    super.dispose();
  }
}
