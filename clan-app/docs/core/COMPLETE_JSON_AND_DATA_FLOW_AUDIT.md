# COMPLETE_JSON_AND_DATA_FLOW_AUDIT

> تدقيق معماري READ-ONLY — كل JSON Contract وData Shape وPayload موجود فعلياً في المشروع.
> التاريخ: 2026-08-13 · المصدر: فحص حي للكود المصدري (لا افتراض، لا تخمين).
> كل معلومة معها: اسم الملف + رقم السطر + الكود الحقيقي. غير الموجود = `NOT FOUND`.

---

## 0) حقائق إحصائية (من الكود)

| المقياس | العدد | الدليل |
|---|---|---|
| ملفات src | 104 | `find src -name "*.js" \| wc -l` |
| `JSON.parse` | 9 | grep شامل |
| `JSON.stringify` | 14 | grep شامل |
| `res.json` | 184 | grep شامل |
| `req.body` | 92 | grep شامل |
| `extractJson` | 5 | (تعريف في ملفين + استدعاءات) |
| Zod / Joi / Yup | **0** | `NOT FOUND` — التحقق مخصص بالكامل في `src/utils/validate.js` |
| DTO classes | **0** | `NOT FOUND` — لا DTO classes؛ الـ shapes كائنات JS مباشرة |

---

# المرحلة 1 + 2: JSON Discovery + JSON Catalog

## 1.1 مواقع JSON.parse (الـ 9 كلها)

| # | Module | JSON Name | Direction | Source File |
|---|--------|-----------|-----------|-------------|
| 1 | Alarm | `wakeProof` | Client → Server | `src/modules/alarm/alarm.controller.js:68` |
| 2 | Analytics | `dashboardCached` | Redis → Server | `src/services/analytics.service.js:75` |
| 3 | Analytics | `timelineCached` | Redis → Server | `src/services/analytics.service.js:219` |
| 4 | Chat | `idempotencyCached` | Redis → Server | `src/services/chat.service.js:24` |
| 5 | AI | `aiJson` (dream) | AI → Server | `src/services/dreamPlanner.service.js:23` |
| 6 | AI | `aiJson` (journey) | AI → Server | `src/services/journeyPlanner.service.js:25` |
| 7 | Push | `firebaseCredentials` | Env → Server | `src/services/pushDispatcher.service.js:37` |
| 8 | Cache | `userCached` | Redis → Server | `src/services/userCache.service.js:113` |
| 9 | Game | `tilesClone` | Server → Memory | `src/sockets/domino.game.js:37` |

## 1.2 مواقع JSON.stringify (الـ 14 كلها)

| # | Module | JSON Name | Direction | Source File |
|---|--------|-----------|-----------|-------------|
| 1 | AI | `sseChunk` | Server → Client (SSE) | `src/modules/ai/ai.controller.js:870,872,874` |
| 2 | Alarm | `proofPayload` | Server → Client (token) | `src/modules/alarm/alarm.controller.js:43` |
| 3 | Analytics | `dashboardSet` | Server → Redis | `src/services/analytics.service.js:201` |
| 4 | Analytics | `resultSet` | Server → Redis | `src/services/analytics.service.js:387` |
| 5 | Chat | `idempotencySet` | Server → Redis | `src/services/chat.service.js:37` |
| 6 | AI | `planPrompt` | Server → AI | `src/services/dreamPlanner.service.js:68` |
| 7 | AI | `journeyPrompt` | Server → AI | `src/services/journeyPlanner.service.js:48` |
| 8 | Push | `fcmDataFlatten` | Server → FCM | `src/services/pushDispatcher.service.js:79` |
| 9 | Push | `fcmBody` | Server → FCM (HTTP) | `src/services/pushDispatcher.service.js:128` |
| 10 | Cache | `userSet` | Server → Redis | `src/services/userCache.service.js:144` |
| 11 | Game | `tilesClone` | Server → Memory | `src/sockets/domino.game.js:37` |
| 12-14 | Game | `game-server.js:43` + أخرى | Server → (WebSocket legacy) | `src/game-server.js:43` |

---

