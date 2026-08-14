# d6d8s — منصة «بال» (Monorepo)

مستودع منصة **«بال»** — رفيق إنتاجية ذكي (Companion) مبني على الرؤية في
[`docs/core/00-رؤية-بال.md`](bal-app-code/clan-app/docs/core/00-رؤية-بال.md):
مش أداة مملة، رفيق بيعرفك، بيساعدك توصل لقمة جبل أهدافك 🏔️.

---

## 📁 البنية

```
d6d8s/
├── bal-app-code/
│   └── clan-app/            ← المشروع الرئيسي (Full Stack)
│       ├── src/             ← Backend: Express 5 + Prisma + Redis + Socket.io
│       │   ├── modules/     ← 22 وحدة (منها checkin — مدمج حديثًا)
│       │   ├── services/    ← 36 خدمة (Gemini، aiGuard، checkinHistory...)
│       │   ├── queues/      ← BullMQ (نبض، إشعارات، check-in، رحلات...)
│       │   ├── sockets/     ← شات + ألعاب (ثعبان/دومينو) + ملكية الغرف
│       │   └── config/      ← env، db، redis، aiRules، logger، metrics
│       ├── bal_app/         ← تطبيق Flutter الرسمي (Android/iOS)
│       ├── web/             ← واجهة React (قالب Vite — لسه تحت التطوير)
│       ├── prisma/          ← 66 موديل + migrations (partitioning)
│       ├── test/            ← 49 ملف اختبار
│       └── docs/            ← رؤية «بال» + دساتير + قرارات (عربي)
└── files/
    └── focus_app/           ← تطبيق بومودورو Flutter — موصول بـ clan-app
        └── lib/             ← شاشات + widgets + checkin_service
```

## 🔗 إزاي القطع مترابطة (بعد التظبيط)

```
┌─────────────── bal_app (Flutter) ───────────────┐
│  JWT + REST + Socket  →  /api/*                 │
└──────────────────────┬──────────────────────────┘
┌─────────────── focus_app (Flutter) ─────────────┐
│  POST /api/task-checkin  (x-app-secret)         │
└──────────────────────┬──────────────────────────┘
                       ▼
        ┌─────────────────────────────┐
        │  clan-app (Express + Gemini)│
        │  /api/*  + /api/task-checkin│
        └──────┬──────────────┬───────┘
               ▼              ▼
        PostgreSQL 17     Redis 7 (كاش + طوابير + سجل check-in)
        (Prisma + PgBouncer)
```

| القطعة | بتكلم مع مين | إزاي |
|---|---|---|
| `bal_app` (Flutter) | `clan-app` REST + Socket | JWT Bearer، Dio، endpoints في `api_endpoints.dart` |
| `focus_app` (Flutter) | `clan-app` `POST /api/task-checkin` | هيدر `x-app-secret`، `checkin_service.dart` |
| `web/` (React) | (قيد التطوير — قالب Vite حاليًا) | — |
| `clan-app` | PostgreSQL عبر Prisma، Redis، Gemini | `src/config/*` |

> قبل التظبيط كان في سيرفيس `checkin-backend` مستقل (CommonJS + Anthropic)
> والتطبيق كان شايل رابط وهمي. **اتدمج** في `clan-app` كوحدة `src/modules/checkin/`
> بنفس البنية (Gemini + شخصية TASK_FOLLOWUP + حارس aiGuard + سجل Redis)،
> واتشال السيرفيس المنفصل — فكرة وحدة واحدة لكل شيء.

## 🚀 تشغيل الباكند

```bash
cd bal-app-code/clan-app
cp .env.example .env        # وعبي القيم (DATABASE_URL, REDIS_URL, JWT...)
npm install
npm run prisma:generate
docker compose -f docker-compose.dev.yml up -d   # postgres + redis
npm run dev                 # أو node src/server.js
```

- REST API على `:3000` (Socket.io على نفس المنفذ)
- خادم الألعاب على `:3001` (`npm run game:server`)
- العامل الخلفي (`npm run worker`) — طوابير BullMQ
- الاختبارات: `npm test` (أو `npm run test:ai` لاختبار AI لوحده)

### إعدادات Task Check-In (الجديدة)
1. في `.env` بتاع clan-app: `APP_SHARED_SECRET="<قيمة عشوائية طويلة>"`
2. في focus_app شغّله بـ:
   ```
   flutter run --dart-define=APP_SHARED_SECRET=<نفس القيمة> --dart-define=API_BASE_URL=http://10.0.2.2:3000
   ```

## 🧪 الاختبارات

```bash
cd bal-app-code/clan-app
npm test                    # السلسلة الكاملة (AI_LIMITS_RELAXED=1)
npm run test:ai             # وحدة AI
npm run test:chat           # الشات
npm run test:scale          # اختبار الحجم (scale)
```

## 📚 التوثيق

- **رؤية «بال»**: `bal-app-code/clan-app/docs/core/00-رؤية-بال.md`
- **الدستور المعماري**: `docs/core/الدستور-المعماري-الشامل-والنهائي-للتطبيق-الحي.md`
- **التقرير الشامل**: `docs/core/التقرير-الشامل-النهائي.md`
- **مرجع الشاشات**: `docs/reference/*`

## ⚠️ أمان

- `.env` مستبعد من Git (فيه `GEMINI_API_KEY` شكلها مفتاح حقيقي — لو اتعرض
  قبل كده في الـ zip التاريخي، **اعمل rotate له** من Google AI Studio)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` لازم يكونوا عشوائيين 32+ حرفًا
  ومختلفين عن بعض (الـ backend بيرفض غير كده في production)
- `APP_SHARED_SECRET` لهوية التطبيق — مش سر إنتاج، بس لسه محتاج قيمة عشوائية
