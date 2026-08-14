import express from 'express';
import {
  activateShield,
  checkInMood,
  getEntryState,
  getWelcomeBackHero,
  ventAndBurn,
} from './human.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ════════════════════════════════════════════════
//  المحرك الإنساني وموجه حالة الدخول الذكي
// ════════════════════════════════════════════════

router.get('/app-entry-state', getEntryState);
router.post('/shield', activateShield);
router.post('/mood', checkInMood);
router.post('/vent', ventAndBurn);
router.get('/welcome-back', getWelcomeBackHero);

export default router;