# المرحلة 3: الـ JSON الحقيقي (كود + أمثلة)

## 3.1 استخراج JSON من رد الـ AI (مشترك بين المخططين)

**الملف**: `src/services/dreamPlanner.service.js:16-23` (مكرر حرفياً في `journeyPlanner.service.js:19-26`)

```js
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);   // يتحمل علامات ```json
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI_INVALID_JSON');
  return JSON.parse(raw.slice(start, end + 1));
};
```

## 3.2 عقد الحلم — توليد الأسئلة (Quiz)

**الملف**: `src/services/dreamPlanner.service.js:24-55`

**Prompt Input (Server → AI)**:
```
system = QUIZ_SYSTEM + `أنت تُدعى «${name}» وتخاطب «${username}».`
prompt = `هدف المستخدم: «${dreamTitle}»\nاسألني الأسئلة الأربعة.`
generate(system, [], prompt, { maxTokens: 1024, temperature: 0.7 })
```

**Expected JSON (AI → Server)**:
```json
{"questions":[{"question":"...","options":["...","...","..."]}]}
```

**Validation Layer**: `if (!Array.isArray(data.questions) || data.questions.length === 0) throw new Error('AI_INVALID_RESPONSE')`

**مثال Payload حقيقي (من الاختبار الحي)**:
```json
{"questions":[
  {"question":"ما هي نقطة انطلاقك الحالية في عالم إدارة المنتجات؟","options":["مبتدئ تماماً (أبحث عن مسار تعلم من الصفر).","لدي معرفة نظرية لكن لم أطبقها عملياً بعد.","أعمل حالياً في دور تقني أو إداري وأريد الانتقال لهذا المجال."]},
  {"question":"ما هي المهارة التي تشعر أنها أقوى نقطة في جعبتك حالياً؟","options":["المهارات التحليلية والتعامل مع البيانات.","التواصل والتفاوض وفهم احتياجات المستخدمين.","الجانب التقني والقدرة على الحديث بلغة المبرمجين."]}
]}
```

## 3.3 عقد خطة الأهداف (Plan)

**الملف**: `src/services/dreamPlanner.service.js:63-80`

**Prompt Input**:
```js
const prompt = JSON.stringify({
  goal: dreamTitle,
  answers: answers.map((a) => ({ question: a.question, answer: a.answer })),
});
generate(system, [], prompt, { maxTokens: 1536, temperature: 0.7 })
```

**Expected JSON**: `{"steps":[{"title":"عنوان الخطوة","description":"شرح مختصر بماذا تُنجز"}]}`

**Validation**: `if (!Array.isArray(data.steps) || data.steps.length < 2) throw new Error('AI_INVALID_RESPONSE')`

**مثال حقيقي (من الاختبار الحي)**: `{"steps":[{"title":"فهم أساسيات علوم الحاسب","description":"..."},{"title":"إتقان أساسيات لغة Dart","description":"..."},{"title":"القمة: بناء تطبيقك الأول المتكامل","description":"..."}]}`

## 3.4 عقد رحلة الهدف (Journey) — الجديد

**الملف**: `src/services/journeyPlanner.service.js:40-71`

**Prompt Input**:
```js
const prompt = JSON.stringify({
  dream: dreamTitle,
  goal: goalTitle,
  instructions: 'ابنِ الرحلة الزمنية الكاملة لهذا الهدف — أيام متسلسلة تبدأ من اليوم 1.',
});
generate(system, [], prompt, { maxTokens: 2048, temperature: 0.7 })
```

**Expected JSON**: `{"days":[{"day":1,"title":"...","description":"..."}]}`

**Validation + تطبيع**: ترقيم متسلسل من 1، عناوين نصية، فلترة الفارغ:
```js
const days = data.days
  .map((d, i) => ({ day: Number(d.day) || i + 1, title: String(d.title ?? '').trim(), description: ... }))
  .filter((d) => d.title.length > 0)
  .map((d, i) => ({ ...d, day: i + 1 }));
