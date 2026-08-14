import 'dotenv/config';
process.env.JWT_ACCESS_SECRET='t_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET='t_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID='fake.apps.googleusercontent.com';
process.env.NODE_ENV='test';

const { register } = await import('node:module');
register('./google-mock-loader.mjs', import.meta.url);

const request=(await import('supertest')).default;
const prisma=(await import('../src/config/prisma.js')).default;
const {connectRedis}=await import('../src/config/redis.js');
const app=(await import('../src/app.js')).default;

await connectRedis();

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

await prisma.message.deleteMany();
for(const m of ['conversationParticipant','conversation','messageRequest','blockedUser','notification','focusSession','clanMember','clan','refreshToken','user'])
  await prisma[m].deleteMany();

const mk=async(id,email,domain)=>{
  const r=await request(app).post('/api/auth/google').send({idToken:`valid:${id}:${email}:${id}`});
  await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${r.body.accessToken}`).send({domain});
  return {tok:r.body.accessToken,uid:r.body.user.id};
};
const A=await mk('c1','a@t.com','TECH');
const B=await mk('c2','b@t.com','TECH');
const C=await mk('c3','c@t.com','HEALTH');
const H=(u)=>(r)=>r.set('Authorization',`Bearer ${u.tok}`);
const a=H(A), b=H(B), c=H(C);

console.log('\n━━━ 🔍 البحث والاكتشاف ━━━');

await t('البحث يعرض المستخدمين', async()=>{
  const r=await a(request(app).get('/api/chat/search'));
  eq(r.status,200,'status');
  if(r.body.users.length<2)throw new Error('نتائج قليلة');
});

await t('🔥 لا أظهر لنفسي في النتائج', async()=>{
  const r=await a(request(app).get('/api/chat/search'));
  if(r.body.users.some(u=>u.id===A.uid))throw new Error('ظهرت لنفسي');
});

await t('الفلترة حسب المجال', async()=>{
  const r=await a(request(app).get('/api/chat/search?domain=HEALTH'));
  eq(r.body.users.every(u=>u.domain==='HEALTH'),true);
});

await t('البحث بالاسم يعمل', async()=>{
  const target=await prisma.user.findUnique({where:{id:B.uid},select:{username:true}});
  const r=await a(request(app).get(`/api/chat/search?q=${target.username}`));
  if(r.body.users.length===0)throw new Error(`لم يجد: ${target.username}`);
  if(!r.body.users.some(u=>u.id===B.uid))throw new Error('النتيجة خاطئة');
});

await t('🔥 البحث غير حسّاس لحالة الأحرف', async()=>{
  const target=await prisma.user.findUnique({where:{id:B.uid},select:{username:true}});
  const r=await a(request(app).get(`/api/chat/search?q=${target.username.toUpperCase()}`));
  if(r.body.users.length===0)throw new Error('فشل مع الأحرف الكبيرة');
});

await t('بطاقة المستخدم فيها ساعات التركيز والحالة', async()=>{
  const r=await a(request(app).get('/api/chat/search'));
  const u=r.body.users[0];
  for(const k of ['focusHours','isOnline','badges','canMessage'])
    if(!(k in u))throw new Error(`${k} مفقود`);
});

console.log('\n━━━ ✉️ طلبات المراسلة ━━━');
let reqId;

await t('🔥 غريب → طلب صداقة لا محادثة', async()=>{
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:C.uid,text:'مرحباً'});
  eq(r.status,201,'status');
  eq(r.body.isFriendRequest,true,'طلب صداقة');
  eq(typeof r.body.remainingToday,'number','الرصيد المتبقي');
});

await t('طلب الصداقة يظهر عند المستقبِل', async()=>{
  const r=await c(request(app).get('/api/chat/requests'));
  const friendReqs=(r.body.requests??[]).filter(x=>x.kind==='FRIENDSHIP');
  eq(friendReqs.length,1,'العدد');
  eq(friendReqs[0].introText,'مرحباً','النص');
  reqId=friendReqs[0].id;
});

await t('طلب مكرر يُرفض 409', async()=>{
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:C.uid,text:'تاني'});
  eq(r.status,409,'status'); eq(r.body.code,'REQUEST_PENDING','code');
});

await t('🔥 القبول ينشئ محادثة وينقل رسالة التعريف', async()=>{
  const r=await c(request(app).post(`/api/social/friends/requests/${reqId}/respond`)).send({action:'ACCEPT'});
  eq(r.status,200,'status');
  const msgs=await prisma.message.findMany({where:{conversationId:r.body.conversationId}});
  eq(msgs.length,1,'الرسالة نُقلت');
  eq(msgs[0].text,'مرحباً','النص');
});

await t('بعد القبول المراسلة مباشرة', async()=>{
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:C.uid,text:'شكراً'});
  eq(r.status,200,'status');
  if(r.body.isFriendRequest)throw new Error('لا يزال طلب صداقة');
});

console.log('\n━━━ 🤝 العشيرة الخاصة تعفي من الطلب ━━━');

await t('🔥 عضوا عشيرة خاصة يحتاجان صداقة أولاً (قرار المالك)', async()=>{
  const cl=await a(request(app).post('/api/clans/private/create')).send({name:'فريق الاختبار'});
  await b(request(app).post('/api/clans/private/join')).send({inviteCode:cl.body.clan.inviteCode});
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:B.uid,text:'يا صاحبي'});
  eq(r.status,201,'status');
  eq(r.body.isFriendRequest,true,'حتى عضو العشيرة يحتاج صداقة');

  // إكمال الصداقة → المحادثة تفتح بينهما
  const reqs=await b(request(app).get('/api/chat/requests'));
  const fr=(reqs.body.requests??[]).find(x=>x.kind==='FRIENDSHIP');
  eq(Boolean(fr),true,'طلب الصداقة وصل لـ B');
  const acc=await b(request(app).post(`/api/social/friends/requests/${fr.id}/respond`)).send({action:'ACCEPT'});
  eq(acc.status,200,'قبول الصداقة');
  const r2=await a(request(app).post('/api/chat/start')).send({targetUserId:B.uid,text:'تمام يا صاحبي'});
  eq(r2.status,200,'بعد الصداقة مراسلة مباشرة');
});

await t('🔥 العشيرة العامة لا تعفي', async()=>{
  await a(request(app).post('/api/clans/global/auto-assign'));
  const D=await mk('c4','d@t.com','TECH');
  await request(app).post('/api/clans/global/auto-assign').set('Authorization',`Bearer ${D.tok}`);
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:D.uid,text:'أهلاً'});
  eq(r.body.isFriendRequest,true,'يحتاج صداقة');
});

console.log('\n━━━ 💬 الرسائل ━━━');
let convId;

await t('إرسال رسالة', async()=>{
  const list=await a(request(app).get('/api/chat/conversations'));
  convId=list.body.conversations[0].id;
  const r=await a(request(app).post(`/api/chat/${convId}/messages`)).send({text:'رسالة اختبار'});
  eq(r.status,201,'status');
  eq(r.body.message.text,'رسالة اختبار','النص');
});

await t('🔥 غير المشارك لا يرسل (403)', async()=>{
  const r=await c(request(app).post(`/api/chat/${convId}/messages`)).send({text:'تطفل'});
  eq(r.status,403);
});

await t('رسالة فارغة تُرفض', async()=>{
  eq((await a(request(app).post(`/api/chat/${convId}/messages`)).send({text:'   '})).status,400);
});

await t('رسالة > 2000 حرف تُرفض', async()=>{
  eq((await a(request(app).post(`/api/chat/${convId}/messages`)).send({text:'x'.repeat(2001)})).status,400);
});

await t('🔥 الرد على رسالة يحفظ الاقتباس', async()=>{
  const first=await prisma.message.findFirst({where:{conversationId:convId}});
  const r=await a(request(app).post(`/api/chat/${convId}/messages`))
    .send({text:'رد',replyToId:String(first.id)});
  /**
   * ⚠️ بنية الاقتباس تغيّرت مع التوحيد: كانت كائناً متداخلاً
   *    في Mongo (`replyTo: {messageId, text, senderName}`)
   *    وصارت حقولاً مسطّحة في Postgres. المتداخل يحتاج JSONB
   *    ولا يمكن فهرسته ولا الاستعلام عنه بسهولة.
   */
  const m=r.body.message;
  if(!m.replyToId)throw new Error('معرّف الاقتباس مفقود');
  if(!m.replyToText)throw new Error('نص الاقتباس مفقود');
  if(m.replyToId!==String(first.id))throw new Error('الاقتباس يشير لرسالة خطأ');
});

await t('جلب الرسائل مرتبة زمنياً', async()=>{
  const r=await a(request(app).get(`/api/chat/${convId}/messages`));
  eq(r.status,200,'status');
  const dates=r.body.messages.map(m=>new Date(m.createdAt).getTime());
  eq(dates.every((d,i)=>i===0||d>=dates[i-1]),true,'الترتيب');
});

await t('🔥 القراءة تُعلَّم تلقائياً', async()=>{
  // آلية الكود الفعلية: آخر قراءة تُسجَّل على المشارك (lastReadAt)
  await prisma.conversationParticipant.updateMany({
    where: { conversationId: convId, userId: B.uid },
    data: { lastReadAt: null },
  });
  await b(request(app).get(`/api/chat/${convId}/messages`));
  const p=await prisma.conversationParticipant.findFirst({ where: { conversationId: convId, userId: B.uid } });
  if(!p||!p.lastReadAt)throw new Error('لم تُعلَّم القراءة');
});

/**
 * ⚠️ نثبّت الرسالة بين الاختبارين.
 *
 *  كان كلٌّ منهما يستدعي findFirst بلا orderBy، فقد يعملان على
 *  رسالتين مختلفتين — فيبدو التبديل معطّلاً وهو سليم.
 *  اختبار غير حتمي أسوأ من اختبار غائب: يُفشل بناءً سليماً.
 */
let reactMsgId=null;

await t('التفاعل بإيموجي', async()=>{
  const m=await prisma.message.findFirst({
    where:{conversationId:convId}, orderBy:{createdAt:'asc'}});
  reactMsgId=m.id;
  const r=await b(request(app).post(`/api/chat/messages/${m.id}/react`)).send({emoji:'🔥'});
  eq(r.body.reactions.length,1,'العدد');
});

await t('التفاعل مرتين يزيله', async()=>{
  const r=await b(request(app).post(`/api/chat/messages/${reactMsgId}/react`)).send({emoji:'🔥'});
  eq(r.body.reactions.length,0);
});

await t('التعديل يعلّم isEdited', async()=>{
  const m=await prisma.message.findFirst({where:{conversationId:convId,senderId:A.uid}});
  const r=await a(request(app).patch(`/api/chat/messages/${m.id}`)).send({text:'معدّلة'});
  eq([r.body.message.text,r.body.message.isEdited],['معدّلة',true]);
});

await t('🔥 لا أعدّل رسالة غيري', async()=>{
  const m=await prisma.message.findFirst({where:{conversationId:convId,senderId:A.uid}});
  const r=await b(request(app).patch(`/api/chat/messages/${m.id}`)).send({text:'اختراق'});
  eq(r.status,403);
});

await t('الحذف ناعم لا نهائي', async()=>{
  const m=await prisma.message.findFirst({where:{conversationId:convId,senderId:A.uid}});
  await a(request(app).delete(`/api/chat/messages/${m.id}`));
  const after=await prisma.message.findUnique({where:{id:m.id}});
  eq([after.isDeleted,after.text],[true,'رسالة محذوفة']);
});

console.log('\n━━━ 🎯 بوابة التركيز ━━━');

await t('🔥🔥 الشات مقفول أثناء جلسة تركيز', async()=>{
  const s=await a(request(app).post('/api/focus/start')).send({plannedMin:30});
  const r=await a(request(app).post(`/api/chat/${convId}/messages`)).send({text:'وأنا مركّز'});
  eq(r.status,403,'status');
  eq(r.body.code,'FOCUS_SESSION_ACTIVE','code');
  await a(request(app).post(`/api/focus/${s.body.session.id}/cancel`));
});

await t('يُفتح بعد إنهاء الجلسة', async()=>{
  const r=await a(request(app).post(`/api/chat/${convId}/messages`)).send({text:'خلصت'});
  eq(r.status,201);
});

await t('🔥 القراءة مسموحة أثناء التركيز', async()=>{
  const s=await a(request(app).post('/api/focus/start')).send({plannedMin:30});
  eq((await a(request(app).get(`/api/chat/${convId}/messages`))).status,200);
  await a(request(app).post(`/api/focus/${s.body.session.id}/cancel`));
});

console.log('\n━━━ 🐌 حدود شات العشيرة ━━━');

await t('🔥 العامة بطيئة (30 ثانية) والخاصة سريعة (2)', async()=>{
  const r=await a(request(app).get('/api/chat/clans'));
  const g=r.body.clans.find(x=>x.type==='GLOBAL');
  const p=r.body.clans.find(x=>x.type==='PRIVATE');
  eq(g.slowModeSec,30,'العامة');
  eq(p.slowModeSec,2,'الخاصة');
});

await t('🔥 الوضع البطيء يمنع الرسالة الثانية فوراً', async()=>{
  const clans=await a(request(app).get('/api/chat/clans'));
  const g=clans.body.clans.find(x=>x.type==='GLOBAL');
  const open=await a(request(app).get(`/api/chat/clans/${g.clanId}/open`));
  const cid=open.body.conversationId;

  const r1=await a(request(app).post(`/api/chat/${cid}/messages`)).send({text:'أولى'});
  eq(r1.status,201,'الأولى');

  const r2=await a(request(app).post(`/api/chat/${cid}/messages`)).send({text:'ثانية'});
  eq(r2.status,400,'الثانية'); eq(r2.body.code,'SLOW_MODE','code');
});

console.log('\n━━━ 🔒 الخصوصية والحظر ━━━');

await t('الخصوصية لا تلغي شرط الصداقة (CLAN_ONLY)', async()=>{
  await c(request(app).patch('/api/chat/privacy')).send({privacyLevel:'CLAN_ONLY'});
  const E=await mk('c5','e@t.com','TECH');
  const r=await request(app).post('/api/chat/start').set('Authorization',`Bearer ${E.tok}`)
    .send({targetUserId:C.uid,text:'أهلاً'});
  eq(r.status,201,'status');
  eq(r.body.isFriendRequest,true,'غريب → طلب صداقة دائماً (قرار المالك)');
});

await t('EVERYONE لم يعد يسمح بمراسلة مباشرة — الصداقة شرط', async()=>{
  await c(request(app).patch('/api/chat/privacy')).send({privacyLevel:'EVERYONE'});
  const F=await mk('c6','f@t.com','TECH');
  const r=await request(app).post('/api/chat/start').set('Authorization',`Bearer ${F.tok}`)
    .send({targetUserId:C.uid,text:'أهلاً'});
  eq(r.status,201,'status');
  eq(r.body.isFriendRequest,true,'غريب → طلب صداقة (حتى مع EVERYONE)');
});

await t('🔥 الحظر يمنع المراسلة', async()=>{
  await c(request(app).post('/api/chat/block')).send({targetUserId:A.uid});
  const r=await a(request(app).post('/api/chat/start')).send({targetUserId:C.uid,text:'أهلاً'});
  eq(r.status,403,'status'); eq(r.body.code,'BLOCKED','code');
});

await t('المحظور لا يظهر في البحث', async()=>{
  const r=await a(request(app).get('/api/chat/search'));
  if(r.body.users.some(u=>u.id===C.uid))throw new Error('ظهر رغم الحظر');
});

await t('رفع الحظر يعيد الوصول', async()=>{
  await c(request(app).delete(`/api/chat/block/${A.uid}`));
  const r=await a(request(app).get('/api/chat/search'));
  if(!r.body.users.some(u=>u.id===C.uid))throw new Error('لم يعد');
});

console.log('\n━━━ 🛡️ حد الـ 10 اليومي ━━━');

await t('🔥 الحادي عشر يُرفض', async()=>{
  const me=await mk('c9','quota@t.com','CREATIVE');
  const targets=[];
  for(let i=0;i<11;i++) targets.push(await mk(`q${i}`,`q${i}@t.com`,'CREATIVE'));

  let blocked=0;
  for(const tg of targets){
    const r=await request(app).post('/api/chat/start').set('Authorization',`Bearer ${me.tok}`)
      .send({targetUserId:tg.uid,text:'مرحباً'});
    if(r.status===429&&r.body.code==='DAILY_FRIEND_REQUESTS_EXHAUSTED') blocked++;
  }
  if(blocked===0)throw new Error('الحد لم يعمل');
  console.log(`     (حُظرت ${blocked} محاولة بعد الـ 10)`);
});

console.log('\n━━━ 📋 التبويبات ━━━');

await t('تبويب المحادثات فيه غير المقروء والحالة', async()=>{
  const r=await a(request(app).get('/api/chat/conversations'));
  eq(r.status,200,'status');
  const c0=r.body.conversations[0];
  for(const k of ['unread','lastMessage','user'])
    if(!(k in c0))throw new Error(`${k} مفقود`);
  if(!('isOnline' in c0.user))throw new Error('isOnline مفقود');
});

await t('تبويب العشائر يعرض الاثنين', async()=>{
  const r=await a(request(app).get('/api/chat/clans'));
  eq(r.body.clans.length,2,'عامة وخاصة');
});

await t('تبويب الطلبات يعرض الرصيد اليومي', async()=>{
  const r=await a(request(app).get('/api/chat/requests'));
  eq(r.status,200,'status');
  if(!r.body.myQuota)throw new Error(`myQuota مفقود: ${JSON.stringify(r.body).slice(0,200)}`);
  eq(r.body.myQuota.total,10,'الحد');
  if(typeof r.body.myQuota.remaining!=='number')throw new Error('remaining مفقود');
});

await prisma.message.deleteMany();
await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(52)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(52)}`);
// إغلاق صريح لكل الاتصالات — بلا هذا يتعلّق الاختبار
const redis=(await import('../src/config/redis.js')).default;
await prisma.$disconnect();
if(redis.isOpen) await redis.quit();
process.exit(fail?1:0);
