import express from 'express';

import {
  addVideo,
  getBreakOptions,
  listVideos,
  myLibrary,
  purchaseVideo,
  removeVideo,
  watchVideo,
} from './video.controller.js';
import {
  authenticateToken,
  requireAdmin,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

router.get('/break-options', getBreakOptions);
router.get('/library', myLibrary);
router.get('/', listVideos);

router.post('/:id/purchase', purchaseVideo);
router.get('/:id/watch', watchVideo);

/**
 * ️ مسارات الكتابة على الكتالوج — للإدارة فقط.
 *    كانت مفتوحة لأي حساب مسجَّل: أي مستخدم كان ينشر محتوى
 *    يراه الجميع، أو يحذف محتوى غيره.
 */
router.post('/', requireAdmin, addVideo);
router.delete('/:id', requireAdmin, removeVideo);

export default router;
