import 'dotenv/config';
process.env.JWT_ACCESS_SECRET='t_access_secret_1234567890_abcdefgh';
process.env.JWT_REFRESH_SECRET='t_refresh_secret_0987654321_hgfedcba';
process.env.NODE_ENV='test';

const prisma=(await import('../src/config/prisma.js')).default;
const sparks=await import('../src/services/sparks.service.js');
const pulse=await import('../src/services/pulse.service.js');
const {SPARKS,PULSE,TRIAL,LIMITS}=await import('../src/config/constants.js');

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

await prisma.sparkTransaction.deleteMany();
await prisma.user.deleteMany({where:{email:{startsWith:'p0_'}}});

console.log('\n━━━ حاسبات الشرارات (0.45 فردي · 0.75 جماعي) ━━━');
await t('فردي 30 دقيقة = 14 شرارة (13.5 → لأعلى)', ()=>eq(sparks.calcFocusSparks(30),14));
await t('فردي 60 دقيقة = 27 شرارة', ()=>eq(sparks.calcFocusSparks(60),27));
await t('جماعي 30 دقيقة = 23 شرارة (22.5 → لأعلى)', ()=>eq(sparks.calcFocusSparks(30,'PULSE'),23));
await t('🔥 النبض الكامل 90د = 68 شرارة (67.5 → لأعلى)', ()=>eq(sparks.calcFocusSparks(90,'PULSE'),68));
await t('كل مهمة = 2 شرارة', ()=>eq(sparks.calcTaskSparks(),2));
await t('الجماعي أعلى من الفردي لنفس المدة', ()=>{
  if(sparks.calcFocusSparks(30,'PULSE')<=sparks.calcFocusSparks(30))throw new Error('المعدل الجماعي ليس أعلى');
});

console.log('\n━━━ منح وصرف على قاعدة بيانات حقيقية ━━━');
const u=await prisma.user.create({data:{username:'p0_user',email:'p0_a@t.com',password:'x',domain:'TECH',specialty:'SOFTWARE_DEV'}});

await t('منح 14 شرارة (جلسة فردية 30د)', async()=>{
  const r=await sparks.award(u.id,{source:'FOCUS_SESSION',baseAmount:sparks.calcFocusSparks(30)});
  eq([r.amount,r.balance,r.totalEarned],[14,14,14]);
});

await t('منح 68 شرارة (نبض كامل)', async()=>{
  const r=await sparks.award(u.id,{source:'FOCUS_SESSION',baseAmount:sparks.calcFocusSparks(90,'PULSE')});
  eq(r.amount,68,'المبلغ');
  eq(r.balance,82,'الرصيد');
});

await t('🔥 الصرف ينقص الرصيد ولا يمس الإجمالي', async()=>{
  const r=await sparks.spend(u.id,{source:'VIDEO_PURCHASE',amount:50});
  eq(r.balance,32,'الرصيد');
  const b=await sparks.getBalance(u.id);
  eq(b.totalEarned,82,'الإجمالي لم يتغير');
});

await t('🔥 الصرف بلا رصيد كافٍ يُرفض', async()=>{
  try{await sparks.spend(u.id,{source:'SHOP_PURCHASE',amount:99999});throw new Error('سمح بالصرف!')}
  catch(e){if(e.code!=='INSUFFICIENT_SPARKS')throw e}
});

await t('كل حركة مسجَّلة مع balanceAfter', async()=>{
  const tx=await prisma.sparkTransaction.findMany({where:{userId:u.id},orderBy:{createdAt:'asc'}});
  eq(tx.length,3,'عدد الحركات');
  eq(tx.map(x=>x.amount),[14,68,-50],'المبالغ');
  eq(tx.map(x=>x.balanceAfter),[14,82,32],'الأرصدة');
});

await t('🔥 فحص السلامة يطابق', async()=>{
  const v=await sparks.verifyIntegrity(u.id);
  if(!v.isValid)throw new Error(`انحراف ${v.drift}`);
});

await t('🔥 20 منحة متزامنة بلا فقدان تحديثات', async()=>{
  const u2=await prisma.user.create({data:{username:'p0_race',email:'p0_b@t.com',password:'x',domain:'STUDY'}});
  await Promise.all(Array.from({length:20},()=>sparks.award(u2.id,{source:'TASK_COMPLETED',baseAmount:2})));
  const b=await sparks.getBalance(u2.id);
  eq(b.balance,40,'الرصيد بعد 20 مهمة');
  const v=await sparks.verifyIntegrity(u2.id);
  if(!v.isValid)throw new Error(`انحراف ${v.drift}`);
});

console.log('\n━━━ دورة النبض ━━━');
await t('الأطوار تغطي 120 دقيقة بلا فجوات', ()=>{
  let prev=0;
  for(const p of PULSE.PHASES){eq(p.start,prev,`فجوة عند ${p.phase}`);prev=p.end}
  eq(prev,120,'المجموع');
});

