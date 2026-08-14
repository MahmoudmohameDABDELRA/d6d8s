import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../storage/token_store.dart';
import 'api_endpoints.dart';

/// 🌐 عميل الـ API — الربط الحي بالباك إند (Dio)
class ApiClient {
  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
    ));
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await TokenStore.getToken();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          // إضافة البادئة في الويب (نفس الأصل) أو الموبايل (العنوان المباشر)
          final path = options.path;
          if (!path.startsWith('http')) {
            options.path = ApiEndpoints.resolve(path);
          }
          debugPrint('🌐 ${options.method} ${options.path}');
          handler.next(options);
        },
        onError: (e, handler) async {
          if (e.response?.statusCode == 401) {
            await TokenStore.clear();
          }
          handler.next(e);
        },
      ),
    );
  }

  static final ApiClient instance = ApiClient._internal();
  late final Dio _dio;

  /// GET — يرجع JSON
  Future<Map<String, dynamic>> get(String path,
      {Map<String, dynamic>? query}) async {
    final res = await _dio.get<Map<String, dynamic>>(path, queryParameters: query);
    return res.data ?? {};
  }

  /// POST
  Future<Map<String, dynamic>> post(String path,
      {Map<String, dynamic>? body}) async {
    final res = await _dio.post<Map<String, dynamic>>(path, data: body ?? {});
    return res.data ?? {};
  }

  /// PATCH
  Future<Map<String, dynamic>> patch(String path,
      {Map<String, dynamic>? body}) async {
    final res = await _dio.patch<Map<String, dynamic>>(path, data: body ?? {});
    return res.data ?? {};
  }

  /// DELETE
  Future<Map<String, dynamic>> delete(String path) async {
    final res = await _dio.delete<Map<String, dynamic>>(path);
    return res.data ?? {};
  }

  /// هل المفتاح السري موجود (هل الباك شغال)؟
  Future<bool> isHealthy() async {
    try {
      final res = await _dio.get<dynamic>(ApiEndpoints.resolve('/health/live'));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
