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
const ok=(c,m)=>{if(!c)throw new Error(m)};

// ── تنظيف ──
await prisma.goalWeek.deleteMany();
await prisma.goal.deleteMany();
await prisma.sparkTransaction.deleteMany();
await prisma.userAchievement.deleteMany();
await prisma.clanMember.deleteMany();
await prisma.refreshToken.deleteMany();
await prisma.clan.deleteMany();
await prisma.user.deleteMany();

const reg=await request(app).post('/api/auth/google').send({idToken:'valid:j1:journal@t.com:Journal'});
const TOK=reg.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK}`).send({domain:'TECH'});
const A=(r)=>r.set('Authorization',`Bearer ${TOK}`);

// مستخدم ثانٍ لاختبار العزل
const reg2=await request(app).post('/api/auth/google').send({idToken:'valid:j2:other@t.com:Other'});
const TOK2=reg2.body.accessToken;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK2}`).send({domain:'STUDY'});
const B=(r)=>r.set('Authorization',`Bearer ${TOK2}`);

console.log('\n━━━ إنشاء الأهداف ━━━');
let goalId, week1Id;

await t('إنشاء هدف (201) + أسبوع أول تلقائي', async()=>{
  const r=await A(request(app).post('/api/goals')).send({
    title:'تعلم برمجة HTML',
    vision:'أقدر أبني موقع كامل لوحدي',
    pledge:'أنا بلتزم أتعلم HTML في 8 أسابيع',
    firstWeekTitle:'أساسيات الوسوم',
  });
  eq(r.status,201,'status');
  eq(r.body.goal.weeks.length,1,'عدد الأسابيع');
  eq(r.body.goal.weeks[0].weekNumber,1,'رقم الأسبوع');
  eq(r.body.goal.weeks[0].status,'OPEN','الحالة');
  eq(r.body.goal.pledge,'أنا بلتزم أتعلم HTML في 8 أسابيع','الوعد');
  goalId=r.body.goal.id;
  week1Id=r.body.goal.weeks[0].id;
});

await t('عنوان فارغ يُرفض 400', async()=>{
  eq((await A(request(app).post('/api/goals')).send({title:'   '})).status,400);
});

await t('بلا عنوان يُرفض 400', async()=>{
  eq((await A(request(app).post('/api/goals')).send({vision:'x'})).status,400);
});

await t('عنوان أطول من 120 حرف يُرفض', async()=>{
  eq((await A(request(app).post('/api/goals')).send({title:'ا'.repeat(121)})).status,400);
});

await t('تاريخ غير صالح يُرفض', async()=>{
  eq((await A(request(app).post('/api/goals')).send({title:'x',targetDate:'ليس تاريخاً'})).status,400);
});

await t('عنوان أسبوع افتراضي لو لم يُرسل', async()=>{
  const r=await A(request(app).post('/api/goals')).send({title:'هدف بلا عنوان أسبوع'});
  eq(r.body.goal.weeks[0].title,'الأسبوع الأول','العنوان الافتراضي');
  await A(request(app).delete(`/api/goals/${r.body.goal.id}`));
});

console.log('\n━━━ حد الأهداف النشطة ━━━');

await t('🔥 لا يتجاوز 3 أهداف نشطة', async()=>{
  const g2=await A(request(app).post('/api/goals')).send({title:'هدف 2'});
  const g3=await A(request(app).post('/api/goals')).send({title:'هدف 3'});
  eq(g2.status,201,'الثاني');
  eq(g3.status,201,'الثالث');

  const g4=await A(request(app).post('/api/goals')).send({title:'هدف 4'});
  eq(g4.status,400,'الرابع يُرفض');

  // ننظّف
  await A(request(app).delete(`/api/goals/${g2.body.goal.id}`));
  await A(request(app).delete(`/api/goals/${g3.body.goal.id}`));
});

console.log('\n━━━ الأسابيع ━━━');

