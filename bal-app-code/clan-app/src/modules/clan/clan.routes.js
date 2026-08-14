import express from 'express';

import {
  autoAssignGlobalClan,
  createPrivateClan,
  deleteClan,
  getClanMembers,
  getGlobalActiveSession,
  getMyClans,
  joinGlobalClan,
  joinPrivateClan,
  kickMember,
  leaveClan,
  listBans,
  unbanMember,
  updateClan,
} from './clan.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── العشائر العامة (بلا مالك) ──
router.post('/global/auto-assign', autoAssignGlobalClan);
router.post('/global/join', joinGlobalClan);
router.get('/global/active-session', getGlobalActiveSession);

// ── العشائر الخاصة ──
router.post('/private/create', createPrivateClan);
router.post('/private/join', joinPrivateClan);

router.get('/my-clans', getMyClans);
router.delete('/leave/:clanId', leaveClan);
router.get('/:clanId/members', getClanMembers);

// ── صلاحيات المالك (العشائر الخاصة فقط) ──
// لا توجد ترقية إلى ADMIN — ثغرة تمنح صلاحيات في عشيرتين
router.patch('/:clanId', updateClan);
router.delete('/:clanId', deleteClan);
router.delete('/:clanId/members/:userId', kickMember);
router.get('/:clanId/bans', listBans);
router.delete('/:clanId/bans/:userId', unbanMember);

// ملاحظة: لا توجد لوحة صدارة — التطبيق تعاوني لا تنافسي

export default router;
