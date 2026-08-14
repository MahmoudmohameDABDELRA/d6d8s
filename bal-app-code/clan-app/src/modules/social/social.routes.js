import express from 'express';
import {
  incomingRequests,
  myFriends,
  muteUser as muteCtrl,
  myMuted,
  respondToFriendRequest,
  sendFriendRequest,
  unfriend,
  unmuteUser as unmuteCtrl,
} from './friends.controller.js';
import {
  createReport,
  followUser,
  getFollowers,
  getFollowing,
  getProfile,
  listAdminReports,
  listRequests,
  resolveAdminReport,
  respondFollowRequest,
  unfollowUser,
  updatePrivacy,
  updateStatus,
} from './social.controller.js';
import {
  authenticateToken,
  requireAdmin,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── الخصوصية والحالة ──
router.patch('/privacy', updatePrivacy);
router.patch('/status', updateStatus);

// ── شبكة المتابعة والطلبات ──
router.post('/follow/:targetUserId', followUser);
router.delete('/unfollow/:targetUserId', unfollowUser);
router.get('/requests', listRequests);
router.post('/requests/:requestId/respond', respondFollowRequest);

// ── استعراض الملفات والقوائم ──
router.get('/profile/:userId', getProfile);
router.get('/followers/:userId', getFollowers);
router.get('/following/:userId', getFollowing);

// ═══════════════ الصداقة (نظام انستقرام) ═══════════════
router.get('/friends', myFriends);
router.get('/friends/requests', incomingRequests);
router.post('/friends/request/:targetUserId', sendFriendRequest);
router.post('/friends/requests/:requestId/respond', respondToFriendRequest);
router.delete('/friends/:friendId', unfriend);

// ═══════════════ الكتم ═══════════════
router.post('/mute/:targetUserId', muteCtrl);
router.delete('/mute/:targetUserId', unmuteCtrl);
router.get('/muted', myMuted);

// ── البلاغات الرقابية ──
router.post('/report', createReport);

// ── إدارة البلاغات (Admin Only) ──
router.get('/admin/reports', requireAdmin, listAdminReports);
router.patch('/admin/reports/:reportId/resolve', requireAdmin, resolveAdminReport);

export default router;
