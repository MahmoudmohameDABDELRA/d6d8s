/**
 * ═══════════════════════════════════════════════════════════
 *  فحص حي لكل فيتشرز الشات — بالتشغيل مش بالقراية
 *
 *  ️ الفجوة اللي بيغطيها:
 *
 *  السيرفر عنده ٨ نقاط للرسايل (تعديل، حذف، تفاعل، إبلاغ،
 *  إبلاغ وحظر) + حدثين على السوكيت (`typing`, `message_read`)
 *  وكانوا **كلهم** مش مستخدمين من التطبيق. دلوقتي بقوا مستخدمين،
 *  فلازم نتأكد إنهم شغالين فعلاً — مش إنهم موجودين في الكود.
 *
 *  وبيتأكد كمان من **الترقيم**: الشاشة كانت بتحمّل كل الرسايل
 *  مرة واحدة. بنبعت ٥٠ رسالة ونتأكد إن `limit` و`before`
 *  بيشتغلوا وإن `hasMore` صادق.
 *
 *  التشغيل:
 *    1) npm run harness
 *    2) node test/harness/chat-probe.mjs
 * ═══════════════════════════════════════════════════════════
 */
import { io } from 'socket.io-client';

const B = process.env.HARNESS_URL ?? 'http://127.0.0.1:3999';
const API = `${B}/api`;

let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${label}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const call = async (method, path, { token, body, query } = {}) => {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* رد بلا جسم */
  }
  return { status: res.status, body: json };
};

const uniq = () => Math.random().toString(36).slice(2, 8);

const makeUser = async (label) => {
  const email = `${label}_${uniq()}@bal.app`;
  const reg = await call('POST', '/auth/register', {
    body: {
      username: `${label}_${uniq()}`,
      email,
      password: 'Passw0rd!23',
      domain: 'TECH',
    },
  });
  const token = reg.body?.accessToken;
  await call('POST', '/auth/onboarding', {
    token,
    body: { domain: 'TECH', interests: ['TECH'] },
  });
  return { token, id: reg.body?.user?.id, email };
};

// ════════════════════════════════════════════════
console.log('\n═══ 1. تجهيز محادثة بين اتنين ═══');

const amr = await makeUser('amr');
const sara = await makeUser('sara');
ok(!!amr.token && !!sara.token, 'المستخدمين اتعملوا');

/**
 * ️ سلوك السيرفر (نظام انستقرام): أول رسالة لحد مش صاحبك
 *    ممكن تتحوّل **طلب صداقة** بدل محادثة، حسب حالة العلاقة.
 *    الفحص بيمشي نفس طريق المستخدم الحقيقي ويستوعب الحالتين
 *    بدل ما يفترض واحدة — الافتراض بيخلي الفحص هشّ.
 */
const started = await call('POST', '/chat/start', {
  token: amr.token,
  body: { targetUserId: sara.id, text: 'أهلاً' },
});

let convId = started.body?.conversationId;

if (!convId && started.body?.isFriendRequest === true) {
  ok(true, 'أول رسالة لغريب = طلب صداقة (سلوك مقصود)');

  const incoming = await call('GET', '/social/friends/requests', {
    token: sara.token,
  });
  const requestId =
    incoming.body?.requests?.[0]?.id ?? started.body?.friendshipId;

  //  الموافقة بتعمل المحادثة وتحقن نص الطلب كأول رسالة
  const accepted = await call(
    'POST',
    `/social/friends/requests/${requestId}/respond`,
    { token: sara.token, body: { action: 'ACCEPT' } },
  );
  convId = accepted.body?.conversationId;
  ok(!!convId, 'الموافقة فتحت المحادثة', `HTTP ${accepted.status}`);
} else {
  ok(!!convId, 'المحادثة اتفتحت مباشرةً', `HTTP ${started.status}`);
}

if (!convId) {
  console.log('\n  ⛔ مقدرناش نكمّل بلا محادثة\n');
  process.exit(1);
}

