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
const al=await import('../src/services/alarm.service.js');

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

for(const m of ['wakeChallengeParticipant','wakeChallenge','wakeLog','battleAlarm','clanMember','clan','sparkTransaction','userAchievement','refreshToken','user'])
  await prisma[m].deleteMany();

const mk=async(id,email)=>{
  const r=await request(app).post('/api/auth/google').send({idToken:`valid:${id}:${email}:${id}`});
  await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${r.body.accessToken}`).send({domain:'STUDY'});
  await prisma.user.update({where:{id:r.body.user.id},data:{timezone:'UTC'}});
  return {tok:r.body.accessToken,uid:r.body.user.id};
};
const A=await mk('n1','a@t.com'), B=await mk('n2','b@t.com');
const a=(r)=>r.set('Authorization',`Bearer ${A.tok}`);
const b=(r)=>r.set('Authorization',`Bearer ${B.tok}`);

/** يحل مسألة الاستيقاظ ويرسلها */
const solveWake=async(user,{alarmId,scheduledTime}={})=>{
  const H=(r)=>r.set('Authorization',`Bearer ${user.tok}`);
  const task=await H(request(app).get('/api/alarms/wake-task'));
  const m=task.body.task.question.match(/(\d+)\s*([×+−])\s*(\d+)/);
  const [,x,op,y]=m;
  const ans=op==='×'?+x*+y:op==='+'?+x+ +y:+x-+y;
  return H(request(app).post('/api/alarms/wake-task/solve'))
    .send({token:task.body.task.token,answer:ans,alarmId,
           scheduledTime:scheduledTime??al.localTimeOf('UTC')});
};

console.log('\n━━━ ⏰ إدارة المنبهات ━━━');
let alarmId;

await t('إنشاء منبه 06:00 (الأحد–الخميس)', async()=>{
  const r=await a(request(app).post('/api/alarms')).send({time:'06:00',days:[0,1,2,3,4]});
  eq(r.status,201,'status');
  eq([r.body.alarm.time,r.body.alarm.days],['06:00',[0,1,2,3,4]]);
  alarmId=r.body.alarm.id;
});

await t('صيغ وقت خاطئة تُرفض', async()=>{
  for(const bad of ['25:00','6:00','ab:cd','','24:01'])
    eq((await a(request(app).post('/api/alarms')).send({time:bad,days:[1]})).status,400,bad);
});

await t('بلا أيام أو أيام خارج 0-6 تُرفض', async()=>{
  eq((await a(request(app).post('/api/alarms')).send({time:'07:00',days:[]})).status,400,'فارغ');
  eq((await a(request(app).post('/api/alarms')).send({time:'07:00',days:[9,-1]})).status,400,'خارج المدى');
});

await t('🔥 منبه مكرر (نفس الوقت واليوم) يُرفض', async()=>{
  const r=await a(request(app).post('/api/alarms')).send({time:'06:00',days:[1]});
  eq(r.status,409,'status'); eq(r.body.code,'DUPLICATE_ALARM','code');
});

await t('🔥 حد 5 منبهات', async()=>{
  const now=await prisma.battleAlarm.count({where:{userId:A.uid}});
  for(let i=now;i<5;i++)
    await a(request(app).post('/api/alarms')).send({time:`${String(i+10).padStart(2,'0')}:30`,days:[6]});
  eq(await prisma.battleAlarm.count({where:{userId:A.uid}}),5,'وصل الحد');
  const r=await a(request(app).post('/api/alarms')).send({time:'23:45',days:[6]});
  eq(r.status,409,'status'); eq(r.body.code,'MAX_ALARMS','code');
});

await t('التعديل والتعطيل يعملان', async()=>{
  eq((await a(request(app).patch(`/api/alarms/${alarmId}`)).send({time:'05:30'})).body.alarm.time,'05:30');
  eq((await a(request(app).patch(`/api/alarms/${alarmId}`)).send({isActive:false})).body.alarm.isActive,false);
  await a(request(app).patch(`/api/alarms/${alarmId}`)).send({isActive:true});
});

await t('🔥 منبه مستخدم آخر محمي (404)', async()=>{
  eq((await b(request(app).patch(`/api/alarms/${alarmId}`)).send({time:'09:00'})).status,404,'تعديل');
  eq((await b(request(app).delete(`/api/alarms/${alarmId}`))).status,404,'حذف');
});

await t('🔥 القائمة تحدد أي منبه يرنّ اليوم', async()=>{
  const r=await a(request(app).get('/api/alarms'));
  eq(r.status,200,'status');
  if(!/^\d{2}:\d{2}$/.test(r.body.localTime))throw new Error('صيغة الوقت');
  const today=r.body.todayWeekday;
  const main=r.body.alarms.find(x=>x.id===alarmId);
  eq(main.firesToday,main.days.includes(today),'firesToday');
  eq(r.body.settings.snoozeAllowed,false,'لا تأجيل');
});

console.log('\n━━━ 🧮 حساب التوقيت ━━━');

await t('🔥 في الموعد بالضبط', ()=>{
  eq(al.isOnTime('06:00','UTC',new Date('2026-01-15T06:00:00Z')),{onTime:true,delayMin:0});
});

await t('🔥 تأخر 10 دقائق مقبول · 11 مرفوض', ()=>{
  eq(al.isOnTime('06:00','UTC',new Date('2026-01-15T06:10:00Z')).onTime,true,'10 دقائق');
  eq(al.isOnTime('06:00','UTC',new Date('2026-01-15T06:11:00Z')).onTime,false,'11 دقيقة');
});

await t('الاستيقاظ المبكر مقبول دائماً', ()=>{
  eq(al.isOnTime('06:00','UTC',new Date('2026-01-15T04:00:00Z')).onTime,true);
});

await t('🔥 التوقيت المحلي يحترم المنطقة', ()=>{
  const n=new Date('2026-01-15T04:00:00Z');
  eq(al.localTimeOf('UTC',n),'04:00','UTC');
  eq(al.localTimeOf('Africa/Cairo',n),'06:00','القاهرة');
  eq(al.localTimeOf('Asia/Tokyo',n),'13:00','طوكيو');
});

await t('🔥 نفس اللحظة: في الموعد بالقاهرة ومتأخر بـ UTC', ()=>{
  const n=new Date('2026-01-15T04:00:00Z');
  eq(al.isOnTime('06:00','Africa/Cairo',n).onTime,true,'القاهرة');
  eq(al.isOnTime('03:00','UTC',n).onTime,false,'UTC متأخر 60 دقيقة');
});

await t('🔥🔥 عبور منتصف الليل — منبه أمس والآن بعد منتصف الليل', ()=>{
  // منبه 22:00 والساعة 01:15 = تأخر 195 دقيقة لا استيقاظ مبكر
  const r=al.isOnTime('22:00','UTC',new Date('2026-01-16T01:15:00Z'));
  eq([r.onTime,r.delayMin],[false,195]);
});

await t('🔥 منبه 23:50 والآن 00:05 = تأخر 15 دقيقة', ()=>{
  const r=al.isOnTime('23:50','UTC',new Date('2026-01-16T00:05:00Z'));
  eq([r.onTime,r.delayMin],[false,15]);
});

await t('🔥 منبه 00:30 والآن 00:35 = تأخر 5 مقبول', ()=>{
  eq(al.isOnTime('00:30','UTC',new Date('2026-01-15T00:35:00Z')),{onTime:true,delayMin:5});
});

await t('يوم الأسبوع صحيح', ()=>{
  eq(al.localWeekdayOf('UTC',new Date('2026-01-15T12:00:00Z')),4,'خميس');
  eq(al.localWeekdayOf('UTC',new Date('2026-01-18T12:00:00Z')),0,'أحد');
});

console.log('\n━━━ 🔐 أمان مسألة الاستيقاظ ━━━');

await t('السؤال يُولَّد في الخادم ومعه توقيع', async()=>{
  const r=await a(request(app).get('/api/alarms/wake-task'));
  eq(r.status,200,'status');
  if(!r.body.task.question)throw new Error('لا سؤال');
  if(!r.body.task.token.includes('.'))throw new Error('التوقيع مفقود');
});

await t('🔥🔥 token مزوَّر يُرفض (HMAC)', async()=>{
  const fake=Buffer.from(JSON.stringify({a:4,t:Date.now()})).toString('base64url')+'.zzzz';
  const r=await a(request(app).post('/api/alarms/wake-task/solve'))
    .send({token:fake,answer:4,scheduledTime:'06:00'});
  eq(r.status,400,'status'); eq(r.body.code,'INVALID_TOKEN','code');
});

await t('🔥 token بلا توقيع يُرفض', async()=>{
  const naked=Buffer.from(JSON.stringify({a:4,t:Date.now()})).toString('base64url');
  const r=await a(request(app).post('/api/alarms/wake-task/solve'))
    .send({token:naked,answer:4,scheduledTime:'06:00'});
  eq(r.status,400);
});

await t('إجابة خاطئة تُرفض', async()=>{
  const task=await a(request(app).get('/api/alarms/wake-task'));
  const r=await a(request(app).post('/api/alarms/wake-task/solve'))
    .send({token:task.body.task.token,answer:999999,scheduledTime:'06:00'});
  eq(r.status,400,'status'); eq(r.body.code,'WRONG_ANSWER','code');
});

console.log('\n━━━ 🌅 تسجيل الاستيقاظ ━━━');

await t('🔥 الاستيقاظ في الموعد = 5 شرارات', async()=>{
  const before=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  const r=await solveWake(A,{alarmId});
  eq(r.status,200,'status');
  eq([r.body.onTime,r.body.sparks],[true,5]);
  const after=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  eq(after-before,5,'الرصيد');
});

await t('السلسلة بدأت من 1', async()=>{
  eq((await prisma.battleAlarm.findUnique({where:{id:alarmId}})).wakeStreak,1);
});

await t('🔥 تسجيل ثانٍ في نفس اليوم لا يكرر', async()=>{
  const before=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  const r=await solveWake(A,{alarmId});
  eq(r.body.alreadyLogged,true,'مسجَّل');
  eq((await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance,before,'لا شرارات مكررة');
});

await t('🔥 التأخر لا يمنح شرارات', async()=>{
  const before=(await prisma.user.findUnique({where:{id:B.uid}})).sparksBalance;
  // موعد قبل ساعة واحدة — تأخر 60 دقيقة بلا عبور منتصف الليل
  const now=al.toMinutes(al.localTimeOf('UTC'));
  const target=(now-60+1440)%1440;
  const past=`${String(Math.floor(target/60)).padStart(2,'0')}:${String(target%60).padStart(2,'0')}`;
  const r=await solveWake(B,{scheduledTime:past});
  eq(r.body.onTime,false,'متأخر');
  eq(r.body.sparks,0,'صفر');
  eq((await prisma.user.findUnique({where:{id:B.uid}})).sparksBalance,before,'الرصيد');
});

await t('🔥 فوات المنبه يكسر السلسلة', async()=>{
  await prisma.wakeLog.deleteMany({where:{userId:A.uid}});
  await prisma.battleAlarm.update({where:{id:alarmId},data:{wakeStreak:9}});
  await a(request(app).post('/api/alarms/missed')).send({alarmId,scheduledTime:'06:00'});
  eq((await prisma.battleAlarm.findUnique({where:{id:alarmId}})).wakeStreak,0);
});

await t('🔥 أطول سلسلة محفوظة رغم الكسر', async()=>{
  eq((await prisma.battleAlarm.findUnique({where:{id:alarmId}})).longestWakeStreak>=1,true);
});

await t('🔥 الاستيقاظ يحافظ على السلسلة العامة', async()=>{
  await prisma.wakeLog.deleteMany({where:{userId:A.uid}});
  await prisma.user.update({where:{id:A.uid},data:{currentStreak:0,lastActiveDate:null}});
  await solveWake(A,{alarmId});
  eq((await prisma.user.findUnique({where:{id:A.uid}})).currentStreak,1);
});

console.log('\n━━━ 📊 السجل ━━━');

await t('الإحصائيات كاملة', async()=>{
  const r=await a(request(app).get('/api/alarms/history'));
  eq(r.status,200,'status');
  for(const k of ['total','woke','missed','successRate','currentStreak','longestStreak'])
    if(!(k in r.body.stats))throw new Error(`${k} مفقود`);
});

console.log('\n━━━ 🏆 أوسمة الاستيقاظ ━━━');

await t('3 أوسمة مزروعة (15 إجمالاً)', async()=>{
  eq(await prisma.achievement.count({where:{category:'EARLY_BIRD'}}),3,'الفئة');
  eq(await prisma.achievement.count(),15,'الإجمالي');
});

await t('🔥 7 أيام تفتح البرونز + 100 شرارة', async()=>{
  await prisma.userAchievement.deleteMany({where:{userId:A.uid}});
  await prisma.battleAlarm.update({where:{id:alarmId},data:{longestWakeStreak:7}});
  const before=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  const r=await a(request(app).post('/api/achievements/recalculate'));
  if(!r.body.newlyUnlocked.some(x=>x.code==='EARLY_BIRD_BRONZE'))
    throw new Error(`لم يُفتح: ${r.body.newlyUnlocked.map(x=>x.code)}`);
  eq((await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance-before>=100,true,'البونص');
});

await t('🔥 الاستيقاظ يفتح الوسام تلقائياً بلا recalculate', async()=>{
  await prisma.userAchievement.deleteMany({where:{userId:A.uid}});
  await prisma.wakeLog.deleteMany({where:{userId:A.uid}});
  await prisma.battleAlarm.update({where:{id:alarmId},data:{wakeStreak:29,longestWakeStreak:29}});
  const r=await solveWake(A,{alarmId});
  const codes=(r.body.unlockedAchievements??[]).map(x=>x.code);
  if(!codes.includes('EARLY_BIRD_SILVER'))throw new Error(`المفتوح: ${codes}`);
});

console.log('\n━━━ 🤝 التحدي الجماعي ━━━');
let chId;

await t('إعداد عشيرة خاصة بعضوين', async()=>{
  const cl=await a(request(app).post('/api/clans/private/create')).send({name:'فريق الفجر'});
  await b(request(app).post('/api/clans/private/join')).send({inviteCode:cl.body.clan.inviteCode});
  eq(await prisma.clanMember.count({where:{clanId:cl.body.clan.id}}),2);
});

await t('🔥 المالك ينشئ تحدي 7 أيام', async()=>{
  const clan=await prisma.clan.findFirst({where:{type:'PRIVATE'}});
  const r=await a(request(app).post('/api/alarms/challenges'))
    .send({clanId:clan.id,title:'تحدي الفجر',targetTime:'05:00',durationDays:7});
  eq(r.status,201,'status');
  eq([r.body.challenge.durationDays,r.body.challenge.rewardSparks],[7,100]);
  chId=r.body.challenge.id;
});

await t('🔥 العضو العادي لا ينشئ (403)', async()=>{
  const clan=await prisma.clan.findFirst({where:{type:'PRIVATE'}});
  const r=await b(request(app).post('/api/alarms/challenges')).send({clanId:clan.id,targetTime:'05:00'});
  eq(r.status,403,'status'); eq(r.body.code,'NOT_CLAN_OWNER','code');
});

await t('🔥 العشيرة العامة بلا تحديات', async()=>{
  await a(request(app).post('/api/clans/global/auto-assign'));
  const g=await prisma.clan.findFirst({where:{type:'GLOBAL'}});
  const r=await a(request(app).post('/api/alarms/challenges')).send({clanId:g.id,targetTime:'05:00'});
  eq(r.status,403,'status'); eq(r.body.code,'GLOBAL_CLAN_NO_CHALLENGES','code');
});

await t('تحدٍّ ثانٍ نشط يُرفض 409', async()=>{
  const clan=await prisma.clan.findFirst({where:{type:'PRIVATE'}});
  eq((await a(request(app).post('/api/alarms/challenges')).send({clanId:clan.id,targetTime:'07:00'})).status,409);
});

await t('العضو ينضم', async()=>{
  eq((await b(request(app).post(`/api/alarms/challenges/${chId}/join`))).status,200,'status');
  eq(await prisma.wakeChallengeParticipant.count({where:{challengeId:chId}}),2,'مشاركان');
});

await t('🔥 الاستيقاظ يزيد أيام النجاح', async()=>{
  await prisma.wakeLog.deleteMany({where:{userId:B.uid}});
  await solveWake(B);
  const p=await prisma.wakeChallengeParticipant.findFirst({where:{challengeId:chId,userId:B.uid}});
  eq(p.successDays,1);
});

await t('🔥 تجاوز الأيام المسموحة يُخرج من التحدي', async()=>{
  await prisma.wakeChallengeParticipant.updateMany(
    {where:{challengeId:chId,userId:B.uid},data:{missedDays:1}});
  await prisma.wakeLog.deleteMany({where:{userId:B.uid}});
  await b(request(app).post('/api/alarms/missed')).send({scheduledTime:'05:00'});
  const p=await prisma.wakeChallengeParticipant.findFirst({where:{challengeId:chId,userId:B.uid}});
  eq([p.missedDays,p.isEliminated],[2,true]);
});

await t('🔥 التحدي المنتهي يمنح 100 شرارة للفائز', async()=>{
  const s=new Date();s.setDate(s.getDate()-8);
  const e=new Date();e.setDate(e.getDate()-1);
  await prisma.wakeChallenge.update({where:{id:chId},data:{
    startDate:new Date(s.toISOString().slice(0,10)),
    endDate:new Date(e.toISOString().slice(0,10))}});
  await prisma.wakeChallengeParticipant.updateMany(
    {where:{challengeId:chId,userId:A.uid},data:{successDays:7,isEliminated:false}});

  const before=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  await al.settleExpiredChallenges();
  eq((await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance-before,100,'المكافأة');
  eq((await prisma.wakeChallenge.findUnique({where:{id:chId}})).status,'COMPLETED','الحالة');
});

await t('🔥 المكافأة لا تُمنح مرتين', async()=>{
  const before=(await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance;
  await al.settleExpiredChallenges();
  eq((await prisma.user.findUnique({where:{id:A.uid}})).sparksBalance,before);
});

await t('🔥 المُقصى لا يُكافأ', async()=>{
  const p=await prisma.wakeChallengeParticipant.findFirst({where:{challengeId:chId,userId:B.uid}});
  eq(p.rewarded,false);
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(52)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(52)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
