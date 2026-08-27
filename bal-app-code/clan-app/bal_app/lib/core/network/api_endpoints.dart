import 'package:flutter/foundation.dart';

/// 🔗 عناوين الباك إند (نقاط الربط الحقيقية)
abstract final class ApiEndpoints {
  /// عنوان السيرفر — يتظبط وقت البناء:
  ///   flutter run --dart-define=API_BASE_URL=http://192.168.1.5:3000
  static const _override = String.fromEnvironment('API_BASE_URL');

  /// أصل السيرفر (بلا /api)
  static String get origin {
    if (_override.isNotEmpty) return _stripSlash(_override);

    if (kIsWeb) {
      /// ️ الويب: لازم نفرّق بين حالتين مختلفتين تماماً.
      ///
      ///    · `flutter run -d chrome` بيشغّل التطبيق على بورت عشوائي
      ///      (زي 57960) **بلا أي proxy**. النسخة القديمة كانت
      ///      بتستخدم نفس الأصل، فالتطبيق كان بيبعت الطلبات لنفسه
      ///      ويقع بـ 404 — الحساب مكانش بيتعمل والدخول مكانش بيشتغل.
      ///
      ///    · النشر الحقيقي: التطبيق متسيرڤ من الباك إند نفسه، فنفس
      ///      الأصل هو الصح.
      ///
      ///    الفرق بينهم: بورت الـ dev server مش 3000.
      final base = Uri.base;
      final isFlutterDevServer =
          (base.host == 'localhost' || base.host == '127.0.0.1') &&
              base.port != 3000;

      if (isFlutterDevServer) return 'http://localhost:3000';

      if (base.host.isNotEmpty && base.scheme.startsWith('http')) {
        return '${base.scheme}://${base.host}${base.hasPort ? ':${base.port}' : ''}';
      }
      return 'http://localhost:3000';
    }

    /// أندرويد: 10.0.2.2 هو جهازك من جوّه المحاكي.
    /// على موبايل حقيقي مرّر IP جهازك بـ --dart-define.
    return 'http://10.0.2.2:3000';
  }

  static String get baseUrl => '$origin/api';

  static String resolve(String path) => '$origin/api$path';

  static String _stripSlash(String url) =>
      url.endsWith('/') ? url.substring(0, url.length - 1) : url;

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
  static String focusChallengeGet(String id) => '/focus/challenge/$id';
  static String focusChallengeAccept(String id) => '/focus/challenge/$id/accept';
  static String focusChallengeDecline(String id) => '/focus/challenge/$id/decline';
  static String focusChallengeLeave(String id) => '/focus/challenge/$id/leave';
  static String focusChallengeStart(String id) => '/focus/challenge/$id/start';

  // ── المنبه ──
  static const alarms = '/alarms';
  static const alarmSnooze = '/alarms/snooze';
  static const wakeTask = '/alarms/wake-task';
  static const wakeTaskSolve = '/alarms/wake-task/solve';
  static const alarmHistory = '/alarms/history';
  static const alarmMissed = '/alarms/missed';
  static String alarm(String id) => '/alarms/$id';

  // ── الرسائل والعشائر ──
  static const chatStart = '/chat/start';
  static const searchUsers = '/chat/search';
  static const conversations = '/chat/conversations';
  static const clanChats = '/chat/clans';
  static const chatRequests = '/chat/requests';
  static String chatMessages(String convId) => '/chat/$convId/messages';
  // ── تعديل الرسايل والتفاعل والإبلاغ ──
  static String editMessage(String messageId) => '/chat/messages/$messageId';
  static String deleteMessage(String messageId) => '/chat/messages/$messageId';
  static String reactToMessage(String messageId) =>
      '/chat/messages/$messageId/react';
  static String reportMessage(String messageId) =>
      '/chat/messages/$messageId/report';
  static String reportAndBlockMessage(String messageId) =>
      '/chat/messages/$messageId/report-and-block';
  static const blockUser = '/chat/block';
  static String unblockUser(String userId) => '/chat/block/$userId';
  static const blockedUsers = '/chat/blocked';
  static String openClanChat(String clanId) => '/chat/clans/$clanId/open';
  static String respondRequest(String id) => '/chat/requests/$id/respond';
  static const friendRequests = '/social/friends/requests';
  static String respondFriendRequest(String id) =>
      '/social/friends/requests/$id/respond';
  static const clansPrivateCreate = '/clans/private/create';
  static const clansPrivateJoin = '/clans/private/join';
  static const myClans = '/clans/my-clans';
  static const clansAutoAssign = '/clans/global/auto-assign';
  static const clansGlobalJoin = '/clans/global/join';
  static const clansActiveSession = '/clans/global/active-session';
  static String clanMembers(String id) => '/clans/$id/members';
  static String clanLeave(String id) => '/clans/leave/$id';

  // ── الإشعارات والبوب-أب ──
  static const notifications = '/notifications';
  /// تسجيل جهاز عشان الإشعارات توصل والتطبيق مقفول
  static const notificationDevice = '/notifications/device';
  static String notificationDeviceDelete(String fcmToken) =>
      '/notifications/device/$fcmToken';
  static const notificationsReadAll = '/notifications/read-all';
  static String notificationReply(String id) => '/notifications/$id/reply';
  static String notificationThread(String id) => '/notifications/$id/thread';
  static String notificationRead(String id) => '/notifications/$id/read';
  static const checkinOpen = '/notifications/checkin/open';

  // ── الـ AI ──
  static const aiMessage = '/ai/message';
  static const aiConversations = '/ai/conversations';
}