if (days.length === 0) throw new Error('AI_INVALID_RESPONSE');
```

**مثال حقيقي (من الاختبار الحي)**:
```json
{"days":[
  {"day":1,"title":"مدخل إلى العمارة الحاسوبية","description":"استكشاف وفهم مكونات الحاسوب الأساسية."},
  {"day":2,"title":"أنظمة العد والتمثيل الرقمي","description":"فهم النظام الثنائي وتحويل الأعداد."},
  {"day":3,"title":"منطق الخوارزميات (Algorithms)","description":"..."}
]}
```

## 3.5 عقد حفظ الخطة في القاعدة (Server → DB)

**الملف**: `src/modules/journal/journal.controller.js:227-238`

```js
await prisma.goalStep.deleteMany({ where: { goalId: draft.id } });
await prisma.goalStep.createMany({
  data: plan.steps.map((step, i) => ({
    goalId: draft.id,
    title: step.title,
    description: step.description ?? null,
    order: i,
  })),
});
```

## 3.6 عقد تخزين الرحلة (Server → DB)

**الملف**: `src/modules/journal/journal.controller.js` (دالة `generateStepJourney`)

```js
const journey = await prisma.$transaction(async (tx) => {
  const j = await tx.journey.create({
    data: { goalStepId: step.id, title: `رحلة «${step.title}»`, durationDays: plan.days.length },
  });
  await tx.journeyDay.createMany({
    data: plan.days.map((d) => ({
      journeyId: j.id, dayNumber: d.day, title: d.title, description: d.description,
    })),
  });
  return j;
});
```

**Storage Layer** (schema):
```prisma
model Journey {
  id String @id @default(uuid())
  goalStepId String @unique
  title String
  durationDays Int @default(1)
  currentDay Int @default(1)
  status String @default("DRAFT")   // DRAFT | ACTIVE | COMPLETED
  approvedAt DateTime?
  completedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  step GoalStep @relation(fields: [goalStepId], references: [id], onDelete: Cascade)
  days JourneyDay[]
}
model JourneyDay {
  id String @id @default(uuid())
  journeyId String
  dayNumber Int
  title String
  description String?
  scheduledDate DateTime? @db.Date
  status String @default("PENDING")  // PENDING | COMPLETED
  completedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  journey Journey @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  tasks Task[]
  @@unique([journeyId, dayNumber])
  @@index([journeyId, status])
}
```

## 3.7 عقد استجابة الموافقة على الرحلة (Server → Client)

**الملف**: `src/modules/journal/journal.controller.js` (دالة `approveStepJourney`)

```js
return res.json({
  success: true,
  message: 'الرحلة اتثبّت — مهامك جاهزة في قسم المهام',
  journey: updated,        // Journey + days كاملة
  generatedTasks: sched.created,
});
```

## 3.8 عقد عرض الرحلة (Server → Client)

**الملف**: `src/modules/journal/journal.controller.js` (دالة `getStepJourney`)

```json
{
  "success": true,
  "journey": {
    "id": "...", "title": "رحلة «...»", "status": "ACTIVE", "durationDays": 7,
    "currentDay": 2, "approvedAt": "...", "completedAt": null,
    "step": {"title": "...", "isCompleted": false},
    "progress": {"completed": 1, "total": 7, "percent": 14},
    "lateDays": 0,
    "days": [{"id":"...","dayNumber":1,"title":"...","status":"COMPLETED","scheduledDate":"2026-08-13", ...}],
    "tasks": [{"id":"...","title":"...","isCompleted":true,"journeyDayId":"..."}]
  }
}
```

## 3.9 عقد نقل اليوم → مهمة (Server → DB — صفر AI)

**الملف**: `src/services/journeyScheduler.service.js:62-73`

```js
await prisma.task.create({
  data: {
    userId: journey.step.goal.userId,
    title: day.title,
    description: day.description ?? `اليوم ${day.dayNumber} من رحلة «${journey.title}»`,
    priority: 'GROWTH', source: 'JOURNEY',
    journeyDayId: day.id, goalStepId: journey.step.id,
    dueDate: scheduledDate, slotDate: scheduledDate,
  },
});
```
**Idempotency**: `journeyDayId` فريد في schema + فحص `task.findUnique({ where: { journeyDayId: day.id } })` قبل الإنشاء + التقاط `P2002` في سباق.

## 3.10 عقد إتمام المهمة + سلسلة التقدم (Client → Server → DB)

**الملف**: `src/modules/task/task.controller.js` (دالة `completeTask`)

- **Input (Client → Server)**: `PATCH /api/tasks/:id/complete` — body فارغ، المعرّف في الـ URL
- **Server → DB (transaction واحدة)**: `task.updateMany(isCompleted, completedAt, earnedSparks)` → `taskStep.updateMany` → `logHistory(tx, id, 'COMPLETED')` → `sparksService.award(...)` → `streakService.touch(...)` → (لو `source==='JOURNEY'`) `journeyDay.update(COMPLETED)` → فحص كل الأيام → `journey.update(COMPLETED)` + `goalStep.update(isCompleted)` → فحص كل الخطوات → `goal.update(completedAt, isActive:false)` 🏁
- **Output (Server → Client)**:
```json
{
  "success": true, "message": "أحسنت! مهمة منجزة",
  "sparks": {"earned": 10, "balance": 120},
  "streak": {"current": 3, "longest": 5},
  "unlockedAchievements": [],
  "nextRoutine": null,
  "mountain": {"goalCompleted": true, "summit": true}
}
```

## 3.11 عقد النكشة قبل المهمة (AI Contract)

**الملف**: `src/services/taskNudge.service.js:43-65`

- **Prompt Input**: `المهمة القادمة: «${task.title}» (${timeLabel}) — أولويتها ${priorityLabel}. ملاحظة: ...`
- **Expected Output**: نص حر (سطران) — ليس JSON
- **Storage**: `prisma.notification.create({ type: 'TASK_REMINDER', title: 'قبل المهمة بـ 5 دقائق', body: text.slice(0,250), data: { taskId, source } })`
- **مثال حقيقي**: `«يا بطل، "عدّة الشغل" هي نصف الإنجاز، ومستقبلك البرمجي يبدأ من هنا! موعدنا مع تثبيت...»`

## 3.12 عقد الاطمئنان بعد المهمة (AI Contract)

**الملف**: `src/services/taskCheckIn.service.js:28-89`

- **Queue → Worker**: `{ taskId }` بتأخير `10 * 60 * 1000` ms
- **Prompt Input**: `persona.build('TASK_FOLLOWUP') + أنت «${name}»... اسأله بصدق: عملت إيه؟ واجهتك مشكلة؟ محتاج مساعدة؟`
- **Output**: نص حر — `notification.create({ type: 'TASK_CHECKIN', title: '${name} بيسأل عنك', body: text, data: { taskId, source, kind: 'checkin' } })`
- **Idempotency**: فحص إشعار سابق بنفس taskId → `{ skipped: 'ALREADY_CHECKED' }`
- **مثال حقيقي**: `«يا سلام! خلصت "تثبيت الأدوات الأساسية" يا بطل، دي خطوة كبيرة في طريقك. ✨ إيه أكتر جزء خد وقت معاك؟...»`

## 3.13 عقد إثبات الاستيقاظ (Alarm — Client ⇄ Server)

**الملف**: `src/modules/alarm/alarm.controller.js:41-70`

```js
// Server → Client (token موقع):
const payload = JSON.stringify({ a: answer, t: Date.now() });
const body = Buffer.from(payload).toString('base64url');
const sig = crypto.createHmac('sha256', env.jwt.accessSecret).update(body).digest('base64url');
return `${body}.${sig}`;

