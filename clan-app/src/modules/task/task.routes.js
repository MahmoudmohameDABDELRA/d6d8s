import express from 'express';

import {
  addStep,
  completeTask,
  createBatchBlocks,
  createQuickErrand,
  createTask,
  deleteStep,
  deleteTask,
  getSoundThemes,
  getTask,
  getTaskStats,
  getTimelineSchedule,
  listTasks,
  reopenTask,
  rescheduleTask,
  toggleStep,
  updateTask,
} from './task.controller.js';
import {
  authenticateToken,
  requireOnboarded,
} from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireOnboarded);

// الثابتة قبل المتغيّرة حتى لا يبتلعها :id
router.get('/stats', getTaskStats);
router.get('/sound-themes', getSoundThemes);
router.get('/timeline-schedule', getTimelineSchedule);
router.post('/batch-blocks', createBatchBlocks);
router.post('/quick-errand', createQuickErrand);

// الخطوات — مسار مستقل حتى لا يتعارض مع :id
router.patch('/steps/:stepId/toggle', toggleStep);
router.delete('/steps/:stepId', deleteStep);

router.get('/', listTasks);
router.post('/', createTask);

router.get('/:id', getTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

router.patch('/:id/complete', completeTask);
router.patch('/:id/reopen', reopenTask);
router.patch('/:id/reschedule', rescheduleTask);

router.post('/:id/steps', addStep);

export default router;
