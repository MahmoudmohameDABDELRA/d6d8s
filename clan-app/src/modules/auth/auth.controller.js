import crypto from 'node:crypto';

import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import env from '../../config/env.js';
import prisma from '../../config/prisma.js';
import * as userCache from '../../services/userCache.service.js';
import { DOMAINS, DOMAIN_LABELS, VALIDATION, isValidSpecialty } from '../../config/constants.js';
import {
  suggestUsername,
  verifyGoogleToken,
} from '../../services/google.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, unauthorized } from '../../utils/AppError.js';

const REFRESH_COOKIE = 'refreshToken';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const refreshCookieOptions = () => ({
  httpOnly: true,
  sameSite: env.isProduction ? 'none' : 'lax',
  secure: env.isProduction,
  path: '/api/auth',
  maxAge: env.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000,
});

/** نخزّن بصمة SHA-256 للتوكن لا التوكن نفسه: تسريب قاعدة البيانات لا يعطي جلسات صالحة. */
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (userId) =>
  jwt.sign({ userId }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });

const issueRefreshToken = async (userId) => {
  /**
   * jti عشوائي ضروري: بدونه ينتج jwt.sign نفس السلسلة حرفياً
   * لتسجيلَي دخول في الثانية نفسها (iat بدقة الثانية)،
   * فيخرق قيد @unique على token ويُرجع 500.
   */
  const refreshToken = jwt.sign(
    { userId, jti: crypto.randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: `${env.jwt.refreshExpiresInDays}d` },
  );

  const expiresAt = new Date(
    Date.now() + env.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000,
  );

  await prisma.refreshToken.create({
    data: { token: hashToken(refreshToken), userId, expiresAt },
  });

  return refreshToken;
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  domain: user.domain ?? null,
  specialty: user.specialty ?? null,
  profileImage: user.profileImage ?? null,
  onboarded: user.onboarded ?? false,
  companionName: user.companionName ?? null,
});