// Client → Server (تحقق):
JSON.parse(Buffer.from(body, 'base64url').toString())  // { a: answer, t: timestamp }
```
**الأمان**: HMAC-SHA256 + مقارنة ثابتة الزمن (`crypto.timingSafeEqual`) — رفض التزوير.

## 3.14 عقد كاش التحليلات (Server → Redis ⇄ Server)

**الملف**: `src/services/analytics.service.js:201`

```js
await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(dashboard));
// القراءة: JSON.parse(cached) — سطر 75
// شكل dashboard: { ..., ranking: percentileData, generatedAt: new Date().toISOString() }
```
**مفاتيح الكاش**: `analytics:${userId}:timeline:${daysLimit}:${timezone}` (سطر 219) و `analytics:${userId}:dashboard:${timezone}` (نمط مشابه).

## 3.15 عقد كاش المستخدم (Server → Redis ⇄ Server)

**الملف**: `src/services/userCache.service.js:113,144`

```js
await redisClient.set(k, JSON.stringify(user), { EX: TTL_SEC });   // كتابة
return JSON.parse(raw);                                            // قراءة
```
**الكتابة المحلية**: `localGet`/`localSet` (في الذاكرة) كـ fallback عند غياب Redis.

## 3.16 عقد Idempotency الرسائل (Server → Redis)

**الملف**: `src/services/chat.service.js:15-42`

```js
const idempKey = (userId, clientMsgId) => `msg:idemp:${userId}:${clientMsgId}`;
await redisClient.set(idempKey(userId, clientMsgId), JSON.stringify(message), { EX: 60 });
// القراءة: JSON.parse(raw) — سطر 24
```
**Expiry**: 60 ثانية — تغطي محاولات إعادة الإرسال.

## 3.17 عقد FCM Push (Server → FCM)

**الملف**: `src/services/pushDispatcher.service.js:37,79,128`

```json
{
  "message": {
    "token": "<fcmToken>",
    "notification": {"title": "...", "body": "..."},
    "data": {
      "type": "TASK_REMINDER", "soundTheme": "ZEN_BELL",
      "taskId": "..."   // كل قيمة object تُسوّى JSON.stringify
    },
    "android": {"priority": "HIGH", "notification": {"channelId": "...", "sound": "..."}},
    "apns": {"headers": {"apns-priority": "10"}, "payload": {"aps": {"alert": {...}, "sound": "...", "badge": 1, "contentAvailable": true}}}
  }
}
```

## 3.18 عقد SSE (Server → Client — بث ذكي)

**الملف**: `src/modules/ai/ai.controller.js:870-874`

```js
res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);   // كل قطعة
res.write(`data: ${JSON.stringify({ done: true })}\n\n`);          // النهاية
res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);  // الخطأ
```

## 3.19 عقد Socket.IO (Server → Client)

**الملف**: `src/sockets/chat.socket.js`

| الحدث | الـ payload |
|---|---|
| `presence_update` | `{ userId, isOnline: true }` / `{ userId, isOnline: false, lastSeen }` |
| `joined` | `{ conversationId, typing }` |
| `typing` | `{ userId, username, isTyping }` |
| `message_read` | `{ ... }` |
| `error_message` | `{ code, message }` |

**الملف**: `src/sockets/snake.game.js`

| الحدث | الـ payload |
|---|---|
| `player_joined` | `{ ... }` |
| `player_connected` | `{ playerId }` |
| `game_state_update` | `buildStatePacket(room)` |
| `game_over` | `{ ... }` |
| `player_disconnected` | `{ playerId: socket.id }` |
| `error_message` | `{ code: 'ROOM_NOT_FOUND' \| 'ROOM_EXPIRED' \| 'NOT_A_MEMBER' \| 'JOIN_FAILED' }` |

**الملف**: `src/sockets/domino.game.js`

| الحدث | الـ payload |
|---|---|
| `domino:room_state` | `{ ... }` |
| `domino:your_hand` | `{ hand: p.hand }` |
| `domino:error` | `{ message }` |

## 3.20 عقد استجابة Gemini (Server من AI)

**الملف**: `src/services/gemini.service.js:155-182`

```js
return {
  text: (res.text ?? '').trim(),
  tokensIn: usage.promptTokenCount ?? 0,
  tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  functionCalls: calls,   // [{ name, args }] — مستخرج من candidates
  model,
  latencyMs: Date.now() - started,
};
```

---

# المرحلة 4: AI Contracts (تفصيل لكل خدمة)

## 4.1 Dream Planner
| العنصر | القيمة |
|---|---|
| Prompt Input | `{ goal, answers:[{question, answer}] }` — dreamPlanner.service.js:68 |
| Prompt Output | `{steps:[{title, description}]}` أو `{questions:[{question, options[]}]}` |
| Expected JSON | `{"steps":[...]}` / `{"questions":[...]}` |
| Validation Layer | extractJson + `Array.isArray` + `length>=2` / `length>0` + تطبيع |
| Storage Layer | `prisma.goalStep.createMany` (journal.controller:227-238) |

## 4.2 Journey Planner
| العنصر | القيمة |
|---|---|
| Prompt Input | `{ dream, goal, instructions }` — journeyPlanner.service.js:48 |
| Prompt Output | `{days:[{day, title, description}]}` |
| Expected JSON | `{"days":[...]}` |
| Validation Layer | extractJson + تطبيع (day متسلسل، title غير فارغ) + `length>0` |
| Storage Layer | `prisma.journey.create` + `journeyDay.createMany` (transaction) |

## 4.3 Task Follow-up (اطمئنان)
| العنصر | القيمة |
|---|---|
| Prompt Input | persona `TASK_FOLLOWUP` + اسم الرفيق + المهمة — taskCheckIn.service.js:69-70 |
| Prompt Output | نص حر (سطران) — **ليس JSON** |
| Validation Layer | `ai?.text?.trim()` + fallback SYSTEM |
| Storage Layer | `prisma.notification.create` type `TASK_CHECKIN` |

## 4.4 Task Nudge (نكشة)
| العنصر | القيمة |
|---|---|
| Prompt Input | قواعد النكشة (نكشة + تذكير + نصيحة) + المهمة — taskNudge.service.js:43-44 |
| Prompt Output | نص حر |
| Validation Layer | fallback SYSTEM صادق |
| Storage Layer | `prisma.notification.create` type `TASK_REMINDER` |

## 4.5 Alarm Companion
| العنصر | القيمة |
|---|---|
| Prompt Input | (نداء الغفوة/السخرية) — في alarm module؛ البروف: `{a, t}` HMAC |
| Storage | `WakeLog` + `WakeChallenge` |

## 4.6 AI Pulse
| العنصر | القيمة |
|---|---|
| Snapshot Builder | `snapshotToPrompt(snap)` — aiPulse.service.js:293 |
| الـ payload | `{ user:{name, specialty, streak}, today:{tasksDone, focusMinutes}, state:{name:'IN_FOCUS', elapsedMin, plannedMin}, tasks:[{title, priority, scheduledEnd, steps, done}] }` |
| Storage | `AiPulse` + `AiPulseEvent` + `AiUsageLog` |

## 4.7 Context Builder (الذاكرة)
| العنصر | القيمة |
|---|---|
| Shape | `{ user, today:{tasksDone, focusMinutes, focusSessions, wokeOnTime, responseSec}, week:{...}, pending:[{title, priority, due}], activeSession, alarms:{active, list:[{time, days}]}, goal:{title, pledge, week, openWeek}, lastJournal:{week, reflection, mistakes}, notes }` — aiContext.service.js:215-260 |
| toPrompt | نص مسطّر — aiContext.service.js:274 |
| Local JSON Cycle | `{ tasks:[{title, priority, startTime, endTime, isCompleted}], alarms:[{time, label, isActive}] }` — ai.controller.js:347-358 |

## 4.8 Persona System
| العنصر | القيمة |
|---|---|
| Modes | COMPANION / ASSISTANT — aiPersona.service.js:48-58 |
| Moments | PROACTIVE_CHECKIN / CELEBRATE / TASK_FOLLOWUP / TASK_PRE_REMINDER / PULSE_REPLY — :108-131 |
| build() | `parts = [CORE, MODES[mode], MOMENTS[moment], contextText, canAct-كلاوس]` — :161 |
| Anti-hallucination | كلاوس "الأدوات = اقتراح، لا تنفيذ" — :172-190 |

## 4.9 Canary Security
| العنصر | القيمة |
|---|---|
| Canary | `CNRY-${randomBytes(6).hex.UPPER}` — aiSecurity.service.js:48 |
| الكشف | `text.includes(CANARY)` — :55 |
| التعقيم | `sanitize` (منع ```/tags) + `MAX_INPUT_CHARS=500` + `wrapUserInput` + `CONTAINMENT_CLAUSE` |

