import prisma from '../../config/prisma.js';
import { DOMAINS } from '../../config/constants.js';
import { getPulseState, isBreakTime } from '../../services/pulse.service.js';
import * as sparksService from '../../services/sparks.service.js';
import * as youtube from '../../services/youtube.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  قسم الدوبامين — فيديوهات تُشترى بالشرارات
 * ════════════════════════════════════════════════════════════
 *
 * القاعدة الحاكمة: **متاح وقت الراحة فقط**.
 * هذه هي الفكرة كلها — متعة مستحقة بعد تركيز، لا تشتيت متاح دائماً.
 */

/** يصوغ الفيديو للعميل مع روابط التشغيل */
const shape = (video, owned = false) => {
  const urls =
    video.provider === 'YOUTUBE' ? youtube.buildUrls(video.sourceUrl) : null;

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    domain: video.domain,
    durationSec: video.durationSec,
    priceSparks: video.priceSparks,
    provider: video.provider,
    thumbnail: video.thumbnailUrl ?? urls?.thumbnail ?? null,
    owned,
    /** الروابط لا تُرسل إلا لمن يملك الفيديو */
    ...(owned
      ? {
          embedUrl: urls?.embedUrl ?? video.sourceUrl,
          watchUrl: urls?.watchUrl ?? video.sourceUrl,
        }
      : {}),
  };
};

//////////////////////////////////////////////////////
// بوابة الراحة
//////////////////////////////////////////////////////

/**
 * يتحقق أننا في فترة راحة.
 *
 * ملاحظة: هذا ينطبق على النبض العام. غرف المالك ستمرر
 * حالتها الخاصة لاحقاً عبر معامل صريح.
 */
const requireBreakTime = () => {
  if (!isBreakTime()) {
    const state = getPulseState();
    throw forbidden(
      'قسم الدوبامين متاح وقت الراحة فقط — ركّز الآن ',
      'NOT_BREAK_TIME',
    );
  }
};

/** خيارات الراحة — الدوبامين والألعاب */
export const getBreakOptions = asyncHandler(async (req, res) => {
  const state = getPulseState();
  const onBreak = isBreakTime();

  res.json({
    success: true,
    isBreakTime: onBreak,
    phase: state.phase,
    remainingMinutes: state.remainingInPhase,
    options: onBreak
      ? [
          {
            key: 'DOPAMINE',
            title: 'شاهد نفسك',
            icon: '',
            description: 'فيديوهات محفّزة من مجالك',
          },
          {
            key: 'GAMES',
            title: 'التسلية والتحدي',
            icon: '',
            description: 'ألعاب سريعة مع أعضاء عشيرتك',
          },
        ]
      : [],
    message: onBreak
      ? `استراحة — أمامك ${state.remainingInPhase} دقيقة`
      : 'الخيارات تُفتح وقت الراحة',
  });
});

//////////////////////////////////////////////////////
// تصفح الفيديوهات
//////////////////////////////////////////////////////

export const listVideos = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { all } = req.query;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { domain: true, sparksBalance: true },
  });

  // الفلترة حسب المجال — ما لم يطلب الكل صراحةً
  const where = {
    isActive: true,
    ...(all === 'true' ? {} : { OR: [{ domain: user.domain }, { domain: null }] }),
  };

  const [videos, purchases] = await Promise.all([
    // مكتبة الفيديو تنمو بلا سقف — نحدّها دائماً
    prisma.video.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(req.query.limit) || 50)),
      skip: (Math.max(1, Number(req.query.page) || 1) - 1) *
            Math.min(100, Math.max(1, Number(req.query.limit) || 50)),
    }),
    prisma.videoPurchase.findMany({
      where: { userId },
      select: { videoId: true },
      take: 500,
    }),
  ]);

  const ownedIds = new Set(purchases.map((p) => p.videoId));

  res.json({
    success: true,
    isBreakTime: isBreakTime(),
    balance: user.sparksBalance,
    total: videos.length,
    videos: videos.map((v) => shape(v, ownedIds.has(v.id))),
  });
});

/** مكتبتي — الفيديوهات المشتراة */
export const myLibrary = asyncHandler(async (req, res) => {
  const purchases = await prisma.videoPurchase.findMany({
    where: { userId: req.user.userId },
    include: { video: true },
    orderBy: { purchasedAt: 'desc' },
    take: 100,
  });

  res.json({
    success: true,
    total: purchases.length,
    videos: purchases.map((p) => ({
      ...shape(p.video, true),
      purchasedAt: p.purchasedAt,
      watchCount: p.watchCount,
    })),
  });
});

