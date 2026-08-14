import express from 'express';

import {
  equipMythicTitle,
  getHallOfFame,
  getMyStats,
  listAchievements,
  listMythicTitles,
  recalculate,
  setShowcase,
  unequipMythicTitle,
} from './achievement.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── الأوسمة التقليدية ──
router.get('/', listAchievements);
router.put('/showcase', setShowcase);
router.post('/recalculate', recalculate);

// ── الألقاب الأسطورية الثلاثة النادرة وهيبة الدخول ──
router.get('/titles', listMythicTitles);
router.post('/titles/:titleId/equip', equipMythicTitle);
router.post('/titles/unequip', unequipMythicTitle);
router.get('/hall-of-fame', getHallOfFame);

export default router;
