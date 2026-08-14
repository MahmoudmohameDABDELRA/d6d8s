import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/task.dart';

/// Talks to YOUR own backend — never to the AI provider directly from
/// the app. The backend holds the real API key and forwards the
/// conversation to the AI model.
class CheckInService {
  /// Base URL of your existing backend, e.g. https://api.yourapp.com
  static const String _baseUrl = 'https://api.yourapp.com';
  static const String _endpoint = '$_baseUrl/api/task-checkin';

  /// Must match APP_SHARED_SECRET on the server. Proves the request came
  /// from your app build, not a random script hitting the endpoint.
  /// Don't hardcode the real value in source control — inject it via
  /// --dart-define at build time instead (see notes below the class).
  static const String _appSecret =
      String.fromEnvironment('APP_SHARED_SECRET', defaultValue: '');

  /// Sends the task context + what the user typed, gets back the AI's
  /// conversational reply as plain text.
  static Future<String> sendCheckIn({
    required AppTask task,
    required String userReply,
    required String userId,
  }) async {
    final payload = {
      'user_id': userId,
      'task': task.toJson(),
      'user_reply': userReply,
    };

    final response = await http
        .post(
          Uri.parse(_endpoint),
          headers: {
            'Content-Type': 'application/json',
            'x-app-secret': _appSecret,
          },
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 20));

    if (response.statusCode != 200) {
      throw Exception('Check-in request failed: ${response.statusCode}');
    }

    final data = jsonDecode(utf8.decode(response.bodyBytes));
    return data['reply'] as String;
  }
}

// Run/build with the secret injected, e.g.:
//   flutter run --dart-define=APP_SHARED_SECRET=your-long-random-string
// This keeps the value out of the committed source while still letting
// the release build carry it (it's a build-only value, not a runtime
// secret — treat it as "app identity", not as the AI provider's key).
