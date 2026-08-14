import 'dotenv/config';
process.env.DATABASE_URL ||= 'postgresql://x:x@localhost:5432/x';
process.env.JWT_ACCESS_SECRET = 't_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET = 't_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID = 'fake.apps.googleusercontent.com';
process.env.NODE_ENV = 'test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/x';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const { register } = await import('node:module');
register('./loader.mjs', import.meta.url);

const request = (await import('supertest')).default;
const prisma = (await import('../src/config/prisma.js')).default;
const app = (await import('../src/app.js')).default;
const notifService = await import('../src/services/notification.service.js');

let pass = 0, fail = 0;
const t = async (n, f) => {
  try {
    await f();
    console.log(`✅ ${n}`);
    pass += 1;
  } catch (e) {
    console.log(`❌ ${n}\n     ${e.message}`);
    fail += 1;
  }
};
const eq = (a, b, m = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`);
  }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

// تنظيف
await prisma.device.deleteMany();
await prisma.notification.deleteMany();
await prisma.user.deleteMany();

// مستخدم مسجل
const regUser = await request(app).post('/api/auth/google').send({ idToken: 'valid:notif_u1:notif@user.com:NotifUser' });
const userTok = regUser.body.accessToken;
const userId = regUser.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization', `Bearer ${userTok}`).send({ domain: 'TECH' });

const A = (r) => r.set('Authorization', `Bearer ${userTok}`);

console.log('\n━━━ 📲 تسجيل توكنات الأجهزة (FCM Tokens) ━━━');

await t('تسجيل توكن جهاز أندرويد (201)', async () => {
  const r = await A(request(app).post('/api/notifications/device')).send({
    fcmToken: 'fcm_token_sample_123456',
    platform: 'ANDROID',
  });
  eq(r.status, 201, 'status');
  eq(r.body.device.platform, 'ANDROID', 'المنصة');
});

await t('إعادة تسجيل نفس التوكن لا تنشئ تكراراً (upsert)', async () => {
  const r = await A(request(app).post('/api/notifications/device')).send({
    fcmToken: 'fcm_token_sample_123456',
    platform: 'ANDROID',
  });
  eq(r.status, 201, 'status');
  const count = await prisma.device.count({ where: { fcmToken: 'fcm_token_sample_123456' } });
  eq(count, 1, 'توكن واحد فقط في القاعدة');
});

await t('توكن فارغ يُرفض 400', async () => {
  const r = await A(request(app).post('/api/notifications/device')).send({});
  eq(r.status, 400, 'status');
});

console.log('\n━━━ 🔔 إرسال وقراءة الإشعارات ━━━');

let notifId;
await t('إرسال إشعار فوري وحفظه في القاعدة', async () => {
  const notif = await notifService.sendNotification(userId, {
    type: 'ACHIEVEMENT_UNLOCKED',
    title: '🏆 وسام جديد!',
    body: 'لقد حصلت على وسام بداية الشغف +100 شرارة',
    data: { badgeCode: 'FOCUS_BRONZE' },
  });
  ok(notif, 'تم إنشاء الإشعار');
  notifId = notif.id;
  eq(notif.isRead, false, 'غير مقروء');
});

await t('GET /api/notifications يجلب قائمة الإشعارات مع unreadCount', async () => {
  const r = await A(request(app).get('/api/notifications?page=1&limit=10'));
  eq(r.status, 200, 'status');
  eq(r.body.unreadCount, 1, 'عدد غير المقروء');
  ok(r.body.notifications.length >= 1, 'قائمة الإشعارات');
});

await t('PATCH /api/notifications/:id/read يعلم الإشعار كمقروء', async () => {
  const r = await A(request(app).patch(`/api/notifications/${notifId}/read`));
  eq(r.status, 200, 'status');

  const check = await prisma.notification.findUnique({ where: { id: notifId } });
  eq(check.isRead, true, 'isRead أصبح true');
  ok(check.readAt, 'تم تسجيل readAt');
});

await t('PATCH /api/notifications/read-all يعلم جميع الإشعارات كمقروءة', async () => {
  await notifService.sendNotification(userId, {
    type: 'PULSE_STARTING',
    title: '⚡ النبض بدأ!',
    body: 'انضم لغرفة التركيز الآن',
  });
  const r = await A(request(app).patch('/api/notifications/read-all'));
  eq(r.status, 200, 'status');

  const unread = await prisma.notification.count({ where: { userId, isRead: false } });
  eq(unread, 0, 'صفر إشعارات غير مقروءة');
});

await t('إلغاء تسجيل توكن الجهاز ينجح عند الخروج', async () => {
  const r = await A(request(app).delete('/api/notifications/device/fcm_token_sample_123456'));
  eq(r.status, 200, 'status');

  const count = await prisma.device.count({ where: { fcmToken: 'fcm_token_sample_123456' } });
  eq(count, 0, 'تم حذف التوكن بنجاح');
});

console.log(`\n${'═'.repeat(50)}\nالنتيجة: ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
process.exit(fail ? 1 : 0);