await t('🔥 3 فترات تركيز × 30 = 90 دقيقة', ()=>{
  const f=PULSE.PHASES.filter(p=>p.isFocus);
  eq(f.length,3,'عدد الفترات');
  eq(f.reduce((s,p)=>s+(p.end-p.start),0),90,'المجموع');
});

await t('الدورة تبدأ عند ساعة زوجية UTC', ()=>{
  for(const h of [0,3,7,13,23]){
    const d=new Date(Date.UTC(2026,0,15,h,37));
    const s=pulse.getCurrentCycleStart(d);
    if(s.getUTCHours()%2!==0)throw new Error(`ساعة فردية: ${s.getUTCHours()}`);
    if(s>d)throw new Error('البداية في المستقبل');
  }
});

await t('🔥 الطور الصحيح في كل لحظة', ()=>{
  const cases=[[2,'LOBBY'],[9,'FOCUS_1'],[39,'BREAK_1'],[45,'FOCUS_2'],[50,'FOCUS_2'],[75,'BREAK_2'],[85,'FOCUS_3'],[114,'FOCUS_3'],[115,'LOBBY'],[119,'LOBBY']];
  for(const [min,expected] of cases){
    const d=new Date(Date.UTC(2026,0,15,14,min));
    eq(pulse.getPulseState(d).phase,expected,`الدقيقة ${min}`);
  }
});

await t('🔥 اللوبي 5 دقائق — الحجز متاح فيه فقط', ()=>{
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,0))).canReserve,true,'الدقيقة 0');
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,4))).canReserve,true,'الدقيقة 4');
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,5))).canReserve,false,'الدقيقة 5 (بدأ التركيز)');
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,20))).canJoin,false,'أثناء التركيز');
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,116))).canReserve,true,'لوبي نهاية الدورة (116)');
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,119))).canReserve,true,'لوبي نهاية الدورة (119)');
});

await t('🔥 الدورة تنتهي بلوبي يمهّد للدورة التالية', ()=>{
  const last=PULSE.PHASES[PULSE.PHASES.length-1];
  eq(last.phase,'LOBBY','آخر طور');
  eq(last.isFocus,false,'لوبي لا تركيز');
  eq(last.end,120,'ينتهي عند 120');
  if(PULSE.PHASES.some(p=>p.phase==='BREAK_3'))throw new Error('BREAK_3 لا يزال موجوداً');
});

await t('🔥 بوابة الدوبامين: الراحة فقط', ()=>{
  eq(pulse.isBreakTime(new Date(Date.UTC(2026,0,15,14,40))),true,'BREAK_1');
  eq(pulse.isBreakTime(new Date(Date.UTC(2026,0,15,14,80))),true,'BREAK_2');
  eq(pulse.isBreakTime(new Date(Date.UTC(2026,0,15,14,20))),false,'تركيز');
  eq(pulse.isBreakTime(new Date(Date.UTC(2026,0,15,14,5))),false,'لوبي');
  eq(pulse.isBreakTime(new Date(Date.UTC(2026,0,15,14,119))),false,'آخر دقيقة لوبي');
});

await t('رقم فترة التركيز صحيح', ()=>{
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,20))).focusBlock,1);
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,60))).focusBlock,2);
  eq(pulse.getPulseState(new Date(Date.UTC(2026,0,15,14,100))).focusBlock,3);
});

console.log('\n━━━ التجربة والاشتراك ━━━');
await t('التجربة 3 أيام × 3 رسائل', ()=>{
  eq([TRIAL.DAYS,TRIAL.AI_MESSAGES_PER_DAY],[3,3]);
});
await t('الوضع الصارم: 3 خروقات', ()=>eq(LIMITS.STRICT_MODE_MAX_VIOLATIONS,3));

console.log('\n━━━ الأوسمة ━━━');
await t('15 وساماً مزروعاً', async()=>eq(await prisma.achievement.count(),15));
await t('5 فئات × 3 مستويات', async()=>{
  for(const c of ['FOCUS','STREAK','TRIBE','REFLECTION','EARLY_BIRD'])
    eq(await prisma.achievement.count({where:{category:c}}),3,c);
});
await t('🔥 وسام قائد الكتيبة لم يعد مرتبطاً بالصدارة', async()=>{
  const g=await prisma.achievement.findUnique({where:{code:'TRIBE_GOLD'}});
  if(/صدارة|المركز الأول/.test(g.description))throw new Error('لا يزال يشير للصدارة');
});

await prisma.user.deleteMany({where:{email:{startsWith:'p0_'}}});
console.log(`\n${'═'.repeat(48)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(48)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
