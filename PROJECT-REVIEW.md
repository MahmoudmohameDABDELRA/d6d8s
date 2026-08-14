# 🔍 فحص المشروع الكبير — «بال» (Clan App)

> المسار: `bal-app-code/clan-app/` — 561 ملف، 432 بعد الفك
> الفرع: `arena/01a000e4-d6d8s` — تاريخ الفحص: 2026-08-14

> **📌 تحديث (2026-08-14):** بعد الفحص تم تنفيذ التكامل الكامل —
> `checkin-backend` المنفصل اندمج في clan-app كوحدة `src/modules/checkin/`
> (`POST /api/task-checkin` بـ Gemini + TASK_FOLLOWUP + aiGuard + سجل Redis)،
> و`focus_app` اتوصّل بالباكند (رابط حقيقي + زرار الجلسة اشتغل + بوكس check-in
> بعد نهاية الجلسة)، واتشال السيرفيس المنفصل. التفاصيل في [README.md](README.md).

---

## 1️⃣ إيه هو المشروع؟

تطبيق **إنتاجية اجتماعي بيشتغل بالذكاء الاصطناعي**، الفكرة إنه **"رفيق" مش أداة مملة** (زي ما موصوف في `docs/core/00-رؤية-بال.md` — مواصفات العميل الرسمية بتاريخ 12 أغسطس 2026).

**الشاشة الرئيسية: "جبل الأهداف" 🏔️**
- جبل متحرك فيه مسار بيبدأ من تحت ويوصل لقمة فيها علم
- المستخدم يكتب هدفه (مثال: "عاوز أكون CEO")
- الـ AI يسأله أسئلة كويز، يطلع خطة، ويملّي الجبل بالخطوات من تحت للقمة

**الميزات الأساسية:** محادثات 1-1 + عشائر (جروبات)، بروفايلات وطلبات صداقة، مهام وروتين، جلسات تركيز (Pomodoro + جلسات جماعية)، منبه بيخترق الصامت، ألعاب (ثعبان + دومينو) في الوقت الحقيقي، جورنال، أهداف أسبوعية، إنجازات وألقاب، إحالات واشتراكات.

---

## 2️⃣ البنية المعمارية (Full Stack)

```
┌─────────────────────────────────────────────────────────┐
│  📱 Flutter App (bal_app)      🖥️ React Web (مسودة)     │
│  Android + iOS                                          │
└──────────────┬──────────────────────────────────────────┘
               │ REST + WebSocket (Socket.io)
┌──────────────▼──────────────────────────────────────────┐
│  🟢 API Server (Express 5) — منفذ 3000                  │
│  Socket.io على نفس المنفذ + Redis Adapter (توسّع أفقي)    │
├─────────────────────────────────────────────────────────┤
│  🎮 Game Server (منفصل) — منفذ 3001                     │
│  حلقة الثعبان 30FPS + الفيزكس (عشان ميجمّدش الـ API)      │
├─────────────────────────────────────────────────────────┤
│  ⚙️ Worker (BullMQ منفصل) — نبض، إشعارات، صيانة...       │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│  🐘 PostgreSQL 17 (Prisma)      🔴 Redis 7 (كاش + طوابير)│
│  + PgBouncer (تجميع اتصالات لـ 10,000 مستخدم)             │
└─────────────────────────────────────────────────────────┘
```

### الخدمات الستة في `docker-compose.yml`:
| الخدمة | الدور |
|---|---|
| `postgres` | PostgreSQL 17 مع تخزين دائم + تهيئة partitioning عند أول إقلاع |
| `pgbouncer` | مجمع اتصالات Transaction Mode — لخدمة 10,000 مستخدم |
| `redis` | كاش + أصفاد الغرف الموزعة + Pub/Sub للسوكت + طوابير BullMQ |
| `api` | REST API الرئيسي (منفذ 3000) |
| `game-server` | الألعاب التنافسية والسوكت المنفصل (منفذ 3001) |
| `worker` | BullMQ Worker للمهام الخلفية |

