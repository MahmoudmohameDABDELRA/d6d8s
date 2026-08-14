import express from 'express';

import {
  answerCheck,
  cancelSession,
  completeSession,
  getActiveSession,
  getEmergencyStatus,
  getHistory,
  getStats,
  reportViolation,
  requestCheck,
  startSession,
  useEmergency,
} from './focus.controller.js';
import {
  acceptChallenge,
  createChallenge,
  declineChallenge,
  getChallenge,
  leaveChallenge,
  startChallenge,
} from './challenge.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// المسارات الثابتة قبل المتغيّرة حتى لا يبتلعها :id
router.get('/active', getActiveSession);

// ── التحدي الجماعي (رؤية «بال») — قبل :id حتى لا يبتلعها ──
router.post('/challenge', createChallenge);
router.get('/challenge/:id', getChallenge);
router.post('/challenge/:id/accept', acceptChallenge);
router.post('/challenge/:id/decline', declineChallenge);
router.post('/challenge/:id/leave', leaveChallenge);
router.post('/challenge/:id/start', startChallenge);
router.get('/history', getHistory);
router.get('/stats', getStats);
router.get('/emergency', getEmergencyStatus);

router.post('/start', startSession);
router.post('/:id/complete', completeSession);
router.post('/:id/cancel', cancelSession);
router.post('/:id/violation', reportViolation);

// ── كشف الساهي ──
router.post('/:id/check', requestCheck);
router.post('/check/:checkId/answer', answerCheck);
router.post('/:id/emergency', useEmergency);

export default router;
