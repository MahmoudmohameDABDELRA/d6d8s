import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import prisma from '../../config/prisma.js';
import { DOMAIN_LABELS, DOMAINS, LIMITS, VALIDATION } from '../../config/constants.js';
import { getCycleSchedule, getPulseState } from '../../services/pulse.service.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/AppError.js';
import * as v from '../../utils/validate.js';

const generateInviteCode = () =>
  crypto.randomBytes(4).toString('hex').toUpperCase();

//////////////////////////////////////////////////////
// AUTO ASSIGN GLOBAL CLAN
//////////////////////////////////////////////////////

export const autoAssignGlobalClan = asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { domain: true },
  });

  // المجال إلزامي عند التسجيل، لكن نتحقق تحسّباً للبيانات القديمة
  if (!user?.domain) {
    throw badRequest('المستخدم لا يملك مجالاً محدداً');
  }

  /**
   *  قبل: findFirst ثم create — سباق (race) يسمح بإنشاء عشيرتين
   *    عالميتين لنفس المجال عند طلبين متزامنين.
   *  بعد: upsert فوق @@unique([type, category]) — ذرّي على مستوى قاعدة البيانات.
   */
  const clan = await prisma.clan.upsert({
    where: { type_category: { type: 'GLOBAL', category: user.domain } },
    update: {},
    create: {
      name: `عشيرة ${DOMAIN_LABELS[user.domain]}`,
      category: user.domain,
      type: 'GLOBAL',
      maxMembers: null, // العشائر العامة بلا حد
    },
  });

  // ذرّي أيضاً: يعتمد على @@unique([userId, clanId])
  await prisma.clanMember.upsert({
    where: { userId_clanId: { userId, clanId: clan.id } },
    update: {},
    create: { userId, clanId: clan.id },
  });

  res.json({ success: true, message: 'تم التعيين التلقائي', clan });
});

//////////////////////////////////////////////////////
// JOIN SECOND GLOBAL CLAN
//////////////////////////////////////////////////////

export const joinGlobalClan = asyncHandler(async (req, res) => {
  // ═══ قرار المالك: حد 7 عشائر انضمام ═══
  const joinedCount = await prisma.clanMember.count({ where: { userId: req.user.userId } });
  if (joinedCount >= LIMITS.MAX_JOINED_CLANS) {
    throw badRequest(`وصلت للحد الأقصى من العشائر (${LIMITS.MAX_JOINED_CLANS})`, 'MAX_CLANS_REACHED');
  }
  const userId = req.user.userId;
  const { clanId } = req.body ?? {};

  if (!clanId) {
    throw badRequest('معرّف العشيرة مطلوب');
  }

  // معاملة واحدة: الفحوصات والإدراج لا يمكن أن تتداخل مع طلب آخر
  await prisma.$transaction(async (tx) => {
    const clan = await tx.clan.findUnique({
      where: { id: clanId },
      select: { id: true, type: true, maxMembers: true },
    });

    if (!clan) throw notFound('العشيرة غير موجودة');
    if (clan.type !== 'GLOBAL') throw forbidden('هذه ليست عشيرة كبرى');

    const globalCount = await tx.clanMember.count({
      where: { userId, clan: { type: 'GLOBAL' } },
    });

    if (globalCount >= LIMITS.MAX_GLOBAL_CLANS) {
      throw badRequest(
        `الحد الأقصى ${LIMITS.MAX_GLOBAL_CLANS} عشيرتان كبريان`,
      );
    }

    // العشائر العامة بلا حد أعضاء (maxMembers = null)

    try {
      await tx.clanMember.create({ data: { userId, clanId } });
    } catch (error) {
      // P2002 = خرق قيد التفرد => العضوية موجودة مسبقاً
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict('أنت عضو بالفعل');
      }
      throw error;
    }
  });

  res.json({ success: true, message: 'تم الانضمام' });
});

//////////////////////////////////////////////////////
// CREATE PRIVATE CLAN
//////////////////////////////////////////////////////