//////////////////////////////////////////////////////
// الشراء والمشاهدة
//////////////////////////////////////////////////////

export const purchaseVideo = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  requireBreakTime();

  const video = await prisma.video.findFirst({
    where: { id, isActive: true },
  });

  if (!video) throw notFound('الفيديو غير موجود');

  const existing = await prisma.videoPurchase.findUnique({
    where: { userId_videoId: { userId, videoId: id } },
  });

  if (existing) throw conflict('تملك هذا الفيديو بالفعل', 'ALREADY_OWNED');

  // الشراء والخصم في معاملة واحدة
  const result = await prisma.$transaction(async (tx) => {
    const spent = await sparksService.spend(userId, {
      source: 'VIDEO_PURCHASE',
      amount: video.priceSparks,
      refId: id,
      note: video.title,
      tx,
    });

    await tx.videoPurchase.create({
      data: { userId, videoId: id, sparksSpent: video.priceSparks },
    });

    return spent;
  });

  res.status(201).json({
    success: true,
    message: 'تم الشراء — استمتع بالمشاهدة',
    video: shape(video, true),
    sparks: { spent: video.priceSparks, balance: result.balance },
  });
});

/** تشغيل فيديو مملوك */
export const watchVideo = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { id } = req.params;

  requireBreakTime();

  const purchase = await prisma.videoPurchase.findUnique({
    where: { userId_videoId: { userId, videoId: id } },
    include: { video: true },
  });

  if (!purchase) {
    throw forbidden('اشترِ الفيديو أولاً', 'NOT_OWNED');
  }

  await prisma.$transaction([
    prisma.videoPurchase.update({
      where: { id: purchase.id },
      data: { watchCount: { increment: 1 }, lastWatchedAt: new Date() },
    }),
    prisma.video.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    }),
  ]);

  const state = getPulseState();

  res.json({
    success: true,
    video: shape(purchase.video, true),
    /** الوقت المتبقي في الراحة — الواجهة توقف التشغيل عند انتهائه */
    breakRemainingMin: state.remainingInPhase,
  });
});

//////////////////////////////////////////////////////
// الإضافة (مؤقتاً بلا حماية أدمن)
//////////////////////////////////////////////////////

/**
 * إضافة فيديو من رابط يوتيوب.
 *
 * ️ غير محمي بدور أدمن بعد — أضف حارساً قبل الإنتاج.
 */
export const addVideo = asyncHandler(async (req, res) => {
  const { url, title, description, domain, priceSparks, durationSec } =
    req.body ?? {};

  const videoId = youtube.extractVideoId(url);

  if (!videoId) {
    throw badRequest(
      'رابط يوتيوب غير صالح. مثال: https://youtube.com/shorts/k7xL_jy4J8Q',
      'INVALID_YOUTUBE_URL',
    );
  }

  if (domain && !DOMAINS.includes(domain)) {
    throw badRequest(`مجال غير صالح. المتاح: ${DOMAINS.join(' · ')}`);
  }

  const exists = await prisma.video.findFirst({
    where: { sourceUrl: videoId },
    select: { id: true },
  });

  if (exists) throw conflict('هذا الفيديو مضاف بالفعل');

  // العنوان من يوتيوب إن لم يُرسل
  const meta = title ? null : await youtube.fetchMetadata(videoId);

  const video = await prisma.video.create({
    data: {
      title: title?.trim() || meta?.title || 'فيديو',
      description: description?.trim() || null,
      domain: domain ?? null,
      provider: 'YOUTUBE',
      sourceUrl: videoId,
      thumbnailUrl: youtube.buildUrls(videoId).thumbnail,
      durationSec: Number.isInteger(durationSec) ? durationSec : 60,
      priceSparks: Number.isInteger(priceSparks) ? Math.max(0, priceSparks) : 30,
    },
  });

  res.status(201).json({
    success: true,
    message: 'تمت إضافة الفيديو',
    video: shape(video, true),
  });
});

export const removeVideo = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const video = await prisma.video.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!video) throw notFound('الفيديو غير موجود');

  // تعطيل لا حذف — المشتريات تبقى صالحة
  await prisma.video.update({ where: { id }, data: { isActive: false } });

  res.json({ success: true, message: 'تم تعطيل الفيديو' });
});
