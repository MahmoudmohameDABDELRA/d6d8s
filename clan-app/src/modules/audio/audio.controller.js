import prisma from '../../config/prisma.js';
import { AUDIO } from '../../config/constants.js';
import * as audioStreamService from '../../services/audioStream.service.js';
import * as sparksService from '../../services/sparks.service.js';
import * as userCache from '../../services/userCache.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';
import { scoped } from '../../config/logger.js';

const log = scoped('audio');

/**
 * ════════════════════════════════════════════════════════════
 *  المكتبة الصوتية لجلسات التركيز — Focus Audio Vault
 * ════════════════════════════════════════════════════════════
 *
 *  القسمان:
 *   ١. التراكات الرسمية (Official Catalog) — شراء بالشرارات فقط.
 *   ٢. المكتبة المحلية على الهاتف (Zero Server Bandwidth) —
 *      المستخدم يملك مساحة مجانية واحدة، ويحرر مساحات إضافية
 *      (Slots) بالشرارات.
 */

//////////////////////////////////////////////////////
// 1. تصفح الكتالوج الرسمي (Catalog)
//////////////////////////////////////////////////////

export const getCatalog = asyncHandler(async (req, res) => {
  const userId = req.user?.userId;
  const { category, search, page = 1, limit = 30 } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const take = Math.min(100, Math.max(1, Number(limit) || 30));
  const skip = (pageNum - 1) * take;

  const where = { isActive: true };

  if (category) {
    if (!AUDIO.CATEGORIES.includes(category)) {
      throw badRequest(`تصنيف غير صالح. المتاح: ${AUDIO.CATEGORIES.join(' · ')}`);
    }
    where.category = category;
  }

  if (search) {
    where.title = { contains: String(search).trim() };
  }

  const [tracks, total, myPurchases] = await Promise.all([
    prisma.audioTrack.findMany({
      where,
      orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
      take,
      skip,
    }),
    prisma.audioTrack.count({ where }),
    userId
      ? prisma.audioPurchase.findMany({
          where: { userId },
          select: { trackId: true },
        })
      : Promise.resolve([]),
  ]);

  const ownedSet = new Set(myPurchases.map((p) => p.trackId));

  res.json({
    success: true,
    total,
    page: pageNum,
    limit: take,
    hasMore: skip + tracks.length < total,
    categories: AUDIO.CATEGORIES.map((cat) => ({
      key: cat,
      nameAr: AUDIO.CATEGORY_LABELS[cat] ?? cat,
    })),
    tracks: tracks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      categoryNameAr: AUDIO.CATEGORY_LABELS[t.category] ?? t.category,
      durationSec: t.durationSec,
      previewUrl: t.previewUrl,
      sourceUrl: ownedSet.has(t.id) ? t.sourceUrl : null, // الرابط الكامل للمالك فقط
      sparksCost: t.sparksCost,
      isOwned: ownedSet.has(t.id),
    })),
  });
});

//////////////////////////////////////////////////////
// 2. شراء تراك رسمي بالشرارات (Purchase Track)
//////////////////////////////////////////////////////

export const purchaseTrack = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  const track = await prisma.audioTrack.findFirst({
    where: { id, isActive: true },
  });

  if (!track) throw notFound('المقطع الصوتي غير موجود');

  // فحص هل اشتراه المستخدم مسبقاً
  const existing = await prisma.audioPurchase.findUnique({
    where: { userId_trackId: { userId, trackId: id } },
  });

  if (existing) {
    throw conflict('لقد اشتريت هذا التراك بالفعل', 'AUDIO_ALREADY_PURCHASED');
  }

  // معاملة ذرية: خصم الشرارات وتسجيل الشراء
  const result = await prisma.$transaction(async (tx) => {
    const cost = track.sparksCost ?? AUDIO.DEFAULT_TRACK_COST;

    const spendResult = await sparksService.spend(userId, {
      source: 'AUDIO_PURCHASE',
      amount: cost,
      refId: id,
      note: `شراء مقطع تركيز: ${track.title}`,
      tx,
    });

    const purchase = await tx.audioPurchase.create({
      data: {
        userId,
        trackId: id,
        sparksSpent: cost,
      },
    });

    return { purchase, spendResult };
  });

  log.info({ userId, trackId: id, title: track.title }, 'تم شراء تراك تركيز بنجاح');

  res.status(201).json({
    success: true,
    message: `تم شراء "${track.title}" بنجاح! متاح الآن في جلسات تركيزك`,
    track: {
      id: track.id,
      title: track.title,
      sourceUrl: track.sourceUrl,
      category: track.category,
      durationSec: track.durationSec,
    },
    sparks: {
      spent: result.purchase.sparksSpent,
      balance: result.spendResult.balance,
    },
  });
});

//////////////////////////////////////////////////////
// 3. مكتبتي الصوتية وبيانات المساحة المحلية (My Library & Slots)
//////////////////////////////////////////////////////

