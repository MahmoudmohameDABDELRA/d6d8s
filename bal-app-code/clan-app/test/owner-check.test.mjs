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
const fc=await import('../src/services/focusCheck.service.js');

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

for(const m of ['focusCheck','focusSession','clanBan','clanMember','clanInvite','clan','sparkTransaction','userAchievement','refreshToken','task','user'])
  await prisma[m].deleteMany();

const mk=async(id,email,domain)=>{
  const r=await request(app).post('/api/auth/google').send({idToken:`valid:${id}:${email}:${id}`});
  await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${r.body.accessToken}`).send({domain});
  return {tok:r.body.accessToken,uid:r.body.user.id};
};
const owner=await mk('o1','owner@t.com','TECH');
const mem=await mk('m1','member@t.com','TECH');
const out=await mk('x1','out@t.com','STUDY');
const O=(r)=>r.set('Authorization',`Bearer ${owner.tok}`);
const M=(r)=>r.set('Authorization',`Bearer ${mem.tok}`);

console.log('\n━━━ 👑 صلاحيات المالك ━━━');
let clanId, code;

await t('إنشاء عشيرة خاصة', async()=>{
  const r=await O(request(app).post('/api/clans/private/create')).send({name:'فريق النخبة'});
  eq(r.status,201,'status'); clanId=r.body.clan.id; code=r.body.clan.inviteCode;
});

await t('عضو ينضم بالكود', async()=>{
  eq((await M(request(app).post('/api/clans/private/join')).send({inviteCode:code})).status,200);
});

await t('قائمة الأعضاء تُظهر الدور', async()=>{
  const r=await O(request(app).get(`/api/clans/${clanId}/members`));
  eq(r.status,200,'status'); eq(r.body.total,2,'العدد'); eq(r.body.isOwner,true,'مالك');
});

await t('🔥 غير العضو لا يرى الأعضاء (403)', async()=>{
  const r=await request(app).get(`/api/clans/${clanId}/members`).set('Authorization',`Bearer ${out.tok}`);
  eq(r.status,403);
});

await t('تعديل بيانات العشيرة', async()=>{
  const r=await O(request(app).patch(`/api/clans/${clanId}`)).send({name:'النخبة المحدّثة'});
  eq(r.body.clan.name,'النخبة المحدّثة');
});

await t('🔥 العضو العادي لا يعدّل (403)', async()=>{
  const r=await M(request(app).patch(`/api/clans/${clanId}`)).send({name:'محاولة'});
  eq(r.status,403,'status'); eq(r.body.code,'NOT_CLAN_OWNER','code');
});

console.log('\n━━━ 🚫 الطرد والحظر ━━━');

await t('🔥 الطرد يزيل العضوية', async()=>{
  const r=await O(request(app).delete(`/api/clans/${clanId}/members/${mem.uid}`)).send({reason:'اختبار'});
  eq(r.status,200,'status');
  eq(await prisma.clanMember.count({where:{clanId,userId:mem.uid}}),0,'العضوية');
});

await t('🔥🔥 الطرد لا يحذف حساب المستخدم', async()=>{
  const u=await prisma.user.findUnique({where:{id:mem.uid}});
  if(!u)throw new Error('الحساب حُذف!');
  eq(u.username!==null,true,'الحساب سليم');
});

await t('🔥 المطرود لا يعود بنفس الكود', async()=>{
  const r=await M(request(app).post('/api/clans/private/join')).send({inviteCode:code});
  eq(r.status,403,'status'); eq(r.body.code,'CLAN_BANNED','code');
});

await t('قائمة المحظورين', async()=>{
  const r=await O(request(app).get(`/api/clans/${clanId}/bans`));
  eq(r.body.bans.length,1,'العدد');
  eq(r.body.bans[0].user.id,mem.uid,'المحظور');
});

await t('🔥 رفع الحظر يسمح بالعودة', async()=>{
  eq((await O(request(app).delete(`/api/clans/${clanId}/bans/${mem.uid}`))).status,200,'رفع');
  eq((await M(request(app).post('/api/clans/private/join')).send({inviteCode:code})).status,200,'عاد');
});

await t('المالك لا يطرد نفسه', async()=>{
  eq((await O(request(app).delete(`/api/clans/${clanId}/members/${owner.uid}`))).status,400);
});

await t('🔥 العشيرة العامة لا تُدار (بلا مالك)', async()=>{
  await O(request(app).post('/api/clans/global/auto-assign'));
  const g=await prisma.clan.findFirst({where:{type:'GLOBAL'}});
  const r=await O(request(app).delete(`/api/clans/${g.id}`));
  eq(r.status,403,'status'); eq(r.body.code,'GLOBAL_CLAN_NO_OWNER','code');
});

console.log('\n━━━ 🗑️ حذف العشيرة ━━━');

await t('🔥🔥 الحذف لا يحذف الأعضاء من النظام', async()=>{
  const before=await prisma.user.count();
  const r=await O(request(app).delete(`/api/clans/${clanId}`));
  eq(r.status,200,'status');
  eq(r.body.releasedMembers,2,'الأعضاء المحرَّرون');
  eq(await prisma.user.count(),before,'عدد المستخدمين لم يتغير');
  // بيانات العضو سليمة
  const u=await prisma.user.findUnique({where:{id:mem.uid}});
  if(!u)throw new Error('العضو حُذف!');
});

await t('العضويات فقط هي التي أُزيلت', async()=>{
  eq(await prisma.clanMember.count({where:{clanId}}),0);
});

await t('🔥 لا يوجد ADMIN في enum (ثغرة عشيرتين)', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('prisma/schema.prisma','utf8'));
  const block=src.match(/enum ClanRole \{[^}]+\}/)[0];
  if(block.includes('ADMIN'))throw new Error('ADMIN لا يزال موجوداً');
  if(!block.includes('LEADER')||!block.includes('MEMBER'))throw new Error('الأدوار ناقصة');
});

console.log('\n━━━ 🎯 كشف الساهي — العشوائية ━━━');

await t('🔥 المواعيد عشوائية لا ثابتة', ()=>{
  const runs=Array.from({length:15},()=>fc.generateSchedule(90,30).join(','));
  if(new Set(runs).size<8)throw new Error(`متكررة جداً: ${new Set(runs).size} أنماط من 15`);
});

await t('🔥🔥 اختبار واحد لكل فترة تركيز — لا أكثر', ()=>{
  // جلسة فردية = فترة واحدة مهما طالت
  eq(fc.generateSchedule(30).length,1,'30 دقيقة');
  eq(fc.generateSchedule(60).length,1,'60 دقيقة (فترة واحدة!)');
  eq(fc.generateSchedule(120).length,1,'120 دقيقة (فترة واحدة!)');
});

await t('🔥 فترات متعددة → اختبار لكل فترة', ()=>{
  eq(fc.generateSchedule(90,30).length,3,'90د بفترات 30');
  eq(fc.generateSchedule(50,25).length,2,'50د بفترات 25');
  eq(fc.generateSchedule(300,25).length,12,'5 ساعات بفترات 25');
});

await t('🔥 المواعيد داخل فتراتها ومرتبة', ()=>{
  for(let i=0;i<20;i++){
    const s=fc.generateSchedule(90,30);
    for(let j=0;j<s.length;j++){
      const lo=j*30, hi=(j+1)*30;
      if(s[j]<lo||s[j]>=hi)throw new Error(`${s[j]} خارج الفترة ${lo}-${hi}`);
    }
    for(let j=1;j<s.length;j++) if(s[j]<=s[j-1])throw new Error('غير مرتبة');
  }
});

await t('جلسة قصيرة جداً بلا اختبارات', ()=>{
  eq(fc.generateSchedule(5).length,0);
});

await t('🔥 لا يظهر في أول 3 دقائق ولا آخر 15%', ()=>{
  for(let i=0;i<40;i++){
    const [at]=fc.generateSchedule(30);
    if(at<3)throw new Error(`ظهر مبكراً: ${at}`);
    if(at>Math.floor(30*0.85))throw new Error(`ظهر متأخراً: ${at}`);
  }
});

await t('الأسئلة صحيحة رياضياً', ()=>{
  for(let i=0;i<50;i++){
    const q=fc.generateQuestion();
    const m=q.question.match(/(\d+)\s*([×+−])\s*(\d+)/);
    if(!m)throw new Error(`صيغة غريبة: ${q.question}`);
    const [,a,op,b]=m;
    const expected=op==='×'?+a*+b:op==='+'?+a+ +b:+a-+b;
    eq(q.answer,expected,q.question);
  }
});

console.log('\n━━━ 🎯 كشف الساهي — التدفق ━━━');
let sid, checkId;

await t('🔥 جلسة فردية 60د → اختبار واحد', async()=>{
  const r=await O(request(app).post('/api/focus/start')).send({plannedMin:60});
  eq(r.status,201,'status');
  eq(r.body.focusCheckSchedule.length,1,'اختبار واحد');
  eq(r.body.focusBlockMin,60,'فترة واحدة');
  sid=r.body.session.id;
});

await t('🔥 المالك يحدد فترة التركيز → اختبار لكل فترة', async()=>{
  await prisma.focusSession.updateMany({where:{userId:owner.uid,status:'ACTIVE'},data:{status:'CANCELLED'}});
  const r=await O(request(app).post('/api/focus/start')).send({plannedMin:100,focusBlockMin:25});
  eq(r.body.focusCheckSchedule.length,4,'4 فترات × 25 دقيقة');
  eq(r.body.focusBlockMin,25,'الفترة');
  await O(request(app).post(`/api/focus/${r.body.session.id}/cancel`));
  const r2=await O(request(app).post('/api/focus/start')).send({plannedMin:60});
  sid=r2.body.session.id;
});

await t('طلب اختبار يعطي سؤالاً', async()=>{
  const r=await O(request(app).post(`/api/focus/${sid}/check`));
  eq(r.status,200,'status');
  if(!r.body.check.question)throw new Error('لا يوجد سؤال');
  checkId=r.body.check.id;
});

await t('🔥 الإجابة الصحيحة → PASSED', async()=>{
  const c=await prisma.focusCheck.findUnique({where:{id:checkId}});
  const r=await O(request(app).post(`/api/focus/check/${checkId}/answer`)).send({answer:c.answer});
  eq(r.body.result,'PASSED','النتيجة');
  eq(r.body.correct,true,'صحيحة');
});

await t('🔥 الإجابة الخاطئة → FAILED وتزيد العدّاد', async()=>{
  const c2=await O(request(app).post(`/api/focus/${sid}/check`));
  const r=await O(request(app).post(`/api/focus/check/${c2.body.check.id}/answer`)).send({answer:99999});
  eq(r.body.result,'FAILED','النتيجة');
  const s=await prisma.focusSession.findUnique({where:{id:sid}});
  eq(s.failedChecks,1,'العدّاد');
});

await t('الإجابة مرتين تُرفض 409', async()=>{
  const r=await O(request(app).post(`/api/focus/check/${checkId}/answer`)).send({answer:1});
  eq(r.status,409);
});

await t('🔥 اختبار مستخدم آخر لا يُجاب عليه', async()=>{
  const c3=await O(request(app).post(`/api/focus/${sid}/check`));
  const r=await M(request(app).post(`/api/focus/check/${c3.body.check.id}/answer`)).send({answer:1});
  eq(r.status,404);
});

console.log('\n━━━ 🆘 رصيد الطوارئ ━━━');

await t('الرصيد يبدأ 2', async()=>{
  const r=await O(request(app).get('/api/focus/emergency'));
  eq([r.body.emergency.used,r.body.emergency.remaining],[0,2]);
});

await t('🔥 الاستخدام الأول ينجح ويعفي المعلّق', async()=>{
  const r=await O(request(app).post(`/api/focus/${sid}/emergency`));
  eq(r.status,200,'status'); eq(r.body.remaining,1,'المتبقي');
  const pending=await prisma.focusCheck.count({where:{sessionId:sid,result:'PENDING'}});
  eq(pending,0,'لا اختبارات معلّقة');
});

await t('الاستخدام الثاني ينجح', async()=>{
  const r=await O(request(app).post(`/api/focus/${sid}/emergency`));
  eq(r.body.remaining,0);
});

await t('🔥 الثالث يُرفض 429', async()=>{
  const r=await O(request(app).post(`/api/focus/${sid}/emergency`));
  eq(r.status,429,'status'); eq(r.body.code,'EMERGENCY_EXHAUSTED','code');
});

await t('🔥 الرصيد يُصفَّر في يوم جديد', async()=>{
  const y=new Date();y.setDate(y.getDate()-1);
  await prisma.user.update({where:{id:owner.uid},data:{emergencyResetDate:new Date(y.toISOString().slice(0,10))}});
  const r=await O(request(app).get('/api/focus/emergency'));
  eq(r.body.emergency.remaining,2);
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(52)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(52)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
