import express from 'express';

import {
  createRoom,
  deleteDrawingSketch,
  getDrawingSketch,
  getRoom,
  invitePlayer,
  joinRoom,
  leaveRoom,
  listDrawingGallery,
  listGames,
  saveDrawingSketch,
} from './game.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── لوحة الرسم والتفريغ الاسترخائي ──
router.post('/draw/save', saveDrawingSketch);
router.get('/draw/gallery', listDrawingGallery);
router.get('/draw/:id', getDrawingSketch);
router.delete('/draw/:id', deleteDrawingSketch);

// ── غرف الألعاب التفاعلية (الثعبان والدومينو) ──
router.get('/', listGames);
router.post('/rooms', createRoom);
router.post('/rooms/join', joinRoom);
router.get('/rooms/:roomId', getRoom);
router.post('/rooms/:roomId/invite', invitePlayer);
router.delete('/rooms/:roomId/leave', leaveRoom);

export default router;