### أمان وبنية تشغيلية ناضجة:
- ✅ Dockerfile متعدد المراحل + مستخدم غير root + healthcheck + `dumb-init`
- ✅ إغلاق آمن (graceful shutdown) بمعالجة SIGINT/SIGTERM + مهلة إجبارية
- ✅ helmet + rate limiting + CORS + JWT access/refresh منفصلين + argon2
- ✅ تسجيل منظم بـ pino + metrics بـ prom-client
- ✅ فحص قوة الأسرار في الإنتاج (يرفض `CHANGE_THIS` وأقل من 32 حرف)

---

## 3️⃣ قاعدة البيانات — 66 Model

`prisma/schema.prisma` (2127 سطر) + 3 migrations (آخرهم declarative partitioning + partial indexes):

| المجال | الموديلات |
|---|---|
| **المستخدمون والمصادقة** | User, RefreshToken, Device |
| **اجتماعي** | Clan, ClanMember, ClanBan, ClanInvite, Friendship, Follow, Conversation, ConversationParticipant, Message, MessageRequest, BlockedUser, MutedUser, UserReport |
| **المهام والأهداف** | Task, TaskStep, TaskHistory, Goal, GoalWeek, GoalStep, Journey, JourneyDay |
| **التركيز** | PulseSession, PulseReservation, FocusCheck, FocusSession, WakeChallenge, BattleAlarm, FocusChallenge |
| **الألعاب** | GameRoom, GameRoomPlayer, DrawingSketch |
| **التحفيز** | Achievement, UserAchievement, Title, UserTitle, SparkTransaction |
| **الذكاء الاصطناعي** | AiConversation, AiMessage, AiUsageLog, AiPulse, AiPulseEvent, AiContextSync |
| **المحتوى** | JournalEntry, Note, DailyInsightItem, DailyInsightLog, DailyMoodLog |
| **الدفع والإحالات** | Subscription, Payment, Video, VideoPurchase, AudioTrack, AudioPurchase, Referral |
| **تشغيلي** | Notification, MarketingCampaign, OperationalExpense |

---

## 4️⃣ طبقة الذكاء الاصطناعي (الأقوى في المشروع)

- **`gemini.service.js`** — جسر Gemini الوحيد مع **سلسلة نماذج بالترتيب**: `gemini-3-flash-preview → gemini-2.5-flash → gemini-3.1-flash-lite` (لو نفدت حصة واحد، ينتقل للتالي — درس من الإنتاج)، مع كاش ساعة كاملة للنماذج المستنفدة، وتعطيل التفكير (thinking) لتوفير ~90% من التكلفة.
- **`aiGuard.service.js`** — "حارس المرافق": فحص المدخل قبل النداء والمخرج بعده، بترتيب سلامة مقصود: **أزمة ← حقن ← طول**. (الرسالة الطويلة اللي فيها أزمة تتعالج كأزمة مش تترفض كـ"طويلة").
- **`aiSecurity.service.js`** — أمان وحقن البرومبت.
- **`aiPersona.service.js`** — شخصية الرفيق (المستخدم بيسمّي الـ AI، زي «ليكم»).
- **`aiPulse.service.js` / `pulseTemplates.js`** — رسائل النبض الدورية.
- **`aiSweeper.service.js` / `aiContext.service.js`** — كنس وسياق المحادثات.
- **قياسات تكلفة موثقة في الكود** بجداول مقارنة النماذج.

---

## 5️⃣ الوحدات (21 Module في `src/modules/`)

`auth` · `clan` · `focus` (فيها challenges) · `task` · `achievement` · `alarm` · `chat` · `game` · `video` · `journal` · `note` · `ai` · `admin` · `notification` · `audio` · `referral` · `insight` · `human` · `analytics` · `social` (فيها friends)

كل module بنمط MVC: `routes` + `controller` (+ service في `src/services/` — 35 خدمة).

**الطوابيق (`src/queues/`):** PULSE, MAINTENANCE, NOTIFICATION, TASK_NUDGE, TASK_CHECKIN, JOURNEY_DAILY — بتزامن مقصود (1 للنبض عشان مفيش مسوح متداخلة، 5 للإشعارات).

