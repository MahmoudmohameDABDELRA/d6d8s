import 'package:flutter/material.dart';
import '../models/models.dart';
import 'device_timezone.dart';
import 'push/push_registration.dart';
import 'network/api_client.dart';
import 'network/api_endpoints.dart';
import 'storage/token_store.dart';

/// 🧠 حالة التطبيق العامة (Global State) — Provider
/// كل شاشة بتقرأ من هنا — مفيش حالة معزولة
class AppState extends ChangeNotifier {
  BalUser? user;
  bool isDark = true;
  bool loading = false;
  String? error;

  bool get loggedIn => user != null;

  /// التحميل عند فتح التطبيق
  Future<void> bootstrap() async {
    isDark = await TokenStore.isDarkMode();
    final token = await TokenStore.getToken();
    if (token != null) {
      try {
        final res = await ApiClient.instance.get(ApiEndpoints.me);
        final u = res['user'] ?? res;
        if (u is Map<String, dynamic>) {
          user = BalUser.fromJson(u);
          await TokenStore.saveUser(u);
        }
      } catch (_) {
        await TokenStore.clear();
      }
    } else {
      user = await _loadCachedUser();
    }
    notifyListeners();
  }

  Future<BalUser?> _loadCachedUser() async {
    final cached = await TokenStore.getUser();
    if (cached == null) return null;
    return BalUser.fromJson(cached);
  }

  void setDark(bool dark) {
    isDark = dark;
    TokenStore.setDarkMode(dark);
    notifyListeners();
  }

  /// تسجيل الدخول
  Future<bool> login(String email, String password) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.login, body: {
        'email': email,
        'password': password,
      });
      final token = res['accessToken'] as String?;
      final u = res['user'];
      if (token == null) throw Exception('لا يوجد توكن في الرد');
      await TokenStore.saveToken(token);
      user = BalUser.fromJson(u);
      await TokenStore.saveUser(u);
      return true;
    } catch (e) {
      error = _errMsg(e);
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// التسجيل
  Future<bool> register({
    required String username,
    required String email,
    required String password,
    required String domain,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.register, body: {
        'username': username,
        'email': email,
        'password': password,
        'domain': domain,
        // specialty اختياري في الباك — متبعتناش (مش مطلوبة للتسجيل)
        //  المنطقة الزمنية: من غيرها كل المستخدمين بيتحطوا على
        //   القاهرة، فمنتصف الليل وسؤال الاطمئنان بييجوا في وقت غلط.
        ...DeviceTimezone.payload(),
      });
      final token = res['accessToken'] as String?;
      final u = res['user'];
      if (token == null) throw Exception('لا يوجد توكن في الرد');
      await TokenStore.saveToken(token);
      user = BalUser.fromJson(u);
      await TokenStore.saveUser(u);
      return true;
    } catch (e) {
      error = _errMsg(e);
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// تسمية الرفيق
  Future<bool> setCompanionName(String name) async {
    try {
      final res = await ApiClient.instance.patch(ApiEndpoints.companion, body: {
        'name': name,
      });
      final u = res['user'] ?? res;
      if (u is Map<String, dynamic>) {
        user = BalUser.fromJson(u);
        await TokenStore.saveUser(u);
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      error = _errMsg(e);
      return false;
    }
  }

  /// إكمال الـ Onboarding (اختيار الاهتمام) — POST /auth/onboarding
  Future<bool> completeOnboarding({required String domain}) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ApiClient.instance.post(ApiEndpoints.onboarding, body: {
        'domain': domain,
        'interests': [domain],
        //  تحديث تاني للمنطقة — الدخول بجوجل ممكن يكون فات الأولى
        ...DeviceTimezone.payload(),
      });
      final u = res['user'] ?? res;
      if (u is Map<String, dynamic>) {
        user = BalUser.fromJson(u);
        await TokenStore.saveUser(u);
        return true;
      }
      return false;
    } catch (e) {
      error = _errMsg(e);
      return false;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    /// ️ إلغاء تسجيل الجهاز **قبل** مسح التوكن — النداء محتاج
    ///    التوثيق. من غير كده إشعارات المستخدم ده بتفضل رايحة
    ///    لنفس الجهاز بعد ما حد تاني يسجّل دخول عليه.
    await PushRegistration.unregister();
    await TokenStore.clear();
    user = null;
    notifyListeners();
  }

  String _errMsg(Object e) {
    final s = e.toString();
    if (s.contains('401')) return 'بيانات الدخول غير صحيحة';
    if (s.contains('429')) return 'طلبات كتير — حاول بعد شوية';
    if (s.contains('SocketException') || s.contains('Connection refused')) {
      return 'مفيش اتصال بالسيرفر — تأكد إن الباك شغال';
    }
    return s.replaceAll('Exception: ', '');
  }
}