---

# المرحلة 5: Journey / Mountain Audit

| العقد | Input JSON | Output JSON | DB Mapping | Lifecycle |
|---|---|---|---|---|
| Goal (Dream) | `POST /goals/dream {title}` | `{ draftGoalId, questions:[...] }` | `Goal{draft:true}` | DRAFT → (approve) ACTIVE |
| Plan | `POST /answers {answers:[{question,answer}]}` | `{ plan:{ steps:[{title,description}] } }` | `GoalStep[]` (order 0→peak) | Steps على المسودة |
| Approve Dream | `POST /dream/:id/approve {}` | `{ goal:{id,title,isPrimary}, steps }` | `Goal{draft:false,isActive:true}` + `GoalWeek{OPEN}` | ACTIVE |
| Journey Gen | `POST /steps/:stepId/journey {}` | `{ journey:{id,status:'DRAFT'}, days:[...] }` | `Journey{DRAFT}` + `JourneyDay[]` | DRAFT |
| Journey Approve | `POST /steps/:stepId/journey/approve {}` | `{ journey:{status:'ACTIVE'}, generatedTasks }` | `Journey{ACTIVE,approvedAt}` + تواريخ الأيام + `Task` يوم 1 | ACTIVE |
| Journey Get | `GET /steps/:stepId/journey` | `{ journey:{..., progress:{completed,total,percent}, lateDays, days, tasks} }` | قراءة فقط | — |
| Task Complete | `PATCH /tasks/:id/complete` | `{ success, sparks, streak, mountain? }` | `Task` → `JourneyDay{COMPLETED}` → `Journey{COMPLETED}` → `GoalStep{isCompleted}` → `Goal{completedAt}` | التقدم |
| **Mastery** | — | — | — | **NOT FOUND** (قرار المالك: لا كويز — محذوف نهائياً) |
| **Rebuild** | — | — | — | **NOT FOUND** (مؤجل — غير موجود في الكود) |