export const createPrivateClan = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { name, description, icon, maxMembers } = req.body ?? {};

  /**
   * ️ رفض النوع الخاطئ لا تحويله.
   *    كان `String(name ?? '')` فيمرّ الكائن كـ"[object Object]".
   *    المُحقّق يفحص النوع والطول معاً — فحص واحد بدل اثنين.
   */
  const trimmedName = v.requireString(name, 'اسم العشيرة', {
    min: VALIDATION.CLAN_NAME_MIN,
    max: VALIDATION.CLAN_NAME_MAX,
  });

  const ownedClan = await prisma.clan.findFirst({
    where: { type: 'PRIVATE', leaderId: userId },
    select: { id: true },
  });

  if (ownedClan) {
    throw conflict('يمكنك امتلاك عشيرة خاصة واحدة فقط');
  }

  const inviteCode = generateInviteCode();

  /**
   *  معاملة واحدة: إنشاء العشيرة + عضوية القائد + الدعوة.
   *    سابقاً كان فشل أي خطوة يترك عشيرة بلا قائد أو بلا دعوة.
   */
  const clan = await prisma.$transaction(async (tx) => {
    const created = await tx.clan.create({
      data: {
        name: trimmedName,
        description: description ?? null,
        icon: icon ?? null,
        type: 'PRIVATE',
        leaderId: userId,
        inviteCode,
        // ═══ قرار المالك: حد أقصى 15 عضو (P0 — كان يقبل حتى 200) ═══
        maxMembers: Number.isInteger(maxMembers)
          ? Math.min(Math.max(maxMembers, 2), LIMITS.DEFAULT_PRIVATE_CLAN_SIZE)
          : LIMITS.DEFAULT_PRIVATE_CLAN_SIZE,
      },
    });

    await tx.clanMember.create({
      data: { userId, clanId: created.id, role: 'LEADER' },
    });

    await tx.clanInvite.create({
      data: { clanId: created.id, inviteCode },
    });

    await tx.conversation.create({
      data: {
        clanId: created.id,
        type: 'CLAN',
        lastMessageText: 'أهلاً بكم في العشيرة!',
      },
    });

    return created;
  });

  res.status(201).json({ success: true, message: 'تم إنشاء العشيرة', clan });
});

//////////////////////////////////////////////////////
// JOIN PRIVATE CLAN
//////////////////////////////////////////////////////

export const joinPrivateClan = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { inviteCode } = req.body ?? {};

  if (!inviteCode) {
    throw badRequest('كود الدعوة مطلوب');
  }

  const code = String(inviteCode).trim().toUpperCase();

  // ═══ قرار المالك: حد انضمام 7 عشائر كحد أقصى (خاصة + عامة) ═══
  const joinedCount = await prisma.clanMember.count({ where: { userId } });
  if (joinedCount >= LIMITS.MAX_JOINED_CLANS) {
    throw badRequest(`وصلت للحد الأقصى من العشائر (${LIMITS.MAX_JOINED_CLANS})`, 'MAX_CLANS_REACHED');
  }

  await prisma.$transaction(async (tx) => {
    const invite = await tx.clanInvite.findUnique({
      where: { inviteCode: code },
      include: { clan: { select: { id: true, maxMembers: true } } },
    });

    /**
     *  قبل: كان الكود يستخدم invite.clanId قبل التحقق من وجود invite
     *    => TypeError: Cannot read properties of null  ثم 500 بدل 404.
     *  بعد: التحقق أولاً.
     */
    if (!invite) throw notFound('كود الدعوة غير صحيح');

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw badRequest('انتهت صلاحية كود الدعوة');
    }

    // المطرود لا يعود بنفس الكود
    const banned = await tx.clanBan.findUnique({
      where: { clanId_userId: { clanId: invite.clanId, userId } },
      select: { id: true },
    });

    if (banned) {
      throw forbidden('أنت محظور من هذه العشيرة', 'CLAN_BANNED');
    }

    const membersCount = await tx.clanMember.count({
      where: { clanId: invite.clanId },
    });

    if (
      invite.clan.maxMembers !== null &&
      membersCount >= invite.clan.maxMembers
    ) {
      throw badRequest('العشيرة ممتلئة');
    }

    try {
      await tx.clanMember.create({ data: { userId, clanId: invite.clanId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict('أنت عضو بالفعل');
      }
      throw error;
    }
  });

  res.json({ success: true, message: 'تم الانضمام للعشيرة' });
});

