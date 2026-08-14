import express from 'express';

import {
  confirmPhotoProof,
  createAlarm,
  createChallenge,
  deleteAlarm,
  getScoreboard,
  getWakeHistory,
  getWakeTask,
  joinChallenge,
  leaveChallenge,
  listAlarms,
  listChallenges,
  reportMissed,
  requestWakeProof,
  snoozeAlarm,
  solveWakeTask,
  updateAlarm,
} from './alarm.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── المنبهات ──
router.get('/', listAlarms);
router.post('/', createAlarm);

// ── الرنين ──
router.get('/wake-task', getWakeTask);
router.post('/wake-task/solve', solveWakeTask);
router.post('/missed', reportMissed);

// ── المنبه الذكي (رؤية «بال») — منبه واحد، مسارات نظيفة ──
router.post('/snooze', snoozeAlarm);           // غفوة → نداء AI حقيقي
router.post('/verify-wake', requestWakeProof); // إثبات عشوائي (مسألة/تصوير)
router.post('/wake-log', confirmPhotoProof);   // تسجيل الاستيقاظ بعد الإثبات

// ── السجل ──
router.get('/history', getWakeHistory);

// ── التحديات ──
router.get('/challenges', listChallenges);
router.post('/challenges', createChallenge);
router.get('/challenges/:id/scoreboard', getScoreboard);
router.post('/challenges/:id/join', joinChallenge);
router.delete('/challenges/:id/leave', leaveChallenge);

// ── المتغيّرة آخراً حتى لا تبتلع الثابتة ──
router.patch('/:id', updateAlarm);
router.delete('/:id', deleteAlarm);

export default router;
