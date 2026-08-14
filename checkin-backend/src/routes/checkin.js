const express = require('express');
const { buildSystemPrompt, buildUserMessage } = require('../services/promptBuilder');
const { getAiReply } = require('../services/aiClient');
const { getHistory, appendExchange } = require('../services/historyStore');

const router = express.Router();

function isValidTask(task) {
  return (
    task &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.scheduled_time === 'string' &&
    typeof task.duration_minutes === 'number'
  );
}

router.post('/task-checkin', async (req, res) => {
  try {
    const { user_id, task, user_reply } = req.body;

    // ---- validation ----
    if (typeof user_id !== 'string' || !user_id.trim()) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    if (!isValidTask(task)) {
      return res.status(400).json({ error: 'task is missing required fields' });
    }
    if (typeof user_reply !== 'string' || !user_reply.trim()) {
      return res.status(400).json({ error: 'user_reply is required' });
    }
    if (user_reply.length > 1000) {
      return res.status(400).json({ error: 'user_reply is too long' });
    }

    // ---- build prompt with prior context ----
    const history = await getHistory(user_id, task.id);
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(task, user_reply, history);

    // ---- call the AI ----
    const reply = await getAiReply(systemPrompt, userMessage);

    // ---- persist this exchange for next time ----
    await appendExchange(user_id, task.id, user_reply, reply);

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('[task-checkin] error:', err.message);
    return res.status(502).json({ error: 'Failed to get a reply from the AI service' });
  }
});

module.exports = router;
