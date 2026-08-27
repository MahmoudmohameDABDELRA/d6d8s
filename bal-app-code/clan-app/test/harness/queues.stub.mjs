export const QUEUE_NAMES = { PULSE:'pulse', MAINTENANCE:'maintenance', NOTIFICATION:'notification', TASK_NUDGE:'task-nudge', TASK_CHECKIN:'task-checkin', JOURNEY_DAILY:'journey-daily' };
const q = { async add(){return {id:'j'};}, async remove(){return 1;}, async close(){}, async upsertJobScheduler(){}, async getJobSchedulers(){return [];} };
export const getQueue = () => q;
export const createConnection = () => ({});
export const scheduleRepeatables = async () => {};
export const closeQueues = async () => {};
export default { QUEUE_NAMES, getQueue, createConnection, closeQueues };
