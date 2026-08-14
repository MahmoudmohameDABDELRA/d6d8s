import * as humanService from '../../services/humanEngine.service.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * ════════════════════════════════════════════════════════════
 *  كنترولر الجانب النفسي والإنساني — Human-First Controller
 * ════════════════════════════════════════════════════════════
 */

export const activateShield = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.body ?? {};

  const result = await humanService.activateRestShield(userId, timezone);
  res.status(200).json(result);
});

export const checkInMood = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { mood, note, timezone } = req.body ?? {};

  const result = await humanService.recordDailyMood(userId, { mood, note, timezone });
  res.status(200).json(result);
});

export const ventAndBurn = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { ventText } = req.body ?? {};

  const result = await humanService.performSilentCatharsis(userId, ventText);
  res.status(200).json(result);
});

export const getWelcomeBackHero = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.query;

  const result = await humanService.generateHeroComeback(userId, timezone);
  res.status(200).json(result);
});

export const getEntryState = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.query;

  const result = await humanService.getAppEntryState(userId, timezone);
  res.status(200).json({ success: true, ...result });
});

export default {
  activateShield,
  checkInMood,
  ventAndBurn,
  getWelcomeBackHero,
  getEntryState,
};