// ════════════════════════════════════════════════
console.log('\n═══ 2. الترقيم — مش تحميل كل حاجة مرة واحدة ═══');

/**
 * ️ ٥٠ رسالة. النسخة القديمة كانت بتنزّلهم كلهم في كل استطلاع،
 *    كل ١٥ ثانية. تخيّل محادثة عمرها سنة.
 */
for (let i = 1; i <= 50; i += 1) {
  await call('POST', `/chat/${convId}/messages`, {
    token: i % 2 ? amr.token : sara.token,
    body: { text: `رسالة رقم ${i}` },
  });
}

const page1 = await call('GET', `/chat/${convId}/messages`, {
  token: amr.token,
  query: { limit: 20 },
});

ok(
  (page1.body?.messages ?? []).length === 20,
  'limit=20 بيرجّع ٢٠ بالظبط',
  `رجّع ${(page1.body?.messages ?? []).length}`,
);
ok(page1.body?.hasMore === true, 'hasMore = true وفيه أقدم');

const oldest = page1.body.messages[0];
ok(!!oldest?.createdAt, 'أقدم رسالة في الصفحة ليها createdAt');

const page2 = await call('GET', `/chat/${convId}/messages`, {
  token: amr.token,
  query: { before: oldest.createdAt, limit: 20 },
});

const p2 = page2.body?.messages ?? [];
ok(p2.length === 20, 'الصفحة التانية ٢٠ كمان', `رجّع ${p2.length}`);

const ids1 = new Set(page1.body.messages.map((m) => m.id));
ok(
  p2.every((m) => !ids1.has(m.id)),
  'مفيش تكرار بين الصفحتين',
);

ok(
  new Date(p2[p2.length - 1].createdAt) <= new Date(oldest.createdAt),
  'الصفحة التانية أقدم فعلاً',
);

// ════════════════════════════════════════════════
console.log('\n═══ 3. الرد — لقطة مش مرجع ═══');

const target = page1.body.messages[page1.body.messages.length - 1];

const replied = await call('POST', `/chat/${convId}/messages`, {
  token: sara.token,
  body: { text: 'ردي على دي', replyToId: target.id },
});

const reply = replied.body?.message;
ok(replied.status === 201, 'الرد اتبعت', `HTTP ${replied.status}`);
ok(reply?.replyToId === target.id, 'replyToId متسجّل');
ok(
  !!reply?.replyToText,
  'replyToText اتخزن كلقطة — الرد يفضل مقروء لو الأصل اتمسح',
);

// ════════════════════════════════════════════════
console.log('\n═══ 4. التعديل ═══');

const mine = await call('POST', `/chat/${convId}/messages`, {
  token: amr.token,
  body: { text: 'نص قبل التعديل' },
});
const mineId = mine.body?.message?.id;

const edited = await call('PATCH', `/chat/messages/${mineId}`, {
  token: amr.token,
  body: { text: 'نص بعد التعديل' },
});

ok(edited.status === 200, 'التعديل نجح', `HTTP ${edited.status}`);
ok(edited.body?.message?.text === 'نص بعد التعديل', 'النص اتغيّر');
ok(edited.body?.message?.isEdited === true, 'اتعلّمت كمعدَّلة');

const notMine = await call('PATCH', `/chat/messages/${mineId}`, {
  token: sara.token,
  body: { text: 'أنا مش صاحبها' },
});
ok(
  notMine.status === 403,
  'تعديل رسالة غيرك مرفوض',
  `HTTP ${notMine.status}`,
);

// ════════════════════════════════════════════════
console.log('\n═══ 5. التفاعل — واحد لكل مستخدم ═══');

const r1 = await call('POST', `/chat/messages/${mineId}/react`, {
  token: sara.token,
  body: { emoji: '🔥' },
});
ok(r1.status === 200 && r1.body?.reactions?.length === 1, 'التفاعل اتسجّل');

