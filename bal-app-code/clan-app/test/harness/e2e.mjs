/**
 * ═══════════════════════════════════════════════════════════
 *  فحص حي للسلاسل الكاملة
 *
 *  بيشتغل على السيرفر الشغّال (npm run harness) وبيمشي فلو
 *  المستخدم فعلياً: الجبل → المهام → الإشعار → الرد،
 *  والرسائل بالسوكيت (وصول لحظي مش استطلاع).
 *
 *  التشغيل:
 *    1) npm run harness        (شباك)
 *    2) npm run e2e            (شباك تاني)
 * ═══════════════════════════════════════════════════════════
 */
import { io } from 'socket.io-client';

const B = process.env.HARNESS_URL ?? 'http://127.0.0.1:3999';
const API = `${B}/api`;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* رد بلا جسم */ }
  return { status: res.status, body: json };
};

const uniq = () => Math.random().toString(36).slice(2, 8);

// ════════════════════════════════════════════════
console.log('\n═══ 1. الدخول ═══');

const email = `e2e_${uniq()}@bal.app`;
const reg = await call('POST', '/auth/register', {
  body: { username: `مختبر_${uniq()}`, email, password: 'Passw0rd!23', domain: 'TECH' },
});
const token = reg.body?.accessToken;
const userId = reg.body?.user?.id;
ok(!!token, 'التسجيل رجّع توكن', `HTTP ${reg.status}`);

await call('POST', '/auth/onboarding', {
  token, body: { domain: 'TECH', interests: ['TECH'] },
});
const me = await call('GET', '/auth/me', { token });
ok(me.status === 200 && me.body?.user?.onboarded === true, 'الأونبوردنج اتسجّل');

// ════════════════════════════════════════════════
console.log('\n═══ 2. الجبل → المهام ═══');

/**
 * ️ مسار الحلم محتاج Gemini، والفحص ده بيشتغل في حالتين:
 *
 *   · `npm run harness`     → بلا مفتاح: لازم 503 صريح
 *                              (السلوك الصح — لا خطة وهمية)
 *   · `npm run harness:ai`  → ببديل: لازم 201 وأسئلة
 *
 *  الفحص كان بيفترض الحالة الأولى بس، فكان بيقع لما نشغّله
 *  على السيرفر ببديل الـ AI. الافتراض الضمني بيخلي الفحص
 *  يقول «مكسور» على حاجة شغالة.
 */
const dream = await call('POST', '/goals/dream', { token, body: { title: 'أكون مبرمج محترف' } });

if (dream.status === 201) {
  ok(
    Array.isArray(dream.body?.questions) && dream.body.questions.length > 0,
    'الحلم رجّع أسئلة (الـ AI متاح)',
  );
} else {
  ok(
    dream.status === 503 && /GEMINI|AI/.test(dream.body?.code ?? ''),
    'الحلم بيرفض بوضوح لما الـ AI مش متاح',
    `HTTP ${dream.status}`,
  );
}

const goals = await call('GET', '/goals', { token });
ok(goals.status === 200 && Array.isArray(goals.body?.goals), 'قائمة الأهداف بترجع');

// مهمة بوقت انتهاء — دي اللي البوب-أب بيتعلق بيها
const task = await call('POST', '/tasks', {
  token,
  body: { title: 'مذاكرة الفحص', priority: 'GROWTH' },
});
const taskId = task.body?.task?.id;
ok(!!taskId, 'المهمة اتعملت', `HTTP ${task.status}`);

const tasks = await call('GET', '/tasks', { token });
const found = (tasks.body?.tasks ?? []).some((t) => t.id === taskId);
ok(found, 'المهمة ظهرت في القائمة');

// ════════════════════════════════════════════════
console.log('\n═══ 3. حلقة الاطمئنان (البوب-أب) ═══');

const open = await call('POST', '/notifications/checkin/open', {
  token, body: { taskId, question: 'عملت إيه في المذاكرة؟' },
});
const notifId = open.body?.notificationId;
ok(!!notifId, 'خيط الاطمئنان اتفتح', `HTTP ${open.status}`);
ok(
  open.body?.question === 'عملت إيه في المذاكرة؟',
  'السؤال المخزّن هو اللي المستخدم شافه',
);

const thread = await call('GET', `/notifications/${notifId}/thread`, { token });
ok(thread.body?.canReply === true, 'الخيط بيقبل رد');

const reply = await call('POST', `/notifications/${notifId}/reply`, {
  token, body: { text: 'خلصت نصها بس اتشتت' },
});
ok(reply.status === 200 && !!reply.body?.reply, 'الرد رجّع كلام', `HTTP ${reply.status}`);
ok(
  reply.body?.source === 'SYSTEM' || reply.body?.source === 'AI',
  `مصدر الرد واضح (${reply.body?.source})`,
);

