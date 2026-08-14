import 'dotenv/config';
process.env.JWT_ACCESS_SECRET='t_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET='t_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID='fake.apps.googleusercontent.com';
process.env.NODE_ENV='test';
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/x';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const { register } = await import('node:module');
register('./google-mock-loader.mjs', import.meta.url);

const request=(await import('supertest')).default;
const prisma=(await import('../src/config/prisma.js')).default;
const app=(await import('../src/app.js')).default;
const streak=await import('../src/services/streak.service.js');

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

await prisma.focusSession.deleteMany();
await prisma.pulseReservation.deleteMany();
await prisma.pulseSession.deleteMany();
await prisma.userAchievement.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.refreshToken.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

// مستخدم مكتمل البيانات
const reg=await request(app).post('/api/auth/google').send({idToken:'valid:g1:focus@t.com:Focus'});
const TOK=reg.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK}`).send({domain:'TECH'});
const A=(r)=>r.set('Authorization',`Bearer ${TOK}`);
const uid=reg.body.user.id;

console.log('\n━━━ بدء الجلسة ━━━');
let sid;

await t('بدء جلسة 30 دقيقة (201)', async()=>{
  const r=await A(request(app).post('/api/focus/start')).send({plannedMin:30});
  eq(r.status,201,'status');
  if(!r.body.session.id)throw new Error('لا يوجد id');
  sid=r.body.session.id;
});

await t('🔥 جلسة ثانية متزامنة تُرفض 409', async()=>{
  const r=await A(request(app).post('/api/focus/start')).send({plannedMin:30});
  eq(r.status,409,'status');
  eq(r.body.code,'SESSION_ALREADY_ACTIVE','code');
});

await t('مدة أقل من 5 دقائق تُرفض', async()=>{
  await prisma.focusSession.updateMany({where:{userId:uid},data:{status:'CANCELLED'}});
  eq((await A(request(app).post('/api/focus/start')).send({plannedMin:2})).status,400);
});

await t('مدة أكثر من 240 دقيقة تُرفض', async()=>{
  eq((await A(request(app).post('/api/focus/start')).send({plannedMin:500})).status,400);
});

await t('GET /active يرجع الجلسة مع المتبقي', async()=>{
  await prisma.focusSession.deleteMany({where:{userId:uid}});
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:30});
  sid=s.body.session.id;
  const r=await A(request(app).get('/api/focus/active'));
  eq(r.status,200,'status');
  eq(r.body.session.plannedMin,30,'المدة');
  eq(r.body.session.remainingMin,30,'المتبقي');
});

console.log('\n━━━ 🔥 التحقق من المدة (الحماية من الغش) ━━━');

await t('🔥 ادعاء 999 دقيقة في جلسة 30 → يُحسب 30 فقط', async()=>{
  // نحاكي مرور 30 دقيقة فعلياً
  await prisma.focusSession.update({where:{id:sid},data:{startedAt:new Date(Date.now()-30*60000)}});
  const r=await A(request(app).post(`/api/focus/${sid}/complete`)).send({clientReportedMin:999});
  eq(r.status,200,'status');
  eq(r.body.session.verifiedMin,30,'المدة المعتمدة');
  eq(r.body.session.earnedSparks,14,'الشرارات (30×0.45)');
});

await t('الرصيد زاد 14 شرارة فعلياً', async()=>{
  const u=await prisma.user.findUnique({where:{id:uid}});
  eq([u.sparksBalance,u.totalFocusMin],[14,30]);
});

await t('🔥 المدة المنقضية سقف أيضاً — جلسة بدأت للتو', async()=>{
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:60});
  const r=await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:60});
  // انقضت 0 دقيقة فقط → السقف 0+1 = 1
  if(r.body.session.verifiedMin>1)throw new Error(`قبل ${r.body.session.verifiedMin} دقيقة رغم عدم انقضائها`);
});

await t('🔥 جلسة النبض تعطي 0.75/دقيقة', async()=>{
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:30,type:'PULSE'});
  await prisma.focusSession.update({where:{id:s.body.session.id},data:{startedAt:new Date(Date.now()-30*60000)}});
  const r=await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:30});
  eq(r.body.session.earnedSparks,23,'22.5 مقرّبة لأعلى');
});

await t('إنهاء جلسة منتهية يُرفض 409', async()=>{
  eq((await A(request(app).post(`/api/focus/${sid}/complete`)).send({})).status,409);
});

console.log('\n━━━ 🔒 الوضع الصارم ━━━');
let strictId;

await t('بدء جلسة صارمة', async()=>{
  const r=await A(request(app).post('/api/focus/start')).send({plannedMin:30,strictMode:true});
  strictId=r.body.session.id;
  eq(r.body.session.strictMode,true);
});

await t('الخرق الأول: تحذير 1/3', async()=>{
  const r=await A(request(app).post(`/api/focus/${strictId}/violation`));
  eq([r.body.violations,r.body.failed,r.body.remaining],[1,false,2]);
});

await t('الخرق الثاني: تحذير 2/3', async()=>{
  const r=await A(request(app).post(`/api/focus/${strictId}/violation`));
  eq([r.body.violations,r.body.failed,r.body.remaining],[2,false,1]);
});

await t('🔥 الخرق الثالث: الجلسة تفشل بلا شرارات', async()=>{
  const before=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  const r=await A(request(app).post(`/api/focus/${strictId}/violation`));
  eq(r.body.failed,true,'failed');
  const s=await prisma.focusSession.findUnique({where:{id:strictId}});
  eq([s.status,s.earnedSparks],['FAILED',0],'الحالة');
  const after=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  eq(after,before,'الرصيد لم يتغير');
});

await t('الوضع العادي: الخرق يُسجَّل بلا عقوبة', async()=>{
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:30,strictMode:false});
  for(let i=0;i<5;i++)await A(request(app).post(`/api/focus/${s.body.session.id}/violation`));
  const sess=await prisma.focusSession.findUnique({where:{id:s.body.session.id}});
  eq([sess.status,sess.violations],['ACTIVE',5]);
  await A(request(app).post(`/api/focus/${s.body.session.id}/cancel`));
});

console.log('\n━━━ 🔥 السلسلة بالتوقيت المحلي ━━━');

await t('حساب التاريخ المحلي صحيح', ()=>{
  // 2026-01-15 23:00 UTC = 2026-01-16 01:00 بتوقيت القاهرة
  const d=new Date('2026-01-15T23:00:00Z');
  eq(streak.localDate('Africa/Cairo',d).toISOString().slice(0,10),'2026-01-16','القاهرة');
  eq(streak.localDate('UTC',d).toISOString().slice(0,10),'2026-01-15','UTC');
});

await t('أول جلسة تبدأ السلسلة = 1', async()=>{
  const u=await prisma.user.findUnique({where:{id:uid}});
  eq(u.currentStreak,1);
});

await t('🔥 جلسة ثانية نفس اليوم لا تزيدها', async()=>{
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:10});
  await prisma.focusSession.update({where:{id:s.body.session.id},data:{startedAt:new Date(Date.now()-10*60000)}});
  const r=await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:10});
  eq(r.body.streak.current,1,'السلسلة');
  eq(r.body.streak.isNewDay,false,'ليس يوماً جديداً');
});

await t('🔥 نشاط الأمس ثم اليوم → السلسلة 2', async()=>{
  const y=new Date(streak.localDate('UTC'));y.setUTCDate(y.getUTCDate()-1);
  await prisma.user.update({where:{id:uid},data:{lastActiveDate:y,currentStreak:1,timezone:'UTC'}});
  const r=await streak.touch(uid);
  eq([r.current,r.wasBroken],[2,false]);
});

await t('🔥 فجوة 3 أيام تكسر السلسلة → تعود 1', async()=>{
  const old=new Date(streak.localDate('UTC'));old.setUTCDate(old.getUTCDate()-3);
  await prisma.user.update({where:{id:uid},data:{lastActiveDate:old,currentStreak:10}});
  const r=await streak.touch(uid);
  eq([r.current,r.wasBroken],[1,true]);
});

await t('🔥 أطول سلسلة تُحفظ ولا تنقص بالكسر', async()=>{
  // نبني سلسلة 5 أيام ثم نكسرها
  await prisma.user.update({where:{id:uid},data:{currentStreak:4,longestStreak:4,lastActiveDate:(()=>{const d=new Date(streak.localDate('UTC'));d.setUTCDate(d.getUTCDate()-1);return d})()}});
  const grown=await streak.touch(uid);
  eq([grown.current,grown.longest],[5,5],'بعد النمو');

  const old=new Date(streak.localDate('UTC'));old.setUTCDate(old.getUTCDate()-9);
  await prisma.user.update({where:{id:uid},data:{lastActiveDate:old}});
  const broken=await streak.touch(uid);
  eq(broken.current,1,'انكسرت');
  eq(broken.longest,5,'الأطول محفوظة');
});

console.log('\n━━━ 🏆 الأوسمة ━━━');

await t('🔥 600 دقيقة تفتح وسام البرونز + 100 شرارة', async()=>{
  await prisma.user.update({where:{id:uid},data:{totalFocusMin:0}});
  await prisma.userAchievement.deleteMany({where:{userId:uid}});
  const before=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;

  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:240});
  await prisma.focusSession.update({where:{id:s.body.session.id},data:{startedAt:new Date(Date.now()-240*60000)}});
  await prisma.user.update({where:{id:uid},data:{totalFocusMin:360}});
  const r=await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:240});

  const codes=r.body.unlockedAchievements.map(a=>a.code);
  if(!codes.includes('FOCUS_BRONZE'))throw new Error(`لم يُفتح. المفتوح: ${codes}`);
  const after=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  if(after-before<100)throw new Error('البونص لم يُمنح');
});

await t('الوسام لا يُفتح مرتين', async()=>{
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:10});
  await prisma.focusSession.update({where:{id:s.body.session.id},data:{startedAt:new Date(Date.now()-10*60000)}});
  const r=await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:10});
  eq(r.body.unlockedAchievements.filter(a=>a.code==='FOCUS_BRONZE').length,0);
});

console.log('\n━━━ الإحصائيات والسجل ━━━');

await t('GET /stats يرجع ملخصاً كاملاً', async()=>{
  const r=await A(request(app).get('/api/focus/stats'));
  eq(r.status,200,'status');
  if(!r.body.stats.streak)throw new Error('السلسلة مفقودة');
  if(r.body.stats.totalFocusMin<600)throw new Error('الدقائق');
});

await t('GET /history يرجع الجلسات', async()=>{
  const r=await A(request(app).get('/api/focus/history'));
  eq(r.status,200,'status');
  if(r.body.sessions.length===0)throw new Error('فارغ');
});

await t('🔥 مستخدم آخر لا يصل لجلستي (404)', async()=>{
  const o=await request(app).post('/api/auth/google').send({idToken:'valid:g2:other@t.com:Other'});
  await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${o.body.accessToken}`).send({domain:'STUDY'});
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:30});
  const r=await request(app).post(`/api/focus/${s.body.session.id}/complete`)
    .set('Authorization',`Bearer ${o.body.accessToken}`).send({});
  eq(r.status,404,'status');
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(50)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