**السوكت (`src/sockets/`):** chat + snake + domino + roomOwnership (ملكية الغرفة بقفل Redis منفصل — توزيع الرسائل مش الحلقة).

---

## 6️⃣ التطبيقات

| التطبيق | الحالة |
|---|---|
| **`bal_app/`** (Flutter) | التطبيق الفعلي — شاشات: Auth Gate، Interest (التعارف)، الجبل الرئيسي، المهام، المحادثات، التركيز، البروفايل. ويستخدم `dio` + `provider` + `shared_preferences` + نظام ألوان وتصميم مخصوص |
| **`web/`** (React + Vite + TS) | **مسودة** — لسه على قالب Vite الافتراضي (عداد "Get started") + component وحيد `search-modal.tsx` |
| **`mobile-alarm/`** | سكربتات PowerShell بتثبّت منبه Kotlin/Swift بيخترق الصامت وعدم الإزعاج في مشروع React Native خارجي |

---

## 7️⃣ الاختبارات — 49 ملف

شاملة جدًا: auth (Google mock)، مهام، تركيز، عشائر وتحديات، ألعاب (فيديو + دومينو)، جورنال، إشعارات، AI + قواعد AI، scale test، partitioning، إحالات، إحصاءات، ألقاب، بلوكات، تقارير، نمو، تكامل، واختبارات live (مسح muscular-cohesion). في `package.json` 30+ سكربت test جاهز.

---

## 8️⃣ ملاحظات وملاحظات أمان ⚠️

| # | الملاحظة | الخطورة |
|---|---|---|
| 1 | **`GEMINI_API_KEY` في `.env` شكلها مفتاح حقيقي (55 حرف)** — وكانت جوه الـ zip المرفوع على GitHub، يعني **محفوظة في تاريخ الـ repo للأبد**. حتى لو مش مستخدمة في الإنتاج، الأفضل **تعمل rotate للمفتاح** في Google AI Studio | 🔴 عالية |
| 2 | `JWT_ACCESS_SECRET` و `JWT_REFRESH_SECRET` في `.env` قيم placeholder (`CHANGE_THIS...`) — اللي هو جيد، بس تأكد إن القيم الحقيقية في الإنتاج مختلفة | 🟡 متوسطة |
| 3 | **CORS مفتوح فعليًا**: كود `app.js` بيرجّع `callback(null, true)` في الحالتين (السماح والرفض) — يعني أي origin يعدي. لو الـ API ليه واجهة ويب، يفضّل تقفيله | 🟡 متوسطة |
| 4 | `MONGO_URI` مازال في `.env.example` مع إن الكود مش بيستخدم MongoDB (الرسائل اتنقلت PostgreSQL) | ⚪ منخفضة |
| 5 | `web/` لسه قالب Vite افتراضي — الـ frontend الحقيقي هو Flutter بس | ℹ️ معلومة |
| 6 | منبه "بيخترق الصامت وعدم الإزعاج" — ممكن يخالف سياسات متاجر التطبيقات لو نزل فعليًا | ℹ️ معلومة |
| 7 | `docs/core/` فيه 20+ وثيقة عربية معمقة (دستور معماري، قرارات، خطط) — مرجع قوي لأي مطور جديد | ✅ إيجابي |

---

## 9️⃣ الخلاصة

مشروع **طموح جدًا ومكتوب بعناية**: معماريًا مدروس (فصل الـ worker والألعاب، توسّع أفقي بـ Redis adapter، partitioning لقاعدة البيانات)، أمان متقدم (هيدرات، rate limit، أسرار منفصلة، إغلاق آمن)، وأفكار ميزات مميزة (جبل الأهداف، الرفيق المسمّى، المنبه الخارق). نقطة الضعف الأكيدة هي **مفتاح Gemini المرفوع في تاريخ الـ repo** — محتاج rotate، والـ web app لسه مسودة.

**أقدر أكمّل بـ:**
- تشغيل الباكند محليًا (Postgres + Redis) وتجربة الاختبارات
- مراجعة أعمق لوحدة معينة (مثلاً AI أو العشائر)
- تثبيت الـ Flutter app وتجربته
- كتابة README شامل للمستودع
