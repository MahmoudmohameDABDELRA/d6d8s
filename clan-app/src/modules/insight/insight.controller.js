import * as insightService from '../../services/insight.service.js';
import * as streakService from '../../services/streak.service.js';
import prisma from '../../config/prisma.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  كنترولر معلومة اليوم — Daily Golden Insight Controller
 * ════════════════════════════════════════════════════════════
 */

export const getTodayInsight = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { tzOffsetMinutes = 0 } = req.body ?? {};

  const result = await insightService.getTodayInsightForUser(
    userId,
    Number(tzOffsetMinutes) || 0,
  );

  res.status(result.isNewToday ? 200 : 200).json(result);
});

export const getTodayInsightStatus = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const today = streakService.localDate(user.timezone || 'Africa/Cairo');
  const existing = await prisma.dailyInsightLog.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { viewedAt: true, sparksAwarded: true },
  });

  const isToday = Boolean(existing);

  res.json({
    success: true,
    availableToday: !isToday,
    lastViewedAt: existing?.viewedAt ?? null,
    message: isToday
      ? 'لقد استلمت معلومة اليوم بالفعل  تتجدد غداً'
      : 'معلومة اليوم الذهبية جاهزة لفتحها!  اضغط للفتح واكسب +5 شرارات',
  });
});

export const getMyInsightHistory = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;

  const take = Math.min(50, Math.max(1, Number(limit) || 20));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const [logs, total] = await Promise.all([
    prisma.dailyInsightLog.findMany({
      where: { userId },
      include: { insight: true },
      orderBy: { viewedAt: 'desc' },
      take,
      skip,
    }),
    prisma.dailyInsightLog.count({ where: { userId } }),
  ]);

  res.json({
    success: true,
    total,
    page: Number(page) || 1,
    limit: take,
    history: logs.map((l) => ({
      id: l.id,
      viewedAt: l.viewedAt,
      sparksAwarded: l.sparksAwarded,
      title: l.insight?.title ?? 'معلومة تحفيزية',
      speaker: l.insight?.speaker ?? 'خبير المجال',
      content: l.insight?.content,
      takeaway: l.insight?.takeaway,
      videoUrl: l.insight?.videoUrl,
    })),
  });
});

export const createAdminInsight = asyncHandler(async (req, res) => {
  const item = await insightService.createInsightItem(req.body ?? {});

  res.status(201).json({
    success: true,
    message: 'تمت إضافة معلومة اليوم بنجاح إلى الخزانة',
    item,
  });
});

export const listAdminInsights = asyncHandler(async (req, res) => {
  const { domain, page = 1, limit = 50 } = req.query;
  const result = await insightService.listInsightItems({
    domain,
    page: Number(page) || 1,
    limit: Number(limit) || 50,
  });

  res.json({ success: true, ...result });
});

export const deleteAdminInsight = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await insightService.deleteInsightItem(id);

  res.json({ success: true, message: 'تم تعطيل المعلومة بنجاح' });
});

export default {
  getTodayInsight,
  getTodayInsightStatus,
  getMyInsightHistory,
  createAdminInsight,
  listAdminInsights,
  deleteAdminInsight,
};
