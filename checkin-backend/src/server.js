require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const checkinRoute = require('./routes/checkin');

const app = express();

app.use(express.json({ limit: '50kb' }));
app.use(cors()); // tighten to your app's actual origin(s) in production

// Basic protection against someone hammering your AI bill.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 check-ins per minute per IP is generous for this use case
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Shared-secret gate: the Flutter app sends this header on every request.
// It is NOT the AI provider's key - it just proves the request came from
// your own app build, not a random script hitting your endpoint.
app.use((req, res, next) => {
  const provided = req.header('x-app-secret');
  if (!process.env.APP_SHARED_SECRET) {
    return next(); // no secret configured yet - allow through in dev
  }
  if (provided !== process.env.APP_SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.use('/api', checkinRoute);

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`task-checkin backend listening on port ${PORT}`);
});