---

# المرحلة 6: Events Audit

| الحدث | من يطلقه | الـ payload | يذهب إلى | بعده | AI؟ | Notification؟ | Queue؟ |
|---|---|---|---|---|---|---|---|
| TASK_COMPLETED | `completeTask` (task.controller) | `{taskId, userId, sparks, streak}` | DB + رد API | سلسلة الجبل + جدولة checkin | نعم (بعد 10د) | عبر checkin | `task-checkin` |
| TASK_REMINDER | `taskNudge` (worker) | `{taskId}` | DB | إشعار نكشة | نعم | نعم | `task-nudge` |
| JOURNEY_DAILY | scheduler (cron كل ساعتين) | `{}` | DB | توليد مهام اليوم | لا | لا (صامت) | `journey-daily` |
| PRESENCE | `chat.socket` | `{userId, isOnline}` | Socket | تحديث الحضور | لا | لا | لا |
| MESSAGE_READ | `chat.socket` | `{...}` | Socket | تحديث القراءة | لا | لا | لا |
| GAME_STATE | `snake.game` | `buildStatePacket(room)` | Socket | تحديث اللعبة | لا | لا | لا |
| PULSE_SWEEP | `aiPulse` (كل 10د) | `{}` | DB + AI | فحص المستحقين | نعم | نعم (PULSE_STARTING) | `ai-pulse` |
| ALARM_FIRED | alarm module | `{alarmId}` | DB | WakeChallenge + WakeLog | نعم | نعم | لا |
| FOCUS_DONE | focus module | `{sessionId, verifiedMin}` | DB | Sparks + Analytics | لا | لا | لا |
| MAINTENANCE_REAP | `orphanReaper` (4ص يومياً) | `{}` | DB | تنظيف اليتامى | لا | لا | `maintenance` |

