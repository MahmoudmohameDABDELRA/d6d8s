# جلسة تركيز — Focus App (Flutter)

تطبيق **بومودورو** لتسجيل جلسات التركيز، بواجهة عربية (RTL) وتصميم مطابق
لشاشات «بال». كان جزءًا من حزمة `files.zip` المنفصلة، وبعد التظبيط بقى
**موصولًا بالباكند الكبير `clan-app`** عبر endpoint الـ Task Check-In.

## الترابط مع باقي المشروع

```
focus_app (Flutter)
   │  POST /api/task-checkin   (header: x-app-secret)
   ▼
clan-app (Express + Gemini)
   │  شخصية TASK_FOLLOWUP + حارس aiGuard + سجل Redis
   ▼
رد الـ AI بيتعرض للمستخدم في بوكس «رد رفيقك 🎉»
```

- **مين بيكلم مين:** التطبيق مش بيكلم مزوّد الـ AI مباشرة — الباكند هو اللي
  بيمسك مفتاح Gemini ويبني الرد. `checkin_service.dart` بيبعت المهمة + رد
  المستخدم، وياخد `{ reply }` راجع.
- **السر المشترك:** الـ backend بيتحقق من هيدر `x-app-secret` اللي بيتطابق
  `APP_SHARED_SECRET` في `.env` بتاع الباكند. التطبيق بيحمله وقت البناء:
  ```
  flutter run --dart-define=APP_SHARED_SECRET=your-long-random-string \
              --dart-define=API_BASE_URL=http://10.0.2.2:3000
  ```
  (`API_BASE_URL` الافتراضي هو `http://10.0.2.2:3000` — عنوان الـ host من
  محاكي أندرويد؛ على جهاز حقيقي حط IP جهازك على نفس الشبكة).

## التشغيل

```bash
flutter pub get
flutter run
```

من شاشة الإعدادات: ظبط المدة → **ابدأ جلسة فردية** (بعدّاد حقيقي دلوقتي)
→ لما العدّاد يخلص، بيظهر سؤال **«عملت إيه في المهمة؟»** → الرد بيروح
للباكند وبيظهر رد الرفيق.

## ملاحظة

قبل التظبيط كان فيه سيرفيس `checkin-backend` مستقل (CommonJS + Anthropic)
والرابط في التطبيق كان وهمي (`https://api.yourapp.com`). اتشال السيرفيس
واتدمجت فكرته في `clan-app` كـ `POST /api/task-checkin` — نفس التدفق:
validate ← history ← prompt ← AI ← store ← `{ reply }`.
