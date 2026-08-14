import 'dotenv/config';
process.env.NODE_ENV='test';
const prisma=(await import('../src/config/prisma.js')).default;
const {connectRedis,redisClient}=await import('../src/config/redis.js');
await connectRedis();
const cache=await import('../src/services/userCache.service.js');
const u=await prisma.user.findFirst({select:{id:true}});
if(!u){console.log('مفيش مستخدم');process.exit(0)}

// إحماء
for(let i=0;i<20;i++) await cache.getAuthUser(u.id);

const N=500;
let t0=process.hrtime.bigint();
for(let i=0;i<N;i++) await prisma.user.findUnique({where:{id:u.id},select:{id:true,username:true,role:true,isBanned:true,onboarded:true,domain:true}});
const direct=Number(process.hrtime.bigint()-t0)/1e6/N;

t0=process.hrtime.bigint();
for(let i=0;i<N;i++) await cache.getAuthUser(u.id);
const cached=Number(process.hrtime.bigint()-t0)/1e6/N;

console.log(`قاعدة مباشرة: ${direct.toFixed(3)} ms`);
console.log(`من الكاش:     ${cached.toFixed(3)} ms`);
console.log(`أسرع:         ${(direct/cached).toFixed(1)}×`);
console.log(`\nعند 1,000 req/s:`);
console.log(`  قبل: ${Math.round(1000*direct)} ms/ثانية من زمن القاعدة (${(direct*100).toFixed(0)}% من اتصال)`);
console.log(`  بعد: ${Math.round(1000*cached)} ms/ثانية (${(cached*100).toFixed(0)}% من اتصال)`);
console.log(`\nإحصاءات: ${JSON.stringify(cache.stats)}`);

// الإبطال
await cache.invalidate(u.id);
const before=cache.stats.misses;
await cache.getAuthUser(u.id);
console.log(`الإبطال يجبر القراءة من القاعدة: ${cache.stats.misses>before?'✅':'🔴'}`);
await redisClient.quit(); await prisma.$disconnect();
