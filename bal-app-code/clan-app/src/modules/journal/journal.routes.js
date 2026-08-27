import express from 'express';

import {
  addWeek,
  answerDreamQuiz,
  approveDreamPlan,
  approveStepJourney,
  completeGoal,
  completeGoalStep,
  createDream,
  getPendingDream,
  discardPendingDream,
  createGoal,
  deleteGoal,
  documentWeek,
  generateStepJourney,
  getDueFutureNotes,
  getGoal,
  getJournalStats,
  getStepJourney,
  getWeek,
  listGoals,
  skipWeek,
  updateGoal,
} from './journal.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// ── الثابتة قبل المتغيّرة حتى لا يبتلعها :id ──
router.get('/stats', getJournalStats);
router.get('/future-notes', getDueFutureNotes);

// ── جبل الأهداف (الرؤية الجديدة «بال») — قبل /:id حتى لا يبتلعها ──
router.post('/dream', createDream);

/**
 * ️ لازم **قبل** `/dream/:id/...` — غير كده Express هيفسّر
 *    «pending» كأنها قيمة الـ id.
 */
router.get('/dream/pending', getPendingDream);
router.delete('/dream/pending', discardPendingDream);
router.post('/dream/:id/answers', answerDreamQuiz);
router.post('/dream/:id/approve', approveDreamPlan);
router.post('/dream/:goalId/steps/:stepId/complete', completeGoalStep);

// ── رحلات الجبل (Journey) — توليد + موافقة + عرض ──
router.post('/steps/:stepId/journey', generateStepJourney);
router.post('/steps/:stepId/journey/approve', approveStepJourney);
router.get('/steps/:stepId/journey', getStepJourney);

// ── الأسابيع: مسار مستقل حتى لا يتعارض مع :id ──
router.get('/weeks/:weekId', getWeek);
router.post('/weeks/:weekId/document', documentWeek);
router.post('/weeks/:weekId/skip', skipWeek);

// ── الأهداف ──
router.get('/', listGoals);
router.post('/', createGoal);

router.get('/:id', getGoal);
router.patch('/:id', updateGoal);
router.delete('/:id', deleteGoal);

router.post('/:id/weeks', addWeek);
router.post('/:id/complete', completeGoal);

export default router;
