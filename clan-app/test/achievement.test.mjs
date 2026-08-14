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

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

await prisma.taskStep.deleteMany();await prisma.taskHistory.deleteMany();
await prisma.focusSession.deleteMany();await prisma.task.deleteMany();
await prisma.sparkTransaction.deleteMany();await prisma.userAchievement.deleteMany();
await prisma.clanMember.deleteMany();await prisma.refreshToken.deleteMany();
await prisma.clan.deleteMany();await prisma.user.deleteMany();

const reg=await request(app).post('/api/auth/google').send({idToken:'valid:a1:ach@t.com:Ach'});
const TOK=reg.body.accessToken; const uid=reg.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK}`).send({domain:'HEALTH'});
const A=(r)=>r.set('Authorization',`Bearer ${TOK}`);

console.log('\n━━━ 🏆 خزانة الأوسمة ━━━');

await t('GET /achievements يرجع 15 وساماً', async()=>{
  const r=await A(request(app).get('/api/achievements'));
  eq(r.status,200,'status');
  eq(r.body.total,15,'العدد');
  eq(r.body.unlocked,0,'المفتوح');
});

await t('مقسّمة على 5 فئات', async()=>{
  const r=await A(request(app).get('/api/achievements'));
  eq(Object.keys(r.body.byCategory).sort(),
     ['EARLY_BIRD','FOCUS','REFLECTION','STREAK','TRIBE']);
});

await t('كل وسام فيه تقدم ونسبة', async()=>{
  const r=await A(request(app).get('/api/achievements'));
  const a=r.body.achievements[0];
  for(const k of ['code','title','targetValue','progress','percent','isUnlocked'])
    if(!(k in a))throw new Error(`${k} مفقود`);
});

await t('🔥 التقدم يتحدث مع التركيز', async()=>{
  await prisma.user.update({where:{id:uid},data:{totalFocusMin:300}});
  await A(request(app).post('/api/achievements/recalculate'));
  const r=await A(request(app).get('/api/achievements'));
  const b=r.body.achievements.find(a=>a.code==='FOCUS_BRONZE');
  eq([b.progress,b.percent,b.isUnlocked],[300,50,false],'نصف الطريق');
});

await t('🔥 بلوغ الهدف يفتح الوسام + 100 شرارة', async()=>{
  const before=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  await prisma.user.update({where:{id:uid},data:{totalFocusMin:600}});
  const r=await A(request(app).post('/api/achievements/recalculate'));
  eq(r.body.newlyUnlocked.map(a=>a.code),['FOCUS_BRONZE'],'المفتوح');
  const after=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  eq(after-before,100,'البونص');
});

await t('لا يُفتح مرتين', async()=>{
  const r=await A(request(app).post('/api/achievements/recalculate'));
  eq(r.body.newlyUnlocked.length,0);
});

await t('🔥 تجاوز عدة مستويات يفتحها كلها', async()=>{
  await prisma.user.update({where:{id:uid},data:{totalFocusMin:12000}});
  const r=await A(request(app).post('/api/achievements/recalculate'));
  eq(r.body.newlyUnlocked.map(a=>a.code).sort(),['FOCUS_GOLD','FOCUS_SILVER']);
});

console.log('\n━━━ 🎖️ أوسمة البروفايل ━━━');

await t('تعيين 3 أوسمة مفتوحة', async()=>{
  const r=await A(request(app).put('/api/achievements/showcase'))
    .send({codes:['FOCUS_BRONZE','FOCUS_SILVER','FOCUS_GOLD']});
  eq(r.status,200,'status');
  eq(r.body.showcaseIds.length,3);
});

await t('🔥 وسام مقفول يُرفض', async()=>{
  const r=await A(request(app).put('/api/achievements/showcase')).send({codes:['STREAK_GOLD']});
  eq(r.status,400,'status');
  eq(r.body.code,'ACHIEVEMENT_LOCKED','code');
});

await t('أكثر من 3 يُرفض', async()=>{
  const r=await A(request(app).put('/api/achievements/showcase'))
    .send({codes:['FOCUS_BRONZE','FOCUS_SILVER','FOCUS_GOLD','STREAK_BRONZE']});
  eq(r.status,400);
});

await t('مصفوفة فارغة مسموحة (إزالة)', async()=>{
  eq((await A(request(app).put('/api/achievements/showcase')).send({codes:[]})).status,200);
});

console.log('\n━━━ 📊 الملخص الشامل ━━━');

await t('GET /me/stats يرجع كل شيء', async()=>{
  const r=await A(request(app).get('/api/auth/me/stats'));
  eq(r.status,200,'status');
  for(const k of ['profile','sparks','focus','tasks','today','achievements','clans','streak'])
    if(!(k in r.body))throw new Error(`${k} مفقود`);
});

await t('الساعات محسوبة صحيحاً', async()=>{
  const r=await A(request(app).get('/api/auth/me/stats'));
  eq(r.body.focus.totalHours,200,'12000 دقيقة = 200 ساعة');
});

await t('عدد الأوسمة المفتوحة صحيح', async()=>{
  const r=await A(request(app).get('/api/auth/me/stats'));
  eq(r.body.achievements.unlocked,3,'الثلاثة');
});

await t('🔥 الملخص يعكس نشاط اليوم', async()=>{
  const tk=await A(request(app).post('/api/tasks')).send({title:'مهمة اليوم'});
  await A(request(app).patch(`/api/tasks/${tk.body.task.id}/complete`));
  const r=await A(request(app).get('/api/auth/me/stats'));
  eq(r.body.today.tasksCompleted,1,'مهام اليوم');
});

await t('🔥 وسام المذكرات يعتمد على JournalEntry', async()=>{
  for(let i=0;i<10;i++){
    const d=new Date();d.setDate(d.getDate()-i);
    await prisma.journalEntry.create({data:{userId:uid,date:new Date(d.toISOString().slice(0,10))}});
  }
  const r=await A(request(app).post('/api/achievements/recalculate'));
  if(!r.body.newlyUnlocked.some(a=>a.code==='REFLECTION_BRONZE'))
    throw new Error('لم يُفتح');
});

await prisma.journalEntry.deleteMany();
await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(50)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
