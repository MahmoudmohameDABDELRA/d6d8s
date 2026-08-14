# 📁 هيكل مجلدات مساحة العمل — d6d8s

> تم التوليد من الهيكل الفعلي للمستودع (الفرع: `arena/01a000e4-d6d8s`)

```
.
|-- bal-app-code
|   `-- clan-app
|       |-- backups
|       |-- bal_app
|       |-- deploy
|       |-- docs
|       |-- mobile-alarm
|       |-- prisma
|       |-- scripts
|       |-- src
|       |-- test
|       |-- web
|       |-- .dockerignore
|       |-- .env
|       |-- .env.example
|       |-- .gitignore
|       |-- Dockerfile
|       |-- docker-compose.yml
|       |-- loadtest.mjs
|       |-- mem-test.mjs
|       |-- package-lock.json
|       |-- package.json
|       `-- scale-test.mjs
|-- files
|   `-- focus_app
|       |-- functions
|       |-- lib
|       |-- README.md
|       `-- pubspec.yaml
|-- .gitignore
|-- PROJECT-REVIEW.md
|-- README.md
`-- STRUCTURE.md

17 directories, 17 files
```

## 📦 ملخص المشاريع

| المسار | المشروع | التقنيات |
|---|---|---|
| `bal-app-code/clan-app` | تطبيق شامل (Backend + Flutter + Web) | Node.js, Express, Prisma, Flutter, React, Vite, TS |
| `files/focus_app` | جلسة تركيز Pomodoro — موصولة بـ clan-app | Flutter, Dart |
