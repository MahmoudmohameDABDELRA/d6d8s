import 'package:flutter/foundation.dart';

/// 🔗 عناوين الباك إند (نقاط الربط الحقيقية)
abstract final class ApiEndpoints {
  /// في الويب: نفس أصل الصفحة (الـ dev server بيروج للـ API)
  /// في الموبايل: عنوان السيرفر — يُعدّل حسب بيئة النشر
  static String get baseUrl {
    if (kIsWeb) {
      // في الـ preview: نستخدم نفس الأصل (الـ proxy بيحول للباك)
      // نتحقق من نافذة المتصفح وقت التشغيل
      return '';
    }
    // الموبايل/الديسكتوب
    return 'http://10.0.2.2:3000/api'; // Android Emulator → host
  }

  static String resolve(String path) {
    if (kIsWeb) {
      final origin = _webOrigin();
      return '$origin/api$path';
    }
    return '$baseUrl$path';
  }

  static String _webOrigin() {
    // الوصول لـ window.location عبر dart:js_interop (بسيط)
    try {
      final loc = Uri.base;
      if (loc.host.isNotEmpty && loc.scheme.startsWith('http')) {
        return '${loc.scheme}://${loc.host}${loc.hasPort ? ':${loc.port}' : ''}';
      }
    } catch (_) {}
    return 'http://localhost:3000';
  }

  // ── Auth ──
  static const register = '/auth/register';
  static const login = '/auth/login';
  static const me = '/auth/me';
  static const companion = '/auth/companion';
  static const onboarding = '/auth/onboarding';

  // ── الجبل (الأهداف/الرحلات) ──
  static const goals = '/goals';
  static String goal(String id) => '/goals/$id';
  static const dream = '/goals/dream';
  static String dreamAnswers(String id) => '/goals/dream/$id/answers';
  static String dreamApprove(String id) => '/goals/dream/$id/approve';
  static String stepJourney(String stepId) => '/goals/steps/$stepId/journey';
  static String stepJourneyApprove(String stepId) =>
      '/goals/steps/$stepId/journey/approve';
  static String completeStep(String goalId, String stepId) =>
      '/goals/dream/$goalId/steps/$stepId/complete';
  static String completeGoal(String id) => '/goals/$id/complete';
  static String weekDocument(String weekId) => '/goals/weeks/$weekId/document';
  static String weekSkip(String weekId) => '/goals/weeks/$weekId/skip';

  // ── المهام ──
  static const tasks = '/tasks';
  static String task(String id) => '/tasks/$id';
  static String completeTask(String id) => '/tasks/$id/complete';
  static const batchBlocks = '/tasks/batch-blocks';

  // ── التركيز ──
  static const focusStart = '/focus/start';
  static String focusComplete(String id) => '/focus/$id/complete';
  static const focusActive = '/focus/active';
  static const focusStats = '/focus/stats';
  static const focusHistory = '/focus/history';
  static const focusChallenge = '/focus/challenge';
  static String focusChallengeAccept(String id) => '/focus/challenge/$id/accept';
  static String focusChallengeStart(String id) => '/focus/challenge/$id/start';

  // ── المنبه ──
  static const alarms = '/alarms';
  static const alarmSnooze = '/alarms/snooze';
  static const wakeTask = '/alarms/wake-task';
  static const wakeTaskSolve = '/alarms/wake-task/solve';

  // ── الرسائل والعشائر ──
  static const chatStart = '/chat/start';
  static const searchUsers = '/chat/search';
  static const friendRequests = '/social/friends/requests';
  static String respondFriendRequest(String id) =>
      '/social/friends/requests/$id/respond';
  static const clansPrivateCreate = '/clans/private/create';
  static const clansPrivateJoin = '/clans/private/join';
  static const myClans = '/clans/my-clans';

  // ── الـ AI ──
  static const aiMessage = '/ai/message';
  static const aiConversations = '/ai/conversations';
}
