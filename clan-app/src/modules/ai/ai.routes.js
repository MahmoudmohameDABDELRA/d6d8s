import express from 'express';

import {
  deleteConversation,
  dismissPulse,
  firePulse,
  replyToPulse,
  syncContext,
  getConversation,
  getMomentMessage,
  getPulseStatus,
  getSnapshot,
  getStatus,
  listConversations,
  sendMessage,
  streamMessage,
} from './ai.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// الثابتة قبل المتغيّرة حتى لا يبتلعها :id
router.get('/status', getStatus);
router.post('/moment', getMomentMessage);

/**
 * ملف الحالة — المهام والمنبهات ومحتوياتها.
 * قراءة خالصة، لا تستهلك حصّة.
 */
router.get('/snapshot', getSnapshot);

// ── النبض الاستباقي ──
router.get('/pulse/status', getPulseStatus);
router.post('/pulse', firePulse);
router.post('/pulse/:id/dismiss', dismissPulse);
/** "رد" — النداء الوحيد الذي يكلّف توكناً في مسار النبض */
router.post('/pulse/:id/reply', replyToPulse);

/** دورة تسليم السياق كل 6 ساعات — صفر توكن */
router.post('/context/sync', syncContext);

router.get('/conversations', listConversations);
router.post('/message', sendMessage);
router.post('/message/stream', streamMessage);

router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