//  نفس الإيموجي تاني = يشيله (toggle)
const r2 = await call('POST', `/chat/messages/${mineId}/react`, {
  token: sara.token,
  body: { emoji: '🔥' },
});
ok(r2.body?.reactions?.length === 0, 'نفس الإيموجي تاني بيشيله');

//  إيموجي مختلف = يستبدل
await call('POST', `/chat/messages/${mineId}/react`, {
  token: sara.token,
  body: { emoji: '👍' },
});
const r4 = await call('POST', `/chat/messages/${mineId}/react`, {
  token: sara.token,
  body: { emoji: '❤️' },
});
ok(
  r4.body?.reactions?.length === 1 && r4.body.reactions[0].emoji === '❤️',
  'إيموجي مختلف بيستبدل القديم مش بيتراكم',
);

// ════════════════════════════════════════════════
console.log('\n═══ 6. الحذف الناعم ═══');

const toDelete = await call('POST', `/chat/${convId}/messages`, {
  token: amr.token,
  body: { text: 'هتتمسح' },
});
const delId = toDelete.body?.message?.id;

const strangerDelete = await call('DELETE', `/chat/messages/${delId}`, {
  token: sara.token,
});
ok(
  strangerDelete.status === 403,
  'مسح رسالة غيرك مرفوض',
  `HTTP ${strangerDelete.status}`,
);

const deleted = await call('DELETE', `/chat/messages/${delId}`, {
  token: amr.token,
});
ok(deleted.status === 200, 'صاحب الرسالة يقدر يمسحها');

// ════════════════════════════════════════════════
console.log('\n═══ 7. الإبلاغ ═══');

const bad = await call('POST', `/chat/${convId}/messages`, {
  token: sara.token,
  body: { text: 'رسالة هيتبلّغ عنها' },
});
const badId = bad.body?.message?.id;

const reported = await call('POST', `/chat/messages/${badId}/report`, {
  token: amr.token,
  body: { reason: 'HARASSMENT' },
});
ok(
  reported.status === 201,
  'البلاغ اتسجّل',
  `HTTP ${reported.status}`,
);

// ════════════════════════════════════════════════
console.log('\n═══ 8. «بيكتب…» و«شافها» على السوكيت ═══');

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(`${B}/chat`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('TIMEOUT')), 5000);
  });

try {
  const sockA = await connect(amr.token);
  const sockB = await connect(sara.token);

  await new Promise((r) => {
    sockA.emit('join_conversation', { conversationId: convId });
    sockB.emit('join_conversation', { conversationId: convId });
    setTimeout(r, 300);
  });

  //  عمرو بيستنى إشارة كتابة من سارة
  const typingSeen = new Promise((resolve) => {
    sockA.on('typing', (d) => resolve(d));
    setTimeout(() => resolve(null), 3000);
  });

  sockB.emit('typing_start', { conversationId: convId });
  const typing = await typingSeen;

  ok(typing !== null, 'حدث typing وصل للطرف التاني');
  ok(typing?.isTyping === true, 'isTyping = true');
  ok(
    typing?.userId === sara.id,
    'الحدث فيه مين بيكتب',
    `رجّع ${typing?.userId}`,
  );

  //  إيصال القراءة
  const readSeen = new Promise((resolve) => {
    sockB.on('message_read', (d) => resolve(d));
    setTimeout(() => resolve(null), 3000);
  });

  sockA.emit('mark_read', { conversationId: convId, messageId: badId });
  const read = await readSeen;

  ok(read !== null, 'حدث message_read وصل');
  ok(read?.messageId === badId, 'الإيصال بيشاور على الرسالة الصح');

  sockA.close();
  sockB.close();
} catch (e) {
  ok(false, 'الاتصال بالسوكيت', e.message);
}

console.log(`\n  ✅ ${pass} نجح   ❌ ${fail} فشل\n`);
process.exit(fail === 0 ? 0 : 1);