---

# المرحلة 7: Notifications Audit

| النوع (enum) | المنشئ | طريقة الإرسال | مصدر البيانات | علاقة AI |
|---|---|---|---|---|
| `TASK_REMINDER` | taskNudge | Queue → Worker → DB + FCM | مهمة مجدولة | نعم (نكشة) |
| `TASK_CHECKIN` | taskCheckIn (جديد) | Queue → Worker → DB + FCM | مهمة مكتملة | نعم (اطمئنان) |
| `TASK_OVERDUE` | (مذكور في enum + channels) | FCM | مهام متأخرة | لا |
| `PULSE_STARTING` | aiPulse | DB + FCM | جدول نبضات | نعم |
| `PULSE_RESERVED` | aiPulse | DB | حجز نبضة | نعم |
| `AI_PROACTIVE` | aiSweeper/proactive | DB + FCM | سياق المستخدم | نعم |
| `FOCUS_CHALLENGE` | challenge module | DB + FCM | تحدي عشيرة | لا |
| `ACHIEVEMENT_UNLOCKED` | achievement.service | DB | قواعد الأوسمة | لا |
| `CLAN_MESSAGE` | chat/بث عشيرة | DB + FCM | رسائل العشيرة | لا |
| `DIRECT_MESSAGE` | chat | DB + FCM | رسائل مباشرة | لا |
| `MESSAGE_REQUEST` | friendship | DB + FCM | طلب صداقة | لا |
| `ENCOURAGEMENT` | social | DB | تشجيع | لا |
| `ALARM` | alarm | DB + FCM (قناة HIGH) | منبه | نعم (غفوة) |
| `SYSTEM` | عام | DB | نظام | لا |

