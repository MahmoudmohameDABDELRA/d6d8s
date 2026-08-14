import { OAuth2Client } from 'google-auth-library';

import env from '../config/env.js';
import { badRequest, unauthorized } from '../utils/AppError.js';

/**
 * ════════════════════════════════════════════════════════════
 *  التحقق من هوية جوجل
 * ════════════════════════════════════════════════════════════
 *
 * التطبيق (React Native) يحصل على idToken من Google Sign-In
 * ويرسله للخادم. الخادم يتحقق من توقيعه لدى جوجل مباشرة —
 * لا نثق بأي بيانات يرسلها العميل عن نفسه.
 */

const client = new OAuth2Client();

/**
 * @param {string} idToken
 * @returns {Promise<{googleId:string, email:string, name:string|null, picture:string|null, emailVerified:boolean}>}
 */
export const verifyGoogleToken = async (idToken) => {
  if (!idToken) {
    throw badRequest('idToken مفقود', 'GOOGLE_TOKEN_MISSING');
  }

  if (env.google.audiences.length === 0) {
    throw badRequest(
      'GOOGLE_CLIENT_ID غير مضبوط في متغيرات البيئة',
      'GOOGLE_NOT_CONFIGURED',
    );
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.google.audiences,
    });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized('توكن جوجل غير صالح', 'GOOGLE_TOKEN_INVALID');
  }

  if (!payload?.sub) {
    throw unauthorized('توكن جوجل ناقص', 'GOOGLE_TOKEN_INVALID');
  }

  // بريد غير مُتحقَّق منه = ثغرة انتحال هوية
  if (!payload.email_verified) {
    throw unauthorized('بريد جوجل غير مُتحقَّق منه', 'GOOGLE_EMAIL_UNVERIFIED');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    emailVerified: true,
  };
};

/**
 * توليد اسم مستخدم فريد من بيانات جوجل.
 * جوجل لا يوفّر username، والاسم قد يتكرر.
 */
export const suggestUsername = (email, name) => {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '')
    .slice(0, 20);

  return base.length >= 3 ? base : `user${Date.now().toString().slice(-6)}`;
};

export default { verifyGoogleToken, suggestUsername };
