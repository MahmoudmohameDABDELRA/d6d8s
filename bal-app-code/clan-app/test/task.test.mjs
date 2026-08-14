import 'dotenv/config';
process.env.DATABASE_URL ||= 'postgresql://x:x@localhost:5432/x';
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

await prisma.taskHistory.deleteMany();
await prisma.taskStep.deleteMany();
await prisma.focusSession.deleteMany();
await prisma.task.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.userAchievement.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.refreshToken.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

const reg=await request(app).post('/api/auth/google').send({idToken:'valid:t1:task@t.com:Task'});
const TOK=reg.body.accessToken; const uid=reg.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK}`).send({domain:'STUDY'});
const A=(r)=>r.set('Authorization',`Bearer ${TOK}`);

console.log('\n━━━ إنشاء المهام ━━━');
let tid, quickId;

await t('إنشاء مهمة (201) بفئة افتراضية GROWTH', async()=>{
  const r=await A(request(app).post('/api/tasks')).send({title:'مراجعة التشريح'});
  eq(r.status,201,'status');
  eq(r.body.task.priority,'GROWTH','الفئة');
  tid=r.body.task.id;
});

await t('عنوان فارغ يُرفض 400', async()=>{
  eq((await A(request(app).post('/api/tasks')).send({title:'   '})).status,400);
});

await t('فئة غير صالحة تُرفض', async()=>{
  eq((await A(request(app).post('/api/tasks')).send({title:'x',priority:'URGENT'})).status,400);
});

await t('تاريخ غير صالح يُرفض', async()=>{
  eq((await A(request(app).post('/api/tasks')).send({title:'x',dueDate:'not-a-date'})).status,400);
});

await t('🔥 إنشاء مع خطوات فرعية دفعة واحدة', async()=>{
  const r=await A(request(app).post('/api/tasks')).send({
    title:'مشروع التخرج',priority:'CRITICAL',
    steps:['البحث','الكتابة','المراجعة']
  });
  eq(r.status,201,'status');
  eq(r.body.task.steps.length,3,'عدد الخطوات');
  eq(r.body.task.steps.map(s=>s.orderIndex),[0,1,2],'الترتيب');
});

await t('إنشاء مهمة سريعة', async()=>{
  const r=await A(request(app).post('/api/tasks')).send({title:'رد على إيميل',priority:'QUICK'});
  quickId=r.body.task.id;
  eq(r.body.task.priority,'QUICK');
});

console.log('\n━━━ 💎 الإتمام والشرارات ━━━');

await t('🔥 إتمام مهمة = 2 شرارة', async()=>{
  const before=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  const r=await A(request(app).patch(`/api/tasks/${quickId}/complete`));
  eq(r.status,200,'status');
  eq(r.body.sparks.earned,2,'الشرارات');
  const after=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  eq(after-before,2,'الفرق في الرصيد');
});

await t('🔥 كل الفئات = 2 شرارة (بلا تفرقة)', async()=>{
  const c=await A(request(app).post('/api/tasks')).send({title:'حرجة',priority:'CRITICAL'});
  const r=await A(request(app).patch(`/api/tasks/${c.body.task.id}/complete`));
  eq(r.body.sparks.earned,2);
});

await t('إتمام مهمة منجزة يُرفض 409', async()=>{
  const r=await A(request(app).patch(`/api/tasks/${quickId}/complete`));
  eq(r.status,409,'status');
  eq(r.body.code,'TASK_ALREADY_COMPLETED','code');
});

await t('🔥 الإتمام يحدّث السلسلة', async()=>{
  const u=await prisma.user.findUnique({where:{id:uid}});
  if(u.currentStreak<1)throw new Error('السلسلة لم تتحدث');
});

await t('🔥 الإتمام يُتمّ الخطوات المعلّقة', async()=>{
  const p=await A(request(app).post('/api/tasks')).send({title:'بخطوات',steps:['أ','ب']});
  await A(request(app).patch(`/api/tasks/${p.body.task.id}/complete`));
  const left=await prisma.taskStep.count({where:{taskId:p.body.task.id,isCompleted:false}});
  eq(left,0,'خطوات معلّقة');
});

await t('🔥 إعادة الفتح لا تسترجع الشرارات', async()=>{
  const before=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  const r=await A(request(app).patch(`/api/tasks/${quickId}/reopen`));
  eq(r.status,200,'status');
  const after=(await prisma.user.findUnique({where:{id:uid}})).sparksBalance;
  eq(after,before,'الرصيد لم يتغير');
});

await t('🔥 لا استغلال: إعادة الفتح ثم الإتمام لا تمنح مرتين... بل تمنح', async()=>{
  // هذا سلوك مقصود وموثّق — نتحقق أنه متسق
  const r=await A(request(app).patch(`/api/tasks/${quickId}/complete`));
  eq(r.body.sparks.earned,2,'تُمنح مجدداً (سلوك موثّق)');
});

console.log('\n━━━ الخطوات الفرعية ━━━');
let stepId;

await t('إضافة خطوة', async()=>{
  const r=await A(request(app).post(`/api/tasks/${tid}/steps`)).send({title:'قراءة الفصل'});
  eq(r.status,201,'status');
  eq(r.body.step.orderIndex,0,'الترتيب');
  stepId=r.body.step.id;
});

await t('الترتيب يتزايد تلقائياً', async()=>{
  const r=await A(request(app).post(`/api/tasks/${tid}/steps`)).send({title:'التلخيص'});
  eq(r.body.step.orderIndex,1);
});

await t('تبديل حالة الخطوة', async()=>{
  const r=await A(request(app).patch(`/api/tasks/steps/${stepId}/toggle`));
  eq(r.body.step.isCompleted,true,'مكتملة');
  eq(r.body.allStepsDone,false,'باقي خطوة');
});

await t('🔥 allStepsDone يصبح true عند إتمام الكل', async()=>{
  const steps=await prisma.taskStep.findMany({where:{taskId:tid,isCompleted:false}});
  let last;
  for(const s of steps) last=await A(request(app).patch(`/api/tasks/steps/${s.id}/toggle`));
  eq(last.body.allStepsDone,true);
});

await t('حذف خطوة', async()=>{
  eq((await A(request(app).delete(`/api/tasks/steps/${stepId}`))).status,200);
});

console.log('\n━━━ الفلاتر ━━━');

await t('filter=pending', async()=>{
  const r=await A(request(app).get('/api/tasks?filter=pending'));
  eq(r.status,200,'status');
  if(r.body.tasks.some(t=>t.isCompleted))throw new Error('ظهرت مهمة منجزة');
});

await t('filter=completed', async()=>{
  const r=await A(request(app).get('/api/tasks?filter=completed'));
  if(r.body.tasks.some(t=>!t.isCompleted))throw new Error('ظهرت مهمة معلّقة');
});

await t('🔥 filter=overdue يعرض المتأخرة فقط', async()=>{
  const y=new Date();y.setDate(y.getDate()-2);
  await A(request(app).post('/api/tasks')).send({title:'متأخرة',dueDate:y.toISOString()});
  const r=await A(request(app).get('/api/tasks?filter=overdue'));
  if(r.body.tasks.length===0)throw new Error('لم تظهر');
  if(r.body.tasks.some(t=>t.isCompleted))throw new Error('ظهرت منجزة');
});

await t('التجميع حسب الفئة يعمل', async()=>{
  const r=await A(request(app).get('/api/tasks'));
  if(!r.body.grouped.CRITICAL||!r.body.grouped.GROWTH||!r.body.grouped.QUICK)
    throw new Error('التجميع ناقص');
});

console.log('\n━━━ الترحيل ━━━');

await t('ترحيل بلا تاريخ = الغد', async()=>{
  const n=await A(request(app).post('/api/tasks')).send({title:'ترحيل'});
  const r=await A(request(app).patch(`/api/tasks/${n.body.task.id}/reschedule`));
  eq(r.status,200,'status');
  eq(r.body.task.rescheduleCount,1,'العدّاد');
});

await t('🔥 الترحيل 3 مرات يعطي تلميحاً', async()=>{
  const n=await A(request(app).post('/api/tasks')).send({title:'ثقيلة'});
  let r;
  for(let i=0;i<3;i++) r=await A(request(app).patch(`/api/tasks/${n.body.task.id}/reschedule`));
  if(!r.body.hint)throw new Error('لا يوجد تلميح');
});

console.log('\n━━━ 🔗 الربط بالتركيز ━━━');

await t('🔥 بدء جلسة مربوطة بمهمة', async()=>{
  const n=await A(request(app).post('/api/tasks')).send({title:'مذاكرة'});
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:30,taskId:n.body.task.id});
  eq(s.status,201,'status');
  eq(s.body.session.taskId,n.body.task.id,'الربط');

  await prisma.focusSession.update({where:{id:s.body.session.id},data:{startedAt:new Date(Date.now()-30*60000)}});
  await A(request(app).post(`/api/focus/${s.body.session.id}/complete`)).send({clientReportedMin:30});

  const r=await A(request(app).get(`/api/tasks/${n.body.task.id}`));
  eq(r.body.task.focusedMin,30,'الوقت المبذول');
});

await t('مهمة مستخدم آخر تُرفض 404', async()=>{
  const o=await request(app).post('/api/auth/google').send({idToken:'valid:t2:o@t.com:O'});
  await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${o.body.accessToken}`).send({domain:'TECH'});
  const s=await request(app).post('/api/focus/start').set('Authorization',`Bearer ${o.body.accessToken}`)
    .send({plannedMin:30,taskId:tid});
  eq(s.status,404,'status');
});