**Channel Mapping** (pushDispatcher): ALARM → قناة منبه · TASK_OVERDUE/PreReminder → قناة مهام · DIRECT/CLAN → قناة شات · الباقي → DEFAULT.

---

# المرحلة 8: Final System Map

```
Client (Flutter/Web)
  │  req.body (92 موضع) — JSON من العميل
  ▼
API Layer (Express 5 — 20 router)
  │  التحقق المخصص: utils/validate.js (requireString/Int/Enum/Date/Array/Bool) — لا Zod
  │  المصادقة: authenticateToken → req.user.userId
  ▼
Service Layer (32 service)
  │  JSON.stringify (طلبات) / JSON.parse (استجابات)
  ▼
AI Layer (Gemini — gemini.service.js)
  │  systemInstruction (persona.build + CONTAINMENT + canary)
  │  prompt (JSON.stringify)
  │  response { text, tokensIn, tokensOut, functionCalls, model, latencyMs }
  │  extractJson (فك JSON من النص — يتحمل ```json)
  │  Validation صارم (Array.isArray + أطوال + تطبيع)
  ▼
Database (PostgreSQL 17 — Prisma — 64 جدول)
  │  Goal → GoalStep → Journey → JourneyDay → Task (سلسلة الجبل)
  │  Task.source / journeyDayId / goalStepId (الربط)
  │  Notification (14 نوع)
  ▼
Queue Layer (BullMQ — Redis)
  │  ai-pulse (10د) · maintenance (4ص) · notification · task-nudge · task-checkin (10د مؤجل) · journey-daily (كل ساعتين)
  │  payloads: { taskId } · { notificationId, userId, title, body, type, data }
  ▼
Worker → DB / FCM / AI (نداءات مؤجلة)
  │
Socket Layer (Socket.io — Redis Adapter)
  │  chat (presence/typing/read) · snake (game_state_update/player_*) · domino (room_state/your_hand)
  │
Notification Layer → DB + FCM (pushDispatcher — قنوات حسب النوع)
```

**الملخص النهائي**: كل الـ JSON في النظام من 3 أسر: (1) **عقود AI المنظمة** (questions/steps/days — تُستخرج وتُتحقق وتُخزن)، (2) **عقود REST** (184 res.json مقابل 92 req.body)، (3) **عقود البنية التحتية** (Redis cache/idempotency + BullMQ payloads + Socket events + FCM). لا Zod، لا DTO classes، لا Webhooks (`NOT FOUND`)، لا Mastery/Rebuild (محذوف/مؤجل بقرار المالك).
