import * as analyticsService from '../../services/analytics.service.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * ════════════════════════════════════════════════════════════
 *  كنترولر محرك الإحصائيات والتحليلات الشاملة
 * ════════════════════════════════════════════════════════════
 */

export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.query;

  const result = await analyticsService.getMasterDashboard(userId, timezone);
  res.status(200).json(result);
});

export const getActivityTimeline = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { days, timezone } = req.query;

  const result = await analyticsService.getActivityTimeline({
    userId,
    days: Number(days) || 30,
    timezone,
  });

  res.status(200).json(result);
});

export const getRadarMatrix = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await analyticsService.getRadarMatrix(userId);
  res.status(200).json(result);
});

export const getPeakHours = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.query;

  const result = await analyticsService.getPeakProductivityHours(userId, timezone);
  res.status(200).json(result);
});

export const getGrowthComparison = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { timezone } = req.query;

  const result = await analyticsService.getGrowthComparison({ userId, timezone });
  res.status(200).json(result);
});

export const getCircadianDiscipline = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await analyticsService.getCircadianDiscipline(userId);
  res.status(200).json(result);
});

export const getMoodCorrelation = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await analyticsService.getMoodCorrelation(userId);
  res.status(200).json(result);
});

export const getDomainRankings = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const result = await analyticsService.getDomainPercentile(userId);
  res.status(200).json({ success: true, ...result });
});

export default {
  getDashboard,
  getActivityTimeline,
  getRadarMatrix,
  getPeakHours,
  getGrowthComparison,
  getCircadianDiscipline,
  getMoodCorrelation,
  getDomainRankings,
};