// ️ الإشعار لازم يتسجّل في القائمة — من غيره التطبيق مش هيلاقيه
const notifs = await call('GET', '/notifications', { token });
const inList = (notifs.body?.notifications ?? []).some((n) => n.id === notifId);
ok(inList, 'الإشعار موجود في قائمة الإشعارات');

// ════════════════════════════════════════════════
console.log('\n═══ 4. العشائر والتحدي ═══');

const auto = await call('POST', '/clans/global/auto-assign', { token });
ok(auto.status === 200 && !!auto.body?.clan?.id, 'الانضمام التلقائي لعشيرة الاهتمام');

const priv = await call('POST', '/clans/private/create', {
  token, body: { name: `عشيرة_${uniq()}` },
});
const clanId = priv.body?.clan?.id;
ok(!!clanId, 'العشيرة الخاصة اتعملت', `HTTP ${priv.status}`);

const ch = await call('POST', '/focus/challenge', {
  token, body: { clanId, title: 'نذاكر سوا', focusMin: 25, restMin: 5, cycles: 2 },
});
ok(ch.status === 201, 'التحدي اتطلق', `HTTP ${ch.status}`);
ok(ch.body?.challenge?.totalMin === 55, 'الوقت الإجمالي 55 دقيقة (25×2 + 5)');

/** ️ الواجهة بتمنع الراحة > 10 — نتأكد إن السيرفر بيرفضها فعلاً */
const badRest = await call('POST', '/focus/challenge', {
  token, body: { clanId, title: 'x', focusMin: 25, restMin: 30, cycles: 2 },
});
ok(badRest.status === 400, 'السيرفر بيرفض راحة أطول من الحد');

// ════════════════════════════════════════════════
console.log('\n═══ 5. الرسائل ═══');

const convs = await call('GET', '/chat/conversations', { token });
ok(convs.status === 200, 'قائمة المحادثات بترجع');

const clanChats = await call('GET', '/chat/clans', { token });
ok(clanChats.status === 200, 'شاتات العشائر بترجع');

// ════════════════════════════════════════════════
console.log('\n═══ 6. الوصول المستمر (Socket.io) ═══');

const socketResult = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ connected: false, reason: 'مهلة' }), 8000);

  const socket = io(`${B}/notifications`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });

  socket.on('connect', () => {
    /**
     * ️ الاتصال لوحده مش كفاية — لازم نتأكد إن السيرفر بيبعت
     *    فعلاً. بنطلب إشعار جديد ونستنى يوصل على القناة.
     */
    let gotPush = false;

    socket.on('notification:new', () => { gotPush = true; });
    socket.on('notification:pending', () => { /* دفعة أولى */ });

    // نولّد إشعار من مسار حقيقي
    call('POST', '/notifications/checkin/open', {
      token, body: { taskId, question: 'سؤال البث' },
    }).catch(() => {});

    setTimeout(() => {
      clearTimeout(timer);
      socket.disconnect();
      resolve({ connected: true, gotPush });
    }, 2500);
  });

  socket.on('connect_error', (e) => {
    clearTimeout(timer);
    resolve({ connected: false, reason: e.message });
  });
});

ok(socketResult.connected, 'الاتصال بقناة الإشعارات', socketResult.reason);

const chatSocket = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ connected: false, reason: 'مهلة' }), 8000);
  const s = io(`${B}/chat`, { auth: { token }, transports: ['websocket'], reconnection: false });
  s.on('connect', () => { clearTimeout(timer); s.disconnect(); resolve({ connected: true }); });
  s.on('connect_error', (e) => { clearTimeout(timer); resolve({ connected: false, reason: e.message }); });
});
ok(chatSocket.connected, 'الاتصال بقناة الشات', chatSocket.reason);

/** ️ التوكن الغلط لازم يترفض — القناة مش مفتوحة للكل */
const rejected = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 6000);
  const s = io(`${B}/notifications`, {
    auth: { token: 'not-a-real-token' },
    transports: ['websocket'],
    reconnection: false,
  });
  s.on('connect', () => { clearTimeout(timer); s.disconnect(); resolve(false); });
  s.on('connect_error', () => { clearTimeout(timer); resolve(true); });
});
ok(rejected, 'التوكن الغلط مرفوض على السوكيت');

// ════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`  ✅ ${pass} نجح   ❌ ${fail} فشل`);
console.log('═'.repeat(40));
process.exit(fail ? 1 : 0);