await t('لا يُفتح أسبوع جديد وهناك مفتوح', async()=>{
  const r=await A(request(app).post(`/api/goals/${goalId}/weeks`)).send({title:'الثاني'});
  eq(r.status,400,'يجب الرفض');
  ok(/مفتوح/.test(r.body.message||r.body.error||''),'رسالة توضح السبب');
});

console.log('\n━━━ التوثيق والقفل ━━━');

await t('توثيق ناقص يُرفض — إجابة واحدة فقط', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week1Id}/document`))
    .send({reflection:'أسبوع صعب'});
  eq(r.status,400,'يجب الرفض');
});

await t('توثيق بإجابة فارغة يُرفض', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week1Id}/document`))
    .send({reflection:'x',learnings:'   ',mistakes:'y'});
  eq(r.status,400);
});

await t('🔥 توثيق كامل ينجح ويقفل الأسبوع', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week1Id}/document`)).send({
    reflection:'أسبوع كشف لي إني بضيع وقت في التفاصيل',
    learnings:'اتعلمت الوسوم الأساسية وبنيت أول صفحة',
    mistakes:'كنت بفتح يوتيوب وسط المذاكرة — بفتخر إني كملت',
  });
  eq(r.status,200,'status');
  eq(r.body.week.status,'DOCUMENTED','الحالة');
  eq(r.body.isFirstSave,true,'أول حفظ');
  ok(r.body.week.documentedAt,'وقت التوثيق مسجّل');
  ok(r.body.week.lockedAt,'وقت القفل مسجّل');
});

await t('🔥 نافذة التعديل مفتوحة بعد الحفظ مباشرة', async()=>{
  const r=await A(request(app).get(`/api/goals/weeks/${week1Id}`));
  eq(r.body.week.canEdit,true,'قابل للتعديل');
  ok(r.body.week.editSecondsLeft>280,`الثواني المتبقية ${r.body.week.editSecondsLeft} يجب أن تقارب 300`);
});

await t('التعديل داخل النافذة ينجح', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week1Id}/document`)).send({
    reflection:'أسبوع كشف لي إني بضيّع وقت في التفاصيل',
    learnings:'اتعلمت الوسوم الأساسية وبنيت أول صفحة كاملة',
    mistakes:'كنت بفتح يوتيوب وسط المذاكرة — بفتخر إني كمّلت',
  });
  eq(r.status,200,'status');
  eq(r.body.isFirstSave,false,'ليس أول حفظ');
});

await t('🔥 التعديل لا يمدّد النافذة', async()=>{
  const w=await prisma.goalWeek.findUnique({where:{id:week1Id}});
  const gap=new Date(w.lockedAt).getTime()-new Date(w.documentedAt).getTime();
  eq(gap,10*60*1000,'الفارق يجب أن يبقى 10 دقائق بالضبط (رؤية المالك)');
});

await t('🔥 بعد انتهاء النافذة يُقفل نهائياً', async()=>{
  // نرجع الزمن 11 دقيقة لمحاكاة انتهاء نافذة الـ 10 دقائق
  const past=new Date(Date.now()-11*60*1000);
  await prisma.goalWeek.update({
    where:{id:week1Id},
    data:{documentedAt:past,lockedAt:new Date(past.getTime()+10*60*1000)},
  });

  const r=await A(request(app).post(`/api/goals/weeks/${week1Id}/document`)).send({
    reflection:'محاولة تزوير التاريخ',
    learnings:'x',
    mistakes:'y',
  });
  eq(r.status,403,'يجب المنع');

  const check=await A(request(app).get(`/api/goals/weeks/${week1Id}`));
  eq(check.body.week.canEdit,false,'غير قابل للتعديل');
  eq(check.body.week.editSecondsLeft,0,'صفر ثانية');
  ok(/بضيّع/.test(check.body.week.reflection),'النص الأصلي محفوظ');
});

console.log('\n━━━ الأسبوع التالي ━━━');
let week2Id;

