import jwt from 'jsonwebtoken';

import env from '../config/env.js';
import * as userCache from '../services/userCache.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import { forbidden, unauthorized } from '../utils/AppError.js';

/**
 * التحقق من Access Token.
 *
 * تصحيحات مهمة مقابل النسخة السابقة:
 * 1. السر يُقرأ من env.js (مضمون التحميل) بدل process.env مباشرة عند الاستيراد.
 * 2. التوكن المنتهي يُرجِع 401 وليس 403 — حتى يعرف الفرونت أنه يجب استدعاء /refresh.
 *    (403 تعني: أنت معرّف الهوية لكن ممنوع — وهذا ليس الحال هنا.)
 * 3. select يجلب الحقول المطلوبة فقط ويضيفها إلى req.user.
 * 4. catch لم يعد يبتلع الأخطاء غير المتعلقة بالتوكن (مثل انقطاع قاعدة البيانات).
 */
export const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme?.toLowerCase() !== 'bearer') {
    throw unauthorized('دخول غير مصرح به. التوكن مفقود.', 'TOKEN_MISSING');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('انتهت صلاحية التوكن.', 'TOKEN_EXPIRED');
    }
    throw unauthorized('التوكن غير صالح.', 'TOKEN_INVALID');
  }

  /**
   * ️ من الكاش لا القاعدة مباشرةً.
   *
   *  قِسنا الاستعلام المباشر: 0.77ms، وعند 1,000 طلب/ثانية
   *  يلتهم 77% من طاقة اتصال واحد — للمصادقة وحدها قبل أي
   *  منطق أعمال. انظر userCache.service.js.
   *
   *  الحظر يسري فوراً رغم الكاش: كل مسار حظر يُبطله صراحةً.
   */
  const user = await userCache.getAuthUser(decoded.userId);

  if (!user) {
    throw unauthorized('المستخدم غير موجود', 'USER_NOT_FOUND');
  }

  if (user.isBanned) {
    throw forbidden('تم حظر الحساب', 'USER_BANNED');
  }

  req.user = {
    userId: user.id,
    username: user.username,
    role: user.role,
    onboarded: user.onboarded,
    domain: user.domain,
  };

  next();
});

/**
 * يمنع الوصول قبل اختيار المجال.
 *
 * لماذا: التسجيل بجوجل لا يوفّر المجال، فيُنشأ الحساب بـ domain = null.
 * بدون هذا الحارس ستصل طلبات للعشائر والتركيز بمستخدم بلا مجال.
 *
 * يُستخدم على الراوترات التي تحتاج مستخدماً مكتمل البيانات.
 */
export const requireOnboarded = (req, res, next) => {
  if (!req.user?.onboarded || !req.user?.domain) {
    return next(
      forbidden(
        'أكمل بياناتك أولاً — اختر مجالك',
        'ONBOARDING_REQUIRED',
      ),
    );
  }
  next();
};

/** يسمح بالمرور فقط لأصحاب أدوار محددة داخل العشيرة (يُستخدم مع :clanId). */
export const requireClanRole = (...roles) =>
  asyncHandler(async (req, res, next) => {
    const clanId = req.params.clanId || req.body.clanId;

    if (!clanId) {
      throw forbidden('معرّف العشيرة مفقود', 'CLAN_ID_MISSING');
    }

    const membership = await prisma.clanMember.findUnique({
      where: { userId_clanId: { userId: req.user.userId, clanId } },
      select: { role: true },
    });

    if (!membership) {
      throw forbidden('أنت لست عضواً في هذه العشيرة', 'NOT_A_MEMBER');
    }

    if (roles.length > 0 && !roles.includes(membership.role)) {
      throw forbidden('صلاحياتك غير كافية', 'INSUFFICIENT_ROLE');
    }

    req.clanRole = membership.role;

    next();
  });

export default authenticateToken;

/**
 * يمنع غير الأدمن.
 *
 * ️ كان غائباً تماماً، فبقي `POST /api/videos` و`DELETE /:id`
 *    مفتوحين لأي حساب مسجَّل — أي مستخدم ينشر محتوى يراه
 *    الجميع أو يحذفه.
 *
 * ️ يُستخدم **بعد** authenticateToken دائماً: يقرأ req.user
 *    الذي يملؤه الأول. وضعه قبله يعني قراءة undefined فيمرّ
 *    الجميع.
 */
export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return next(forbidden('هذا المسار للإدارة فقط', 'ADMIN_ONLY'));
  }
  return next();
};