//////////////////////////////////////////////////////
// GET MY CLANS
//////////////////////////////////////////////////////

export const getMyClans = asyncHandler(async (req, res) => {
  const memberships = await prisma.clanMember.findMany({
    where: { userId: req.user.userId },
    include: {
      clan: {
        include: { _count: { select: { members: true } } },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  const clans = memberships.map(({ clan, role, joinedAt }) => ({
    ...clan,
    _count: undefined,
    membersCount: clan._count.members,
    myRole: role,
    joinedAt,
  }));

  res.json({ success: true, clans });
});

//////////////////////////////////////////////////////
// LEAVE CLAN
//////////////////////////////////////////////////////

export const leaveClan = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { clanId } = req.params;

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { leaderId: true },
  });

  if (!clan) throw notFound('العشيرة غير موجودة');

  if (clan.leaderId === userId) {
    throw forbidden('القائد لا يمكنه مغادرة عشيرته');
  }

  // deleteMany مع المفتاح المركّب: لا حاجة لاستعلام قراءة منفصل
  const { count } = await prisma.clanMember.deleteMany({
    where: { userId, clanId },
  });

  if (count === 0) throw notFound('أنت لست عضواً');

  res.json({ success: true, message: 'تمت المغادرة' });
});

//////////////////////////////////////////////////////
// ACTIVE SESSION  (نبض عالمي كل ساعتين)
//////////////////////////////////////////////////////

export const getGlobalActiveSession = asyncHandler(async (req, res) => {
  const state = getPulseState();

  res.json({
    success: true,
    ...state,
    schedule: getCycleSchedule(),
    serverTime: new Date().toISOString(),
  });
});

//////////////////////////////////////////////////////
// صلاحيات مالك العشيرة الخاصة
//////////////////////////////////////////////////////

/**
 * ️ لا توجد ترقية إلى ADMIN عمداً.
 *
 * السبب: القاعدة أن كل مستخدم يملك عشيرة خاصة واحدة فقط.
 * لو رقّى المالك عضواً، لأصبح ذلك العضو صاحب صلاحيات في
 * عشيرتين — عشيرته هو وهذه — وهي ثغرة تلتف على القاعدة.
 *
 * الصلاحيات المتاحة للمالك: الطرد · حذف العشيرة.
 */

/** يتحقق أن الطالب هو مالك عشيرة خاصة */
const requireOwner = async (clanId, userId) => {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true, type: true, leaderId: true, name: true },
  });

  if (!clan) throw notFound('العشيرة غير موجودة');

  if (clan.type !== 'PRIVATE') {
    throw forbidden(
      'العشائر العامة لا مالك لها — لا يمكن إدارتها',
      'GLOBAL_CLAN_NO_OWNER',
    );
  }

  if (clan.leaderId !== userId) {
    throw forbidden('أنت لست مالك هذه العشيرة', 'NOT_CLAN_OWNER');
  }

  return clan;
};

/**
 * طرد عضو — يُحذف من العشيرة ويُمنع من العودة بنفس الكود.
 *
 * ️ الطرد يحذف **العضوية** فقط. حساب المستخدم وكل بياناته
 *    (جلساته · مهامه · شراراته · أوسمته) تبقى كما هي.
 */
export const kickMember = asyncHandler(async (req, res) => {
  const { clanId, userId: targetId } = req.params;
  const ownerId = req.user.userId;
  const { reason, ban = true } = req.body ?? {};

  await requireOwner(clanId, ownerId);

  if (targetId === ownerId) {
    throw badRequest('لا يمكنك طرد نفسك — احذف العشيرة بدلاً من ذلك');
  }

  const membership = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId: targetId, clanId } },
    select: { id: true },
  });

  if (!membership) throw notFound('هذا المستخدم ليس عضواً');

  await prisma.$transaction(async (tx) => {
    await tx.clanMember.delete({ where: { id: membership.id } });

    // الحظر يمنع العودة بنفس كود الدعوة
    if (ban) {
      await tx.clanBan.upsert({
        where: { clanId_userId: { clanId, userId: targetId } },
        update: { reason: reason ?? null },
        create: { clanId, userId: targetId, reason: reason ?? null },
      });
    }
  });

  res.json({
    success: true,
    message: ban ? 'تم طرد العضو وحظره' : 'تم طرد العضو',
    note: 'حساب المستخدم وبياناته لم تتأثر',
  });
});

