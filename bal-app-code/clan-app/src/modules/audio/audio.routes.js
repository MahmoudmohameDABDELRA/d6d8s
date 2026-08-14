import express from 'express';
import {
  createOfficialTrack,
  deleteOfficialTrack,
  getCatalog,
  getMyLibrary,
  purchaseTrack,
  streamTrack,
  unlockLocalSlot,
} from './audio.controller.js';
import {
  authenticateToken,
  requireAdmin,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ════════════════════════════════════════════════
//  تصفح الكتالوج والمكتبة الصوتية
// ════════════════════════════════════════════════

router.get('/catalog', getCatalog);
router.get('/library', getMyLibrary);

// الشراء وتحرير المساحات المحلية بالشرارات
router.post('/:id/purchase', purchaseTrack);
router.get('/:id/stream', streamTrack);
router.post('/unlock-slot', unlockLocalSlot);

// ════════════════════════════════════════════════
//  إدارة التراكات الرسمية (Admins Only)
// ════════════════════════════════════════════════

router.post('/tracks', requireAdmin, createOfficialTrack);
router.delete('/tracks/:id', requireAdmin, deleteOfficialTrack);

export default router;