await t('يُفتح أسبوع جديد بعد إغلاق السابق', async()=>{
  const r=await A(request(app).post(`/api/goals/${goalId}/weeks`)).send({title:'النماذج والجداول'});
  eq(r.status,201,'status');
  eq(r.body.week.weekNumber,2,'رقم الأسبوع');
  week2Id=r.body.week.id;
});

await t('currentWeek تحدّث في الهدف', async()=>{
  const g=await prisma.goal.findUnique({where:{id:goalId}});
  eq(g.currentWeek,2,'الأسبوع الحالي');
});

console.log('\n━━━ التخطي ━━━');

await t('التخطي بلا تأكيد يُرفض', async()=>{
  eq((await A(request(app).post(`/api/goals/weeks/${week2Id}/skip`)).send({})).status,400);
});

await t('التخطي بـ confirm خاطئ يُرفض', async()=>{
  eq((await A(request(app).post(`/api/goals/weeks/${week2Id}/skip`)).send({confirm:'yes'})).status,400);
});

await t('🔥 التخطي بتأكيد ينجح', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week2Id}/skip`)).send({confirm:true});
  eq(r.status,200,'status');
  eq(r.body.week.status,'SKIPPED','الحالة');
});

await t('🔥 الأسبوع المتخطّى لا يُوثَّق أبداً', async()=>{
  const r=await A(request(app).post(`/api/goals/weeks/${week2Id}/document`)).send({
    reflection:'ندمت على التخطي',learnings:'x',mistakes:'y',
  });
  eq(r.status,403,'يجب المنع');
});

await t('التخطي مرتين يُرفض', async()=>{
  eq((await A(request(app).post(`/api/goals/weeks/${week2Id}/skip`)).send({confirm:true})).status,400);
});

await t('الأسبوع الموثّق لا يُتخطّى', async()=>{
  eq((await A(request(app).post(`/api/goals/weeks/${week1Id}/skip`)).send({confirm:true})).status,403);
});

console.log('\n━━━ الوعد المكتوب ━━━');

await t('🔥 الوعد لا يُعدّل بعد أول توثيق', async()=>{
  const r=await A(request(app).patch(`/api/goals/${goalId}`)).send({pledge:'وعد جديد أسهل'});
  eq(r.status,403,'يجب المنع');
});

await t('العنوان يُعدّل عادياً', async()=>{
  const r=await A(request(app).patch(`/api/goals/${goalId}`)).send({title:'تعلم HTML و CSS'});
  eq(r.status,200,'status');
  eq(r.body.goal.title,'تعلم HTML و CSS','العنوان');
});

await t('الوعد يُعدّل قبل أي توثيق', async()=>{
  const g=await A(request(app).post('/api/goals')).send({title:'هدف جديد',pledge:'وعد أولي'});
  const r=await A(request(app).patch(`/api/goals/${g.body.goal.id}`)).send({pledge:'وعد محدّث'});
  eq(r.status,200,'يجب السماح');
  eq(r.body.goal.pledge,'وعد محدّث','الوعد');
  await A(request(app).delete(`/api/goals/${g.body.goal.id}`));
});

await t('الوعد يظهر مع كل أسبوع', async()=>{
  const r=await A(request(app).get(`/api/goals/weeks/${week1Id}`));
  ok(r.body.pledge,'الوعد موجود');
  ok(r.body.goalTitle,'اسم الهدف موجود');
});

console.log('\n━━━ رسالة المستقبل ━━━');
let futureGoalId, futureWeekId;

await t('رسالة المستقبل تُجدول بعد 30 يوماً', async()=>{
  const g=await A(request(app).post('/api/goals')).send({title:'هدف الرسالة'});
  futureGoalId=g.body.goal.id;
  futureWeekId=g.body.goal.weeks[0].id;

  await A(request(app).post(`/api/goals/weeks/${futureWeekId}/document`)).send({
    reflection:'بداية جديدة',learnings:'التخطيط',mistakes:'التأجيل',
    futureNote:'لو قريت دي وانت لسه مكمل، يبقى إنت أقوى مما كنت فاكر',
  });

  const w=await prisma.goalWeek.findUnique({where:{id:futureWeekId}});
  ok(w.futureNote,'الرسالة محفوظة');
  ok(w.futureAt,'الموعد محدد');
  eq(w.futureSent,false,'لم تُرسل بعد');

  const days=Math.round((new Date(w.futureAt)-new Date(w.documentedAt))/86400000);
  eq(days,30,'بعد 30 يوماً');
});

await t('الرسائل غير المستحقة لا تظهر', async()=>{
  const r=await A(request(app).get('/api/goals/future-notes'));
  eq(r.body.count,0,'لا رسائل الآن');
});

await t('🔥 الرسالة المستحقة تُسلَّم', async()=>{
  await prisma.goalWeek.update({
    where:{id:futureWeekId},
    data:{futureAt:new Date(Date.now()-1000)},
  });

  const r=await A(request(app).get('/api/goals/future-notes'));
  eq(r.body.count,1,'رسالة واحدة');
  ok(/أقوى/.test(r.body.notes[0].note),'نص الرسالة');
  ok(r.body.notes[0].goalTitle,'اسم الهدف');
});

await t('🔥 الرسالة تُسلَّم مرة واحدة فقط', async()=>{
  const r=await A(request(app).get('/api/goals/future-notes'));
  eq(r.body.count,0,'لا تتكرر');
});

console.log('\n━━━ إنهاء الهدف ━━━');

await t('لا يُنهى هدف بلا توثيق', async()=>{
  const g=await A(request(app).post('/api/goals')).send({title:'هدف فارغ'});
  const r=await A(request(app).post(`/api/goals/${g.body.goal.id}/complete`));
  eq(r.status,400,'يجب الرفض');
  await A(request(app).delete(`/api/goals/${g.body.goal.id}`));
});

await t('🔥 إنهاء هدف موثّق ينجح', async()=>{
  const r=await A(request(app).post(`/api/goals/${futureGoalId}/complete`));
  eq(r.status,200,'status');
  ok(r.body.goal.completedAt,'وقت الإنهاء');
  eq(r.body.goal.isActive,false,'غير نشط');
  eq(r.body.summary.documented,1,'أسبوع موثّق');
});

await t('الهدف المكتمل لا يقبل أسابيع', async()=>{
  eq((await A(request(app).post(`/api/goals/${futureGoalId}/weeks`)).send({title:'x'})).status,403);
});

await t('الهدف المكتمل لا يُعدّل', async()=>{
  eq((await A(request(app).patch(`/api/goals/${futureGoalId}`)).send({title:'x'})).status,403);
});

await t('الإنهاء مرتين يُرفض', async()=>{
  eq((await A(request(app).post(`/api/goals/${futureGoalId}/complete`))).status,400);
});

console.log('\n━━━ الحذف ━━━');

await t('🔥 الهدف الموثّق لا يُحذف', async()=>{
  const r=await A(request(app).delete(`/api/goals/${goalId}`));
  eq(r.status,403,'يجب المنع');
});

await t('الهدف بلا توثيق يُحذف', async()=>{
  const g=await A(request(app).post('/api/goals')).send({title:'مؤقت'});
  eq((await A(request(app).delete(`/api/goals/${g.body.goal.id}`))).status,200);
});

console.log('\n━━━ العزل بين المستخدمين ━━━');

await t('🔥 مستخدم آخر لا يرى الهدف', async()=>{
  eq((await B(request(app).get(`/api/goals/${goalId}`))).status,404);
});

await t('🔥 مستخدم آخر لا يوثّق أسبوعاً ليس له', async()=>{
  const r=await B(request(app).post(`/api/goals/weeks/${week1Id}/document`)).send({
    reflection:'x',learnings:'y',mistakes:'z',
  });
  eq(r.status,404,'يجب ألا يجده');
});

await t('مستخدم آخر لا يحذف هدفاً ليس له', async()=>{
  eq((await B(request(app).delete(`/api/goals/${goalId}`))).status,404);
});

await t('قائمة المستخدم الثاني لا تحوي أهداف الأول', async()=>{
  const r=await B(request(app).get('/api/goals?filter=all'));
  eq(r.body.goals.length,0,'قائمة فارغة');
});

console.log('\n━━━ القوائم والإحصاءات ━━━');

await t('قائمة الأهداف النشطة', async()=>{
  const r=await A(request(app).get('/api/goals'));
  eq(r.status,200,'status');
  ok(Array.isArray(r.body.goals),'مصفوفة');
  ok(r.body.goals.every(g=>!g.completedAt),'كلها نشطة');
});

await t('فلتر المكتملة', async()=>{
  const r=await A(request(app).get('/api/goals?filter=completed'));
  ok(r.body.goals.every(g=>g.completedAt),'كلها مكتملة');
  ok(r.body.goals.length>=1,'واحد على الأقل');
});

await t('فلتر غير صالح يُرفض', async()=>{
  eq((await A(request(app).get('/api/goals?filter=xyz'))).status,400);
});

await t('الإحصاءات تحسب الأسابيع بدقة', async()=>{
  const r=await A(request(app).get('/api/goals/stats'));
  eq(r.status,200,'status');
  ok(r.body.stats.weeks.documented>=2,'أسبوعان موثّقان على الأقل');
  ok(r.body.stats.weeks.skipped>=1,'أسبوع متخطّى');
  ok(typeof r.body.stats.commitmentStreak==='number','السلسلة رقم');
  ok(r.body.stats.completionRate>=0 && r.body.stats.completionRate<=100,'النسبة منطقية');
});

await t('🔥 سلسلة الالتزام تنكسر بالتخطي', async()=>{
  // نبني هدفاً: وثّق ← تخطّى ← وثّق ← وثّق
  const g=await A(request(app).post('/api/goals')).send({title:'هدف السلسلة'});
  const gid=g.body.goal.id;
  let wid=g.body.goal.weeks[0].id;

  const doc=async(id)=>A(request(app).post(`/api/goals/weeks/${id}/document`))
    .send({reflection:'أ',learnings:'ب',mistakes:'ج'});
  const nextWeek=async()=>(await A(request(app).post(`/api/goals/${gid}/weeks`)).send({})).body.week.id;

  await doc(wid);                                    // 1 موثّق
  wid=await nextWeek();
  await A(request(app).post(`/api/goals/weeks/${wid}/skip`)).send({confirm:true}); // 2 متخطّى
  wid=await nextWeek();
  await doc(wid);                                    // 3 موثّق
  wid=await nextWeek();
  await doc(wid);                                    // 4 موثّق

  const r=await A(request(app).get('/api/goals/stats'));
  // آخر أسبوعين موثّقان ثم تخطٍّ — السلسلة = 2
  eq(r.body.stats.commitmentStreak,2,'السلسلة تتوقف عند التخطي');
});

console.log('\n━━━ المصادقة ━━━');

await t('بلا توكن يُرفض 401', async()=>{
  eq((await request(app).get('/api/goals')).status,401);
});

await t('توكن فاسد يُرفض', async()=>{
  eq((await request(app).get('/api/goals').set('Authorization','Bearer garbage')).status,401);
});

await t('هدف غير موجود يرجع 404', async()=>{
  eq((await A(request(app).get('/api/goals/00000000-0000-0000-0000-000000000000'))).status,404);
});

await t('أسبوع غير موجود يرجع 404', async()=>{
  eq((await A(request(app).get('/api/goals/weeks/00000000-0000-0000-0000-000000000000'))).status,404);
});

console.log(`\n${'═'.repeat(46)}`);
console.log(`  نجح ${pass} · فشل ${fail}`);
console.log('═'.repeat(46));

await prisma.$disconnect();
process.exit(fail>0?1:0);
