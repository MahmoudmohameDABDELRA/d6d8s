import express from 'express';

import {
  blockUser,
  deleteMessage,
  editMessage,
  getMessages,
  listBlocked,
  listClanChats,
  listConversations,
  listRequests,
  openClanChat,
  reactToMessage,
  reportAndBlockMessage,
  reportMessage,
  respondToRequest,
  searchUsers,
  sendMessage,
  startConversation,
  unblockUser,
  updatePrivacy,
} from './chat.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── التبويبات الثلاثة ──
router.get('/conversations', listConversations);
router.get('/clans', listClanChats);
router.get('/requests', listRequests);

// ── البحث والاكتشاف ──
router.get('/search', searchUsers);

// ── بدء محادثة ──
router.post('/start', startConversation);
router.post('/requests/:id/respond', respondToRequest);
router.get('/clans/:clanId/open', openClanChat);

// ── الرسائل ──
router.get('/:conversationId/messages', getMessages);
router.post('/:conversationId/messages', sendMessage);
router.patch('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);
router.post('/messages/:messageId/react', reactToMessage);
router.post('/messages/:messageId/report', reportMessage);
router.post('/messages/:messageId/report-and-block', reportAndBlockMessage);

// ── الخصوصية ──
router.patch('/privacy', updatePrivacy);
router.post('/block', blockUser);
router.delete('/block/:targetUserId', unblockUser);
router.get('/blocked', listBlocked);

export default router;
