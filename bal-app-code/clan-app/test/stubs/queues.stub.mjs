/**
 * بديل queues/index.js في الاختبارات — طابور صامت.
 *
 * ️ من غيره الاختبار بيعلّق: BullMQ بيفضل يحاول يوصل بـ Redis
 *    بلا مهلة نهائية. في الإنتاج ده مطلوب (الطابور لازم يستنى)،
 *    في الاختبار بيوقف كل حاجة.
 */
export const QUEUE_NAMES = {
  PULSE: 'pulse',
  MAINTENANCE: 'maintenance',
  NOTIFICATION: 'notification',
  TASK_NUDGE: 'task-nudge',
  TASK_CHECKIN: 'task-checkin',
  JOURNEY_DAILY: 'journey-daily',
};

const noopQueue = {
  async add() { return { id: 'stub-job' }; },
  async remove() { return 1; },
  async close() {},
  async upsertJobScheduler() {},
  async getJobSchedulers() { return []; },
};

export const getQueue = () => noopQueue;
export const createConnection = () => ({});
export const scheduleRepeatables = async () => {};
export const listSchedulers = async () => ({});
export const closeQueues = async () => {};
export default { QUEUE_NAMES, getQueue, createConnection, closeQueues };
