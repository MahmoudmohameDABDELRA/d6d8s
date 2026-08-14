import express from 'express';
import {
  applyReferralCode,
  getMyReferralStats,
} from './referral.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ════════════════════════════════════════════════
//  مسارات نظام الإحالة والمكافآت
// ════════════════════════════════════════════════

router.get('/stats', getMyReferralStats);
router.post('/apply', applyReferralCode);

export default router;