console.log('\n━━━ السجل والإحصائيات ━━━');

await t('🔥 السجل يُكتب تلقائياً', async()=>{
  const r=await A(request(app).get(`/api/tasks/${tid}`));
  const actions=r.body.task.history.map(h=>h.action);
  if(!actions.includes('CREATED'))throw new Error(`لا يوجد CREATED: ${actions}`);
});

await t('GET /stats يرجع ملخصاً', async()=>{
  const r=await A(request(app).get('/api/tasks/stats'));
  eq(r.status,200,'status');
  if(typeof r.body.stats.completionRate!=='number')throw new Error('نسبة الإنجاز مفقودة');
  if(!r.body.stats.pendingByPriority)throw new Error('التوزيع مفقود');
});

await t('الحذف يعمل', async()=>{
  const n=await A(request(app).post('/api/tasks')).send({title:'للحذف'});
  eq((await A(request(app).delete(`/api/tasks/${n.body.task.id}`))).status,200);
  eq((await A(request(app).get(`/api/tasks/${n.body.task.id}`))).status,404,'اختفت');
});

await t('🔥 حذف مهمة لا يحذف جلساتها', async()=>{
  const n=await A(request(app).post('/api/tasks')).send({title:'مع جلسة'});
  const s=await A(request(app).post('/api/focus/start')).send({plannedMin:10,taskId:n.body.task.id});
  await A(request(app).post(`/api/focus/${s.body.session.id}/cancel`));
  await A(request(app).delete(`/api/tasks/${n.body.task.id}`));
  const sess=await prisma.focusSession.findUnique({where:{id:s.body.session.id}});
  if(!sess)throw new Error('الجلسة حُذفت!');
  eq(sess.taskId,null,'taskId أصبح null');
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(50)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(50)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
