import 'package:flutter/foundation.dart';
import '../network/api_client.dart';
import '../network/api_endpoints.dart';
import '../storage/token_store.dart';

/// 📲 تسجيل جهاز المستخدم عشان الإشعارات توصله والتطبيق مقفول.
///
/// ═══════════════════════════════════════════════════════════
/// ️ اقرا ده قبل ما تعدّل — فيه حقيقة لازم تكون واضحة:
///
/// السلسلة الكاملة للمنبه بتتكوّن من ٤ حلقات:
///
///   ١. السيرفر يعرف يبعت push        ← محتاج FIREBASE_SERVICE_ACCOUNT
///   ٢. التطبيق يسجّل توكن جهازه       ← الملف ده
///   ٣. التطبيق يستقبل الـ push        ← محتاج حزمة firebase_messaging
///   ٤. نظام التشغيل يرنّ              ← محتاج SCHEDULE_EXACT_ALARM
///                                        على أندرويد 12+
///
/// الملف ده بيعمل الحلقة **٢ بس**. الحلقات ١ و٣ و٤ محتاجة:
///   · مشروع Firebase حقيقي (مفتاح خدمة + google-services.json)
///   · `firebase_messaging` + `flutter_local_notifications` في pubspec
///   · تعديلات على AndroidManifest و Info.plist
///
/// ما اتعملوش هنا **عن قصد** لأنهم محتاجين حسابك انت على Firebase،
/// ومينفعش نخترعهم. لكن الحلقة اللي بنقدر نعملها اتعملت صح، والباقي
/// بقى توصيل مش بناء: أول ما تجيب التوكن من `FirebaseMessaging`،
/// نادِ `PushRegistration.register(token)` وخلاص — كل الباقي جاهز.
///
/// وعلشان الحقيقة تفضل ظاهرة: `/health` في السيرفر بقى بيقول
/// `push: not_configured` لما الإعداد ناقص، والديسباتشر بقى بيرجّع
/// `success: false` بدل ما يكدب ويقول اتبعت.
/// ═══════════════════════════════════════════════════════════
abstract final class PushRegistration {
  static const _kSentToken = 'bal_push_token_sent';

  /// المنصة اللي السيرفر بيفهمها
  static String get _platform {
    if (defaultTargetPlatform == TargetPlatform.iOS) return 'IOS';
    return 'ANDROID';
  }

  /// تسجيل التوكن في السيرفر.
  ///
  /// ️ بنتجنّب النداء المتكرر: التوكن بيتغيّر نادراً، والتسجيل
  ///    بيحصل كل مرة التطبيق يفتح. من غير الحارس ده بنعمل نداء
  ///    شبكة على الفاضي كل مرة.
  ///
  /// بيرجّع `true` لو التوكن بقى مسجّل (دلوقتي أو من قبل).
  static Future<bool> register(String? fcmToken) async {
    final token = fcmToken?.trim();
    if (token == null || token.isEmpty) return false;

    final already = await TokenStore.getString(_kSentToken);
    if (already == token) return true;

    try {
      await ApiClient.instance.post(
        ApiEndpoints.notificationDevice,
        body: {'fcmToken': token, 'platform': _platform},
      );
      await TokenStore.setString(_kSentToken, token);
      return true;
    } catch (e) {
      /// ️ الفشل هنا مش بيوقّف التطبيق — المستخدم يقدر يشتغل
      ///    عادي، الإشعارات بس هي اللي مش هتوصل. بنسجّله عشان
      ///    يبان في اللوج بدل ما يضيع في الصمت.
      debugPrint('📲 تسجيل توكن الإشعارات فشل: $e');
      return false;
    }
  }

  /// إلغاء التسجيل — بيتنادى عند تسجيل الخروج.
  ///
  /// ️ من غير ده، إشعارات المستخدم القديم بتفضل رايحة لنفس
  ///    الجهاز بعد ما حد تاني يسجّل دخول عليه.
  static Future<void> unregister() async {
    final token = await TokenStore.getString(_kSentToken);
    if (token == null || token.isEmpty) return;

    try {
      await ApiClient.instance
          .delete(ApiEndpoints.notificationDeviceDelete(token));
    } catch (e) {
      debugPrint('📲 إلغاء تسجيل التوكن فشل: $e');
    } finally {
      await TokenStore.remove(_kSentToken);
    }
  }
}
