/**
 * Thin wrapper around the AI provider's HTTP API. Isolated here so that
 * swapping providers (Anthropic / OpenAI / a local model) later only
 * means editing this one file, not the route or prompt logic.
 */

const AI_API_URL = process.env.AI_API_URL || 'https://api.anthropic.com/v1/messages';
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';

if (!AI_API_KEY) {
  console.warn('[aiClient] AI_API_KEY is not set - requests will fail.');
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @returns {Promise<string>} the AI's plain-text reply
 */
async function getAiReply(systemPrompt, userMessage) {
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Anthropic returns content as an array of blocks; join any text blocks.
  const textBlocks = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text);

  const reply = textBlocks.join('\n').trim();
  if (!reply) {
    throw new Error('AI API returned an empty reply');
  }
  return reply;
}

module.exports = { getAiReply };
