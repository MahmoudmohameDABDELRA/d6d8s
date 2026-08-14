import express from 'express';
import {
  listNotes,
  createNote,
  getNote,
  updateNote,
  deleteNote,
  aiAnalyzeNote,
} from './note.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── مسار التحليل بواسطة الذكاء الاصطناعي ──
router.post('/ai-analyze', aiAnalyzeNote);
router.post('/:id/ai-analyze', aiAnalyzeNote);

// ── مسارات الـ CRUD الأساسية ──
router.get('/', listNotes);
router.post('/', createNote);
router.get('/:id', getNote);
router.patch('/:id', updateNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
