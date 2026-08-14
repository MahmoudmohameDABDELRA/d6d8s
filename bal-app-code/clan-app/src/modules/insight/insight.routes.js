import express from 'express';
import {
  createAdminInsight,
  deleteAdminInsight,
  getMyInsightHistory,
  getTodayInsight,
  getTodayInsightStatus,
  listAdminInsights,
} from './insight.controller.js';
import {
  authenticateToken,
  requireAdmin,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ════════════════════════════════════════════════
//  الزر العائم لمعلومة اليوم (مرة واحدة كل 24 ساعة)
// ════════════════════════════════════════════════

router.post('/today', getTodayInsight);
router.get('/status', getTodayInsightStatus);
router.get('/history', getMyInsightHistory);

// ════════════════════════════════════════════════
//  إدارة خزانة المعلومات (Admins Only)
// ════════════════════════════════════════════════

router.post('/admin/items', requireAdmin, createAdminInsight);
router.get('/admin/items', requireAdmin, listAdminInsights);
router.delete('/admin/items/:id', requireAdmin, deleteAdminInsight);

export default router;