/** رفع الحظر — يسمح للعضو بالعودة */
export const unbanMember = asyncHandler(async (req, res) => {
  const { clanId, userId: targetId } = req.params;

  await requireOwner(clanId, req.user.userId);

  const { count } = await prisma.clanBan.deleteMany({
    where: { clanId, userId: targetId },
  });

  if (count === 0) throw notFound('هذا المستخدم غير محظور');

  res.json({ success: true, message: 'تم رفع الحظر' });
});

/** قائمة المحظورين */
export const listBans = asyncHandler(async (req, res) => {
  const { clanId } = req.params;

  await requireOwner(clanId, req.user.userId);

  const bans = await prisma.clanBan.findMany({
    where: { clanId },
    include: {
      user: { select: { id: true, username: true, profileImage: true } },
    },
    orderBy: { bannedAt: 'desc' },
  });

  res.json({ success: true, bans });
});

/**
 * حذف العشيرة.
 *
 * ️ نقطة حرجة: الحذف يزيل **العشيرة والعضويات فقط**.
 *    حسابات الأعضاء وبياناتهم كاملةً لا تُمس إطلاقاً.
 *    (onDelete: Cascade على ClanMember يحذف صف العضوية لا المستخدم)
 */
export const deleteClan = asyncHandler(async (req, res) => {
  const { clanId } = req.params;

  const clan = await requireOwner(clanId, req.user.userId);

  const membersCount = await prisma.clanMember.count({ where: { clanId } });

  await prisma.clanMember.deleteMany({ where: { clanId } });
  await prisma.clanInvite.deleteMany({ where: { clanId } });
  await prisma.clan.delete({ where: { id: clanId } });

  res.json({
    success: true,
    message: `تم حذف عشيرة "${clan.name}"`,
    releasedMembers: membersCount,
    note: 'حسابات الأعضاء وبياناتهم لم تتأثر — أُزيلت عضوياتهم فقط',
  });
});

/** تعديل بيانات العشيرة */
export const updateClan = asyncHandler(async (req, res) => {
  const { clanId } = req.params;
  const { name, description, icon } = req.body ?? {};

  await requireOwner(clanId, req.user.userId);

  const data = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (
      trimmed.length < VALIDATION.CLAN_NAME_MIN ||
      trimmed.length > VALIDATION.CLAN_NAME_MAX
    ) {
      throw badRequest(
        `اسم العشيرة يجب أن يكون بين ${VALIDATION.CLAN_NAME_MIN} و ${VALIDATION.CLAN_NAME_MAX} حرفاً`,
      );
    }
    data.name = trimmed;
  }

  if (description !== undefined) data.description = description?.trim() || null;
  if (icon !== undefined) data.icon = icon || null;

  if (Object.keys(data).length === 0) throw badRequest('لا يوجد ما يُحدَّث');

  const clan = await prisma.clan.update({ where: { id: clanId }, data });

  res.json({ success: true, clan });
});

/** أعضاء العشيرة */
export const getClanMembers = asyncHandler(async (req, res) => {
  const { clanId } = req.params;
  const userId = req.user.userId;

  const membership = await prisma.clanMember.findUnique({
    where: { userId_clanId: { userId, clanId } },
    select: { role: true },
  });

  if (!membership) throw forbidden('أنت لست عضواً في هذه العشيرة');

  const members = await prisma.clanMember.findMany({
    where: { clanId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          profileImage: true,
          domain: true,
          specialty: true,
          lastSeen: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
  });

  res.json({
    success: true,
    myRole: membership.role,
    isOwner: membership.role === 'LEADER',
    total: members.length,
    members: members.map((m) => ({
      ...m.user,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
});
