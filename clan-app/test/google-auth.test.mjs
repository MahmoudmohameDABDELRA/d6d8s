import 'dotenv/config';
process.env.JWT_ACCESS_SECRET='t_access_1234567890_abcdefghijklm';
process.env.JWT_REFRESH_SECRET='t_refresh_0987654321_zyxwvutsrqpo';
process.env.GOOGLE_CLIENT_ID='fake-client-id.apps.googleusercontent.com';
process.env.NODE_ENV='test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/x';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

// نستبدل التحقق من جوجل بمزيّف — لا نريد شبكة حقيقية في الاختبار
const { register } = await import('node:module');
register('./google-mock-loader.mjs', import.meta.url);

const request=(await import('supertest')).default;
const prisma=(await import('../src/config/prisma.js')).default;
const app=(await import('../src/app.js')).default;

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

await prisma.clanMember.deleteMany();
await prisma.refreshToken.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

let token, cookie;

console.log('\n━━━ الدخول بجوجل ━━━');

await t('🔥 أول دخول ينشئ حساباً (201) ويطلب إكمال البيانات', async()=>{
  const r=await request(app).post('/api/auth/google').send({idToken:'valid:g111:omar@gmail.com:Omar'});
  eq(r.status,201,'status');
  eq(r.body.isNewUser,true,'isNewUser');
  eq(r.body.needsOnboarding,true,'needsOnboarding');
  eq(r.body.user.domain,null,'المجال فارغ');
  if(!r.body.accessToken)throw new Error('لا يوجد توكن');
  token=r.body.accessToken;cookie=r.headers['set-cookie'];
});

await t('كلمة المرور null والمزوّد GOOGLE', async()=>{
  const u=await prisma.user.findUnique({where:{email:'omar@gmail.com'}});
  eq(u.password,null,'password');
  eq(u.authProvider,'GOOGLE','provider');
  eq(u.isVerified,true,'موثّق تلقائياً');
  eq(u.googleId,'g111','googleId');
});

await t('🔥 الدخول الثاني لا ينشئ حساباً جديداً (200)', async()=>{
  const r=await request(app).post('/api/auth/google').send({idToken:'valid:g111:omar@gmail.com:Omar'});
  eq(r.status,200,'status');
  eq(r.body.isNewUser,false,'isNewUser');
  eq(await prisma.user.count(),1,'مستخدم واحد فقط');
});

await t('اسم مستخدم مولَّد تلقائياً', async()=>{
  const u=await prisma.user.findUnique({where:{email:'omar@gmail.com'}});
  if(!u.username||u.username.length<3)throw new Error(`اسم غير صالح: ${u.username}`);
});

await t('🔥 تعارض الأسماء يُحل تلقائياً', async()=>{
  await request(app).post('/api/auth/google').send({idToken:'valid:g222:omar@other.com:Omar'});
  const users=await prisma.user.findMany({select:{username:true}});
  eq(new Set(users.map(u=>u.username)).size,users.length,'كل الأسماء فريدة');
});

await t('توكن جوجل غير صالح يُرفض 401', async()=>{
  const r=await request(app).post('/api/auth/google').send({idToken:'invalid'});
  eq(r.status,401,'status');
});

await t('بريد غير مُتحقَّق منه يُرفض', async()=>{
  const r=await request(app).post('/api/auth/google').send({idToken:'unverified:g333:x@gmail.com:X'});
  eq(r.status,401,'status');
  eq(r.body.code,'GOOGLE_EMAIL_UNVERIFIED','code');
});

console.log('\n━━━ حارس إكمال البيانات ━━━');

await t('🔥 العشائر محجوبة قبل اختيار المجال (403)', async()=>{
  const r=await request(app).post('/api/clans/global/auto-assign').set('Authorization',`Bearer ${token}`);
  eq(r.status,403,'status');
  eq(r.body.code,'ONBOARDING_REQUIRED','code');
});

await t('مجال غير صالح يُرفض 400', async()=>{
  const r=await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${token}`).send({domain:'WRONG'});
  eq(r.status,400,'status');
});

await t('تخصص لا ينتمي للمجال يُرفض', async()=>{
  const r=await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${token}`)
    .send({domain:'TECH',specialty:'PHYSICIAN'});
  eq(r.status,400,'status');
  eq(r.body.code,'INVALID_SPECIALTY','code');
});

await t('🔥 إكمال البيانات ينجح', async()=>{
  const r=await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${token}`)
    .send({domain:'TECH',specialty:'SOFTWARE_DEV',username:'omar_dev'});
  eq(r.status,200,'status');
  eq(r.body.user.domain,'TECH','domain');
  eq(r.body.user.onboarded,true,'onboarded');
  eq(r.body.user.username,'omar_dev','username');
});

await t('🔥 العشائر تعمل بعد الإكمال', async()=>{
  const r=await request(app).post('/api/clans/global/auto-assign').set('Authorization',`Bearer ${token}`);
  eq(r.status,200,'status');
  eq(r.body.clan.category,'TECH','المجال');
});

await t('needsOnboarding = false في الدخول التالي', async()=>{
  const r=await request(app).post('/api/auth/google').send({idToken:'valid:g111:omar@gmail.com:Omar'});
  eq(r.body.needsOnboarding,false);
});

console.log('\n━━━ مسار البريد المعطَّل ━━━');

await t('🔥 /register يُرجع 410 مع سبب واضح', async()=>{
  const r=await request(app).post('/api/auth/register')
    .send({username:'x',email:'x@t.com',password:'password123',domain:'TECH'});
  eq(r.status,410,'status');
  eq(r.body.code,'EMAIL_AUTH_DISABLED','code');
});

await t('/login يُرجع 410 كذلك', async()=>{
  const r=await request(app).post('/api/auth/login').send({email:'x@t.com',password:'x'});
  eq(r.status,410,'status');
});

await t('🔥 كود البريد محفوظ ولم يُحذف', async()=>{
  const src=await import('node:fs').then(fs=>fs.readFileSync('src/modules/auth/auth.controller.js','utf8'));
  if(!src.includes('export const register'))throw new Error('register محذوف!');
  if(!src.includes('export const login'))throw new Error('login محذوف!');
  if(!src.includes('argon2.hash'))throw new Error('تجزئة كلمة المرور محذوفة!');
});

console.log('\n━━━ الجلسة ━━━');

await t('/me يعمل بتوكن جوجل', async()=>{
  const r=await request(app).get('/api/auth/me').set('Authorization',`Bearer ${token}`);
  eq(r.status,200,'status');
  eq(r.body.user.authProvider,'GOOGLE','provider');
  if('password' in r.body.user)throw new Error('كلمة المرور مسرَّبة!');
});

await t('refresh يعمل', async()=>{
  const r=await request(app).post('/api/auth/refresh').set('Cookie',cookie);
  eq(r.status,200,'status');
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(48)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(48)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
