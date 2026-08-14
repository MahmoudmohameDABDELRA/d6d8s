import { GoogleAuth } from 'google-auth-library';
import prisma from '../config/prisma.js';
import { scoped } from '../config/logger.js';

const log = scoped('push-dispatcher');

/**
 * ════════════════════════════════════════════════════════════
 *  محرك إطلاق إشعارات الـ Push السحابية — FCM v1 & APNs
 * ════════════════════════════════════════════════════════════
 *
 *  المعايير العالمية:
 *   ١. استخدام بروتوكول FCM v1 الرسمي المشفّر بـ OAuth2.
 *   ٢. قنوات أندرويد الصوتية (Android Notification Channels) بحسب الأولوية:
 *      - `clan_urgent_alarms`: أولوية قصوى وتنبيهات المنبهات والتحديات.
 *      - `clan_task_reminders`: تنبيهات الـ ٥ دقائق المسبقة مع النغمة المجهزة.
 *      - `clan_messages`: محادثات الشات والعشيرة.
 *   ٣. ترويسات iOS APNs (apns-priority: 10 + sound + badge count).
 *   ٤. الكنس التلقائي للتوكنات الميتة (Dead Token Eviction) فور إرجاع 404/Unregistered.
 */

const NOTIFICATION_CHANNELS = {
  ALARM: { channelId: 'clan_urgent_alarms', priority: 'HIGH', sound: 'urgent_alarm' },
  TASK_REMINDER: { channelId: 'clan_task_reminders', priority: 'HIGH', sound: 'zen_bell' },
  CHAT: { channelId: 'clan_messages', priority: 'NORMAL', sound: 'default' },
  DEFAULT: { channelId: 'clan_general', priority: 'NORMAL', sound: 'default' },
};

let googleAuthClient = null;

/** تهيئة عميل المصادقة لـ Google Cloud */
const getGoogleAuth = () => {
  if (googleAuthClient) return googleAuthClient;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      googleAuthClient = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
      return googleAuthClient;
    } catch (err) {
      log.warn({ err: err.message }, 'تعذر قراءة FIREBASE_SERVICE_ACCOUNT JSON');
    }
  }

  return null;
};

/**
 * إرسال الإشعار الفعلي لجهاز محدد عبر FCM v1
 */
export const dispatchToSingleDevice = async (device, payload) => {
  const { title, body, type, data = {}, soundTheme = 'ZEN_BELL' } = payload;
  const { fcmToken, platform } = device;

  const auth = getGoogleAuth();
  const projectId = process.env.FIREBASE_PROJECT_ID || 'clan-app-production';

  // تحديد القناة المناسبة
  let channel = NOTIFICATION_CHANNELS.DEFAULT;
  if (type === 'ALARM') channel = NOTIFICATION_CHANNELS.ALARM;
  else if (type === 'TASK_OVERDUE' || data.isPreReminder) channel = NOTIFICATION_CHANNELS.TASK_REMINDER;
  else if (type === 'DIRECT_MESSAGE' || type === 'CLAN_MESSAGE') channel = NOTIFICATION_CHANNELS.CHAT;

  // تجهيز حزمة FCM v1 الموحدة
  const fcmMessage = {
    message: {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        type: type || 'SYSTEM',
        soundTheme: soundTheme || 'ZEN_BELL',
        ...Object.fromEntries(
          Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
        ),
      },
      android: {
        priority: channel.priority,
        notification: {
          channelId: channel.channelId,
          sound: soundTheme ? soundTheme.toLowerCase() : channel.sound,
          defaultSound: !soundTheme,
          notificationPriority: channel.priority === 'HIGH' ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT',
        },
      },
      apns: {
        headers: {
          'apns-priority': channel.priority === 'HIGH' ? '10' : '5',
        },
        payload: {
          aps: {
            alert: { title, body },
            sound: soundTheme ? `${soundTheme.toLowerCase()}.caf` : 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    },
  };

  // إذا لم يكن هناك اعتماد سحابي (وضع التطوير / الاختبار)، ننفذ إرسالاً صامتاً مع تسجيل الحدث
  if (!auth) {
    log.info(
      { platform, fcmToken: `${fcmToken.slice(0, 10)}...`, channel: channel.channelId, title },
      ' [FCM MOCK DISPATCH] تم إرسال الإشعار بنجاح في بيئة التطوير',
    );
    return { success: true, mocked: true, token: fcmToken };
  }

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken.token}`,
        },
        body: JSON.stringify(fcmMessage),
      },
    );

    const resJson = await response.json();

    if (!response.ok) {
      // فحص كنس التوكنات الميتة (Dead Token Eviction)
      const errCode = resJson.error?.details?.[0]?.errorCode || resJson.error?.status;
      if (
        response.status === 404 ||
        errCode === 'UNREGISTERED' ||
        errCode === 'INVALID_ARGUMENT'
      ) {
        log.warn({ fcmToken: `${fcmToken.slice(0, 10)}...`, errCode }, '️ حذف توكن جهاز ميت/ملغي تثبيت التطبيق');
        await prisma.device.deleteMany({ where: { fcmToken } }).catch(() => {});
      }
      return { success: false, error: resJson.error };
    }

    return { success: true, messageId: resJson.name };
  } catch (error) {
    log.error({ err: error.message, fcmToken }, ' خطأ أثناء نداء FCM v1');
    return { success: false, error: error.message };
  }
};

/**
 * إرسال دفعة إشعارات لجميع أجهزة المستخدم النشطة
 */
export const dispatchToUserDevices = async (userId, payload) => {
  const devices = await prisma.device.findMany({
    where: { userId },
    select: { fcmToken: true, platform: true },
  });

  if (devices.length === 0) {
    log.info({ userId }, 'لا توجد أجهزة مسجلة للمستخدم');
    return { sent: 0, totalDevices: 0 };
  }

  const results = await Promise.allSettled(
    devices.map((device) => dispatchToSingleDevice(device, payload)),
  );

  const successfulCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

  return {
    sent: successfulCount,
    totalDevices: devices.length,
  };
};

export default {
  dispatchToSingleDevice,
  dispatchToUserDevices,
  NOTIFICATION_CHANNELS,
};
