import express from 'express';

import {
  completeOnboarding,
  getProfile,
  googleAuth,
  login,
  logout,
  refresh,
  register,
  setCompanionName,
} from './auth.controller.js';
import env from '../../config/env.js';
import { getMyStats } from '../achievement/achievement.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';
import { scoped } from '../../config/logger.js';

const log = scoped('auth');

const router = express.Router();

// ════════════════════════════════════════════════
//  المسار الأساسي — جوجل
// ════════════════════════════════════════════════

router.post('/google', googleAuth);

// ════════════════════════════════════════════════
//  مسار البريد وكلمة المرور — احتياطي معطَّل
// ════════════════════════════════════════════════

/**
 * ️ الكود موجود وكامل في الكنترولر، لكن المسارات لا تُسجَّل
 *    إلا عند ENABLE_EMAIL_AUTH=true في ملف .env
 *
 *    لا تحذف شيئاً — هذه خطة الطوارئ لو تعطّل Google OAuth
 *    أو تأخرت موافقة المتجر. تفعيلها = متغيّر بيئة واحد.
 */
if (env.enableEmailAuth) {
  router.post('/register', register);
  router.post('/login', login);
  log.info('️  مسار البريد وكلمة المرور مُفعَّل (احتياطي)');
} else {
  // ردّ واضح بدل 404 غامض لو استدعاه الفرونت بالخطأ
  const disabled = (req, res) =>
    res.status(410).json({
      success: false,
      message: 'التسجيل بالبريد معطَّل — استخدم الدخول بجوجل',
      code: 'EMAIL_AUTH_DISABLED',
    });

  router.post('/register', disabled);
  router.post('/login', disabled);
}

// ════════════════════════════════════════════════
//  الجلسة
// ════════════════════════════════════════════════

router.post('/refresh', refresh);
router.post('/logout', logout);

// ════════════════════════════════════════════════
//  محمية
// ════════════════════════════════════════════════

router.post('/onboarding', authenticateToken, completeOnboarding);
router.patch('/companion', authenticateToken, setCompanionName);
router.get('/me', authenticateToken, getProfile);
router.get('/me/stats', authenticateToken, requireOnboarded, getMyStats);
router.get('/profile', authenticateToken, getProfile); // alias

export default router;
