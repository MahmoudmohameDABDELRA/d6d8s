# Task Check-in Backend

Small standalone Express service. It receives a task + the user's typed
reply from the Flutter app, asks the AI for a short reply, and returns
it — the app's AI key stays here on the server, never inside the app.

If you already have your own backend, don't run this as a separate
service — copy `src/services/promptBuilder.js` and `src/services/aiClient.js`
into your existing project and add one route that does what
`src/routes/checkin.js` does. The important part isn't the Express
scaffolding, it's the flow: validate input → load prior history → build
prompt → call AI → store the exchange → return `{ reply }`.

## Setup

```bash
cp .env.example .env
# fill in AI_API_KEY and APP_SHARED_SECRET
npm install
npm start
```

Server starts on `http://localhost:3000` (or `PORT` from `.env`).

## Endpoint

`POST /api/task-checkin`

Headers:
```
Content-Type: application/json
x-app-secret: <same value as APP_SHARED_SECRET in .env>
```

Request body:
```json
{
  "user_id": "user_123",
  "task": {
    "id": "task_456",
    "title": "رحلة تعلم Dart - اليوم 2",
    "scheduled_time": "2026-08-14T14:00:00.000Z",
    "duration_minutes": 30,
    "is_done": true
  },
  "user_reply": "خلصت الدرس بس اتأخرت شوية"
}
```

Response `200`:
```json
{ "reply": "تمام إنك خلصتها ولو اتأخرت، المهم إنك ماسك في السلسلة. بكرة يلا نحاول نبدأ بدري." }
```

Error responses: `400` (bad input), `401` (missing/wrong `x-app-secret`),
`502` (the AI call itself failed).

## What to change before production

- **`APP_SHARED_SECRET`** — set a long random value, and keep it only in
  the app's build config, not in source control.
- **`historyStore.js`** — replace the in-memory Map with your real
  database so history survives a server restart and works across
  multiple instances. The two functions (`getHistory`, `appendExchange`)
  are the only integration points.
- **CORS** — `cors()` currently allows any origin; restrict it if this
  service is also reachable from a browser.
- **Logging/monitoring** — the `catch` block in `checkin.js` only logs
  to console; wire it into whatever logging you already use.
