import { unauthorized, badRequest } from '../src/utils/AppError.js';

/** صيغة التوكن الوهمي: "valid:googleId:email:name" */
export const verifyGoogleToken = async (idToken) => {
  if (!idToken) throw badRequest('idToken مفقود', 'GOOGLE_TOKEN_MISSING');
  const [kind, googleId, email, name] = String(idToken).split(':');
  if (kind === 'unverified')
    throw unauthorized('بريد جوجل غير مُتحقَّق منه', 'GOOGLE_EMAIL_UNVERIFIED');
  if (kind !== 'valid')
    throw unauthorized('توكن جوجل غير صالح', 'GOOGLE_TOKEN_INVALID');
  return { googleId, email, name, picture: 'https://x/p.jpg', emailVerified: true };
};

export const suggestUsername = (email, name) => {
  const base = (name || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  return base.length >= 3 ? base : `user${Date.now().toString().slice(-6)}`;
};

export default { verifyGoogleToken, suggestUsername };
