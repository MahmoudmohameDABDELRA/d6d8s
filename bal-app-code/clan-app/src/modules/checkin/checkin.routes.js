/**
 * ═══════════════════════════════════════════════════════════
 *  Task Check-In Routes
 *
 *  مسار واحد: POST /api/task-checkin
 *  (يُركَّب على `/api` في app.js — كامل المسار /api/task-checkin)
 *
 *  التحكم في المعدل: حد كريم (30/دقيقة/IP) لأن الطلب بيصرف
 *  توكناً من Gemini — ليه قيمته نحميه من الحرق.
 * ═══════════════════════════════════════════════════════════
 */
import express from 'express';
import rateLimit from 'express-rate-limit';

import { taskCheckin } from './checkin.controller.js';

const router = express.Router();

const checkinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'طلبات كثيرة جداً — حاول بعد دقيقة' },
});

router.post('/task-checkin', checkinLimiter, taskCheckin);

export default router;