/** اسم مستخدم فريد — يضيف لاحقة رقمية عند التعارض */
const uniqueUsername = async (base) => {
  let candidate = base;
  for (let i = 0; i < 20; i += 1) {
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${base}${Date.now().toString().slice(-8)}`;
};

//////////////////////////////////////////////////////
// GOOGLE SIGN-IN  (المسار الأساسي)
//////////////////////////////////////////////////////

/**
 * تسجيل ودخول بضغطة واحدة.
 * أول مرة → يُنشأ الحساب بـ onboarded = false
 * المرات التالية → دخول عادي
 *
 * المجال يُسأل عنه في شاشة منفصلة لأن جوجل لا يوفّره.
 */
export const googleAuth = asyncHandler(async (req, res) => {
  const { idToken, timezone } = req.body ?? {};

  const profile = await verifyGoogleToken(idToken);

  let user = await prisma.user.findUnique({
    where: { googleId: profile.googleId },
  });

  // حساب بنفس البريد أُنشئ سابقاً بالبريد؟ نربطه بجوجل
  if (!user) {
    const byEmail = await prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: profile.googleId,
          isVerified: true,
          ...(byEmail.profileImage ? {} : { profileImage: profile.picture }),
        },
      });
    }
  }

  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const username = await uniqueUsername(
      suggestUsername(profile.email, profile.name),
    );

    user = await prisma.user.create({
      data: {
        username,
        email: profile.email,
        googleId: profile.googleId,
        authProvider: 'GOOGLE',
        password: null,
        profileImage: profile.picture,
        isVerified: true,
        onboarded: false,
        ...(timezone ? { timezone } : {}),
      },
    });
  }

  if (user.isBanned) {
    throw unauthorized('تم حظر الحساب');
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  res.status(isNewUser ? 201 : 200).json({
    success: true,
    isNewUser,
    /** الواجهة تعرض شاشة اختيار المجال حين تكون false */
    needsOnboarding: !user.onboarded,
    accessToken,
    user: publicUser(user),
  });
});

//////////////////////////////////////////////////////
// إكمال البيانات — اختيار المجال
//////////////////////////////////////////////////////

export const completeOnboarding = asyncHandler(async (req, res) => {
  const { domain, specialty, username, interests } = req.body ?? {};

  // ═══ قرار المالك: الاهتمامات (2 كحد أقصى) تحدد العشائر العامة ═══
  // الـ domain القديم = أول اهتمام (توافقاً مع الأنظمة القائمة)
  const chosenInterests = Array.isArray(interests) && interests.length > 0
    ? interests
    : (domain ? [domain] : []);

  if (chosenInterests.length === 0) {
    throw badRequest(
      `يجب اختيار اهتمام واحد على الأقل. المتاح: ${DOMAINS.join(' · ')}`,
      'INVALID_DOMAIN',
    );
  }
  if (chosenInterests.length > 2) {
    throw badRequest('حد أقصى لاهتمامين فقط', 'TOO_MANY_INTERESTS');
  }
  for (const i of chosenInterests) {
    if (!DOMAINS.includes(i)) throw badRequest('اهتمام غير صالح', 'INVALID_DOMAIN');
  }

  const primaryDomain = chosenInterests[0];

  if (specialty && !isValidSpecialty(primaryDomain, specialty)) {
    throw badRequest('التخصص لا ينتمي للمجال المختار', 'INVALID_SPECIALTY');
  }

  const data = {
    domain: primaryDomain,
    interests: chosenInterests,
    specialty: specialty ?? null,
    onboarded: true,
  };

  // تغيير اسم المستخدم اختياري في هذه الخطوة
  if (username) {
    const trimmed = String(username).trim();
    if (
      trimmed.length < VALIDATION.USERNAME_MIN ||
      trimmed.length > VALIDATION.USERNAME_MAX
    ) {
      throw badRequest(
        `اسم المستخدم يجب أن يكون بين ${VALIDATION.USERNAME_MIN} و ${VALIDATION.USERNAME_MAX} حرفاً`,
      );
    }
    const taken = await prisma.user.findFirst({
      where: { username: trimmed, NOT: { id: req.user.userId } },
      select: { id: true },
    });
    if (taken) throw conflict('اسم المستخدم مستخدم بالفعل');
    data.username = trimmed;
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data,
  });

  /**
   * ️ إبطال إلزامي: هذا المسار يعدّل username و onboarded و domain
   *    وكلها مخزّنة في كاش المصادقة. بدونه يظل المستخدم يُرى
   *    "غير مكتمل" حتى 60 ثانية بعد إكماله بياناته.
   */
  await userCache.invalidate(req.user.userId);

  // ═══ انضمام تلقائي لعشائر الاهتمامات العامة (حتى 2) ═══
  const joinedClans = [];
  for (const interest of chosenInterests) {
    const clan = await prisma.clan.upsert({
      where: { type_category: { type: 'GLOBAL', category: interest } },
      update: {},
      create: {
        name: `عشيرة ${DOMAIN_LABELS[interest]}`,
        category: interest,
        type: 'GLOBAL',
        maxMembers: null,
      },
    });
    await prisma.clanMember.upsert({
      where: { userId_clanId: { userId: user.id, clanId: clan.id } },
      update: {},
      create: { userId: user.id, clanId: clan.id },
    });
    joinedClans.push({ id: clan.id, name: clan.name, category: clan.category });
  }

  res.json({
    success: true,
    message: 'تم إكمال البيانات',
    user: publicUser(user),
    joinedClans,
  });
});

//////////////////////////////////////////////////////
// REGISTER
//////////////////////////////////////////////////////

/**
 * ️ مسار احتياطي معطَّل.
 * المسار الأساسي هو googleAuth. هذا الكود محفوظ ويعمل كاملاً،
 * لكن الراوتر لا يسجّله إلا عند ENABLE_EMAIL_AUTH=true.
 * لا تحذفه — هو خطة الطوارئ لو تعطّل Google OAuth.
 */
export const register = asyncHandler(async (req, res) => {
  const { username, email, password, domain, specialty, timezone } =
    req.body ?? {};

  //  كل عمليات التحقق تتم قبل أي كتابة في قاعدة البيانات
  if (!username || !email || !password) {
    throw badRequest('جميع الحقول مطلوبة');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedUsername = String(username).trim();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw badRequest('بريد إلكتروني غير صالح');
  }

  if (
    normalizedUsername.length < VALIDATION.USERNAME_MIN ||
    normalizedUsername.length > VALIDATION.USERNAME_MAX
  ) {
    throw badRequest(
      `اسم المستخدم يجب أن يكون بين ${VALIDATION.USERNAME_MIN} و ${VALIDATION.USERNAME_MAX} حرفاً`,
    );
  }

  if (String(password).length < VALIDATION.PASSWORD_MIN) {
    throw badRequest(
      `كلمة المرور يجب أن تكون ${VALIDATION.PASSWORD_MIN} أحرف على الأقل`,
    );
  }

  //  المجال إلزامي — يحدد العشيرة التلقائية
  if (!domain || !DOMAINS.includes(domain)) {
    throw badRequest(
      `يجب اختيار مجال صالح. المتاح: ${DOMAINS.join(' · ')}`,
      'INVALID_DOMAIN',
    );
  }

  if (specialty && !isValidSpecialty(domain, specialty)) {
    throw badRequest('التخصص لا ينتمي للمجال المختار', 'INVALID_SPECIALTY');
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username: normalizedUsername }] },
    select: { id: true, email: true },
  });

  if (existing) {
    throw conflict('المستخدم موجود بالفعل');
  }

  const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      domain,
      specialty: specialty ?? null,
      ...(timezone ? { timezone } : {}),
    },
  });

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  res.status(201).json({
    success: true,
    message: 'تم إنشاء الحساب بنجاح',
    accessToken,
    user: publicUser(user),
  });
});

//////////////////////////////////////////////////////
// LOGIN
//////////////////////////////////////////////////////

/** ️ مسار احتياطي معطَّل — انظر التعليق فوق register */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw badRequest('البريد وكلمة المرور مطلوبان');
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
  });

  // 401 هو الرمز الصحيح لفشل المصادقة (كان 400)
  if (!user) {
    // hash وهمي لتثبيت زمن الاستجابة ومنع تعداد الحسابات عبر توقيت الرد
    await argon2.hash(String(password), { type: argon2.argon2id });
    throw unauthorized('بيانات الدخول غير صحيحة');
  }

  // مستخدم جوجل لا يملك كلمة مرور
  if (!user.password) {
    throw unauthorized(
      'هذا الحساب مسجَّل بجوجل — استخدم زر الدخول بجوجل',
      'USE_GOOGLE_SIGNIN',
    );
  }

  const valid = await argon2.verify(user.password, String(password));

  if (!valid) {
    throw unauthorized('بيانات الدخول غير صحيحة');
  }

  if (user.isBanned) {
    throw unauthorized('تم حظر الحساب');
  }

  const accessToken = signAccessToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  // ═══ توليد مهام اليوم للرحلات النشطة (Lazy — غير حاجب للدخول) ═══
  // الرئيسي في توليد المهام = لحظة فتح التطبيق بوقت المستخدم (P2)
  try {
    const { generateTodayTasks } = await import('../../services/journeyScheduler.service.js');
    generateTodayTasks({ userId: user.id }).catch((e) => {
      console.warn('فشل توليد مهام اليوم عند الدخول:', e.message);
    });
  } catch (e) {
    console.warn('فشل تحميل خدمة جدولة الجبل:', e.message);
  }

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  res.json({ success: true, accessToken, user: publicUser(user) });
});

//////////////////////////////////////////////////////
// REFRESH  (مع تدوير التوكن)
//////////////////////////////////////////////////////

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];

  if (!token) {
    throw unauthorized('Refresh token مفقود', 'REFRESH_MISSING');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.refreshSecret);
  } catch {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    throw unauthorized('Refresh token غير صالح أو منتهي', 'REFRESH_INVALID');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: hashToken(token) },
  });

  //  التحقق من الوجود والإبطال والانتهاء (كانت كلها مفقودة)
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    throw unauthorized('Refresh token غير صالح', 'REFRESH_INVALID');
  }

  // تدوير: نُبطل القديم ونصدر جديداً، فلا يُعاد استخدام توكن مسروق
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccessToken(payload.userId);
  const newRefreshToken = await issueRefreshToken(payload.userId);

  res.cookie(REFRESH_COOKIE, newRefreshToken, refreshCookieOptions());

  res.json({ success: true, accessToken });
});

//////////////////////////////////////////////////////
// LOGOUT
//////////////////////////////////////////////////////

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];

  if (token) {
    await prisma.refreshToken.updateMany({
      where: { token: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // نفس خيارات الكوكي مطلوبة وإلا لن يُحذف الكوكي في المتصفح
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());

  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

//////////////////////////////////////////////////////
// PROFILE
//////////////////////////////////////////////////////

/**
 * تسمية الرفيق — «بماذا تريد أن تناديني؟»
 * الاسم يُحفظ على المستخدم ويُحقن في سياق الـ AI.
 * PATCH /api/auth/companion  { name }
 */
export const setCompanionName = asyncHandler(async (req, res) => {
  const { name } = req.body ?? {};

  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw badRequest('اسم الرفيق مطلوب');
  if (trimmed.length > 30) throw badRequest('اسم الرفيق قصير — 30 حرفاً كحد أقصى');

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { companionName: trimmed },
  });

  return res.json({
    success: true,
    message: `تمام — من النهاردة هتناديني «${trimmed}»`,
    user: publicUser(user),
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      username: true,
      email: true,
      domain: true,
      specialty: true,
      onboarded: true,
      authProvider: true,
      bio: true,
      profileImage: true,
      isVerified: true,
      sparksBalance: true,
      totalSparksEarned: true,
      totalFocusMin: true,
      currentStreak: true,
      longestStreak: true,
      timezone: true,
      companionName: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw unauthorized('المستخدم غير موجود');
  }

  res.json({ success: true, user });
});
