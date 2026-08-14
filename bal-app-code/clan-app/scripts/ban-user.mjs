/**
 * حظر/رفع حظر مستخدم — مع إبطال الكاش.
 *
 * ⚠️ لماذا سكربت لا مسار API؟
 *    لا يوجد مسار حظر في التطبيق (تحقّقنا). الحظر يتم من
 *    القاعدة يدوياً — وتعديل القاعدة مباشرةً **لا يُبطل الكاش**،
 *    فيظل المحظور يعمل حتى 60 ثانية.
 *
 *    هذا السكربت يفعل الاثنين معاً.
 *
 * الاستخدام:
 *   node scripts/ban-user.mjs <userId> ban
 *   node scripts/ban-user.mjs <userId> unban
 *   node scripts/ban-user.mjs <userId> admin      # ترقية لأدمن
 */
import 'dotenv/config';

const [, , userId, action] = process.argv;

if (!userId || !['ban', 'unban', 'admin', 'user'].includes(action)) {
  console.log('الاستخدام: node scripts/ban-user.mjs <userId> ban|unban|admin|user');
  process.exit(1);
}

const prisma = (await import('../src/config/prisma.js')).default;
const { connectRedis, redisClient } = await import('../src/config/redis.js');
const userCache = await import('../src/services/userCache.service.js');

try { await connectRedis(); } catch { console.warn('⚠️ Redis غير متصل — الكاش المحلي فقط'); }

const data =
  action === 'ban' ? { isBanned: true }
  : action === 'unban' ? { isBanned: false }
  : action === 'admin' ? { role: 'ADMIN' }
  : { role: 'USER' };

const user = await prisma.user.update({
  where: { id: userId },
  data,
  select: { id: true, username: true, role: true, isBanned: true },
});

await userCache.invalidate(userId);

console.log(`✅ ${user.username}: role=${user.role} · banned=${user.isBanned}`);
console.log('   الكاش أُبطل — التغيير ساري فوراً');

try { await redisClient.quit(); } catch {}
await prisma.$disconnect();