export const getMyLibrary = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const [user, purchases] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        unlockedAudioSlots: true,
        sparksBalance: true,
      },
    }),
    prisma.audioPurchase.findMany({
      where: { userId },
      include: { track: true },
      orderBy: { purchasedAt: 'desc' },
      take: 100,
    }),
  ]);

  if (!user) throw notFound('المستخدم غير موجود');

  res.json({
    success: true,
    localSlots: {
      unlockedSlots: user.unlockedAudioSlots || AUDIO.DEFAULT_LOCAL_SLOTS,
      slotUnlockCost: AUDIO.SLOT_UNLOCK_COST,
      description: 'مساحات لإضافة مقاطع صوتية من ذاكرة هاتفك مباشرة دون استهلاك مساحة السيرفر',
    },
    wallet: {
      sparksBalance: user.sparksBalance,
    },
    totalOfficialPurchased: purchases.length,
    officialTracks: purchases.map((p) => ({
      id: p.track.id,
      title: p.track.title,
      description: p.track.description,
      category: p.track.category,
      categoryNameAr: AUDIO.CATEGORY_LABELS[p.track.category] ?? p.track.category,
      durationSec: p.track.durationSec,
      sourceUrl: p.track.sourceUrl,
      purchasedAt: p.purchasedAt,
    })),
  });
});

//////////////////////////////////////////////////////
// 4. تحرير مساحة محلية جديدة بالشرارات (Unlock Local Device Slot)
//////////////////////////////////////////////////////

export const unlockLocalSlot = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const cost = AUDIO.SLOT_UNLOCK_COST;

  const result = await prisma.$transaction(async (tx) => {
    // 1. خصم الشرارات
    const spendResult = await sparksService.spend(userId, {
      source: 'AUDIO_SLOT_UNLOCK',
      amount: cost,
      note: 'تحرير مساحة صوتية محلية جديدة في الهاتف',
      tx,
    });

    // 2. زيادة عدد المساحات المتاحة في جدول المستخدم
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { unlockedAudioSlots: { increment: 1 } },
      select: { unlockedAudioSlots: true, sparksBalance: true },
    });

    return { spendResult, updatedUser };
  });

  await userCache.invalidate(userId);

  log.info({ userId, slots: result.updatedUser.unlockedAudioSlots }, 'تم تحرير مساحة محلية جديدة');

  res.status(201).json({
    success: true,
    message: 'تم تحرير مساحة صوتية جديدة لهاتفك بنجاح! يمكنك الآن اختيار مقطع إضافي من جهازك',
    localSlots: {
      unlockedSlots: result.updatedUser.unlockedAudioSlots,
      costPaid: cost,
    },
    sparks: {
      balance: result.updatedUser.sparksBalance,
    },
  });
});

//////////////////////////////////////////////////////
// 5. إدارة المقاطع الرسمية (Admin Only)
//////////////////////////////////////////////////////

export const createOfficialTrack = asyncHandler(async (req, res) => {
  const { title, description, category, durationSec, sourceUrl, previewUrl, sparksCost } =
    req.body ?? {};

  const cleanTitle = v.requireString(title, 'عنوان التراك', { max: 120 });
  const cleanUrl = v.requireString(sourceUrl, 'رابط الملف الصوتي');

  if (category && !AUDIO.CATEGORIES.includes(category)) {
    throw badRequest(`تصنيف غير صالح. المتاح: ${AUDIO.CATEGORIES.join(' · ')}`);
  }

  const track = await prisma.audioTrack.create({
    data: {
      title: cleanTitle,
      description: description ? String(description).slice(0, 500) : null,
      category: category || 'LOFI',
      durationSec: Number(durationSec) || 300,
      sourceUrl: cleanUrl,
      previewUrl: previewUrl ? String(previewUrl) : null,
      sparksCost: Number.isInteger(Number(sparksCost)) ? Number(sparksCost) : AUDIO.DEFAULT_TRACK_COST,
    },
  });

  log.info({ adminId: req.user.userId, trackId: track.id, title: track.title }, 'تمت إضافة تراك رسمي جديد');

  res.status(201).json({
    success: true,
    message: 'تمت إضافة التراك الصوتي بنجاح',
    track,
  });
});

export const deleteOfficialTrack = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const track = await prisma.audioTrack.findUnique({ where: { id } });
  if (!track) throw notFound('المقطع الصوتي غير موجود');

  await prisma.audioTrack.delete({ where: { id } });

  res.json({
    success: true,
    message: `تم حذف التراك الصوتي "${track.title}" بنجاح`,
  });
});

//////////////////////////////////////////////////////
// 6. البث الآمن للملفات الصوتية (Secure Streaming Proxy)
//////////////////////////////////////////////////////

export const streamTrack = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const userRole = req.user.role;
  const { id } = req.params;

  const { track } = await audioStreamService.verifyTrackAccess(id, userId, userRole);

  audioStreamService.pipeAudioStream(track, req, res);
});

export default {
  getCatalog,
  purchaseTrack,
  getMyLibrary,
  unlockLocalSlot,
  createOfficialTrack,
  deleteOfficialTrack,
  streamTrack,
};
