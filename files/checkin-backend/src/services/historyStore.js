/**
 * Stores prior check-in exchanges per (userId, taskId) so the AI can
 * reply with continuity ("قولتلي امبارح إنك متأخر في المهمة دي...").
 *
 * This default implementation is IN-MEMORY ONLY - it resets whenever the
 * server restarts and won't work across multiple server instances.
 * Since you already have your own backend/DB, replace the three methods
 * below with calls into your existing database (Postgres/MySQL/Mongo/
 * whatever you use) - the shape (get/append) is all the route needs.
 */

const store = new Map(); // key: `${userId}:${taskId}` -> array of {sender, text}

function keyFor(userId, taskId) {
  return `${userId}:${taskId}`;
}

async function getHistory(userId, taskId, limit = 6) {
  const all = store.get(keyFor(userId, taskId)) || [];
  return all.slice(-limit);
}

async function appendExchange(userId, taskId, userText, appReplyText) {
  const key = keyFor(userId, taskId);
  const existing = store.get(key) || [];
  existing.push({ sender: 'user', text: userText });
  existing.push({ sender: 'app', text: appReplyText });
  store.set(key, existing);
}

module.exports = { getHistory, appendExchange };
