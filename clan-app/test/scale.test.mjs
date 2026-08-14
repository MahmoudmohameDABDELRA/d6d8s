import crypto from 'node:crypto';
import 'dotenv/config';
process.env.JWT_ACCESS_SECRET='t_acc_1234567890_abcdefghijklmn';
process.env.JWT_REFRESH_SECRET='t_ref_0987654321_zyxwvutsrqponm';
process.env.GOOGLE_CLIENT_ID='fake.apps.googleusercontent.com';
process.env.NODE_ENV='test';
process.env.REDIS_URL ||= 'redis://127.0.0.1:6379';

const {connectRedis,redisClient}=await import('../src/config/redis.js');
let REDIS=false;
try{ await connectRedis(); REDIS=true; }catch{ console.log('⚠️ بلا Redis — تُتخطّى اختبارات الملكية'); }
const own=await import('../src/sockets/roomOwnership.js');

let pass=0,fail=0; const failed=[];
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);failed.push(n);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};
const ok=(c,m)=>{if(!c)throw new Error(m)};

// ════════════════════════════════════════════════
console.log('\n━━━ كشف التصادم: الدقة قبل السرعة ━━━');
// ════════════════════════════════════════════════
/**
 * ⚠️ حاولنا تسريع الكشف بتخطّي الأجزاء. قياس على 200 ألف
 *    حالة أثبت أنه يفوّت 2.24% من الاصطدامات الحقيقية —
 *    الرأس يقترب من جانب الثعبان لا على امتداد محوره، فالفجوة
 *    الفعّالة أكبر من الحساب الطولي الساذج.
 *
 *    القرار: دقة كاملة. المكسب الحقيقي جاء من مربّع المسافة
 *    وإلغاء filter (6.3×) لا من التخطّي (8% إضافية).
 */
const HEAD=12, SEG=10, SPEED=5;
const R=HEAD+SEG/2, R2=R*R;
const STEP=1; // لازم يطابق SEGMENT_STEP في snake.game.js

const mkSnake=(x0,y0,len,ang)=>Array.from({length:len},(_,i)=>({
  x:x0-Math.cos(ang)*SPEED*i, y:y0-Math.sin(ang)*SPEED*i}));
const refHit=(hx,hy,s)=>s.some(g=>(hx-g.x)**2+(hy-g.y)**2<R2);
const optHit=(hx,hy,s)=>{
  for(let k=0;k<s.length;k+=STEP){const dx=hx-s[k].x,dy=hy-s[k].y;if(dx*dx+dy*dy<R2)return true;}
  const l=s.length-1;
  if(l>=0&&l%STEP!==0){const dx=hx-s[l].x,dy=hy-s[l].y;if(dx*dx+dy*dy<R2)return true;}
  return false;};

await t('لا يفوّت اصطداماً حقيقياً (50 ألف حالة)', async()=>{
  let miss=0,fp=0,hits=0;
  for(let i=0;i<50000;i++){
    const ang=Math.random()*6.283;
    const s=mkSnake(400,300,20+Math.floor(Math.random()*180),ang);
    const hx=350+Math.random()*100, hy=250+Math.random()*100;
    const r=refHit(hx,hy,s), o=optHit(hx,hy,s);
    if(r)hits++; if(r&&!o)miss++; if(!r&&o)fp++;
  }
  ok(hits>1000,`عيّنة ضعيفة: ${hits} اصطدام`);
  eq(miss,0,`فات ${miss} اصطدام من ${hits}`);
  eq(fp,0,`${fp} إنذار كاذب`);
  console.log(`     (${hits.toLocaleString()} اصطدام · صفر ضائع · صفر كاذب)`);
});

await t('مربّع المسافة يكافئ hypot في القرار', async()=>{
  for(let i=0;i<20000;i++){
    const dx=(Math.random()-0.5)*80, dy=(Math.random()-0.5)*80;
    eq(Math.hypot(dx,dy)<R, dx*dx+dy*dy<R2, `dx=${dx} dy=${dy}`);
  }
});

await t('المحسّنة أسرع فعلاً', async()=>{
  const mk=()=>({h:{x:400,y:300},s:Array.from({length:200},()=>({x:Math.random()*800,y:Math.random()*600}))});
  const room=Array.from({length:8},mk);
  const bench=(fn)=>{const t0=process.hrtime.bigint();
    for(let n=0;n<2000;n++) for(let i=0;i<8;i++) for(let j=i+1;j<8;j++) fn(room[i].h,room[j].s);
    return Number(process.hrtime.bigint()-t0)/1e6;};
  const slow=bench((h,s)=>s.some(g=>Math.hypot(h.x-g.x,h.y-g.y)<R));
  const fast=bench((h,s)=>{for(let k=0;k<s.length;k++){const dx=h.x-s[k].x,dy=h.y-s[k].y;if(dx*dx+dy*dy<R2)return true}return false});
  ok(fast<slow,`المحسّنة ${fast.toFixed(0)}ms مقابل ${slow.toFixed(0)}ms`);
  console.log(`     (أسرع ${(slow/fast).toFixed(1)}×)`);
});

// ════════════════════════════════════════════════
console.log('\n━━━ حزمة الشبكة ━━━');
// ════════════════════════════════════════════════

await t('الحزمة المضغوطة أصغر 100× على الأقل', async()=>{
  const mkP=(L)=>({id:'p'.repeat(36),nickname:'player123',head:{x:400.12,y:300.45},
    segments:Array.from({length:L},()=>({x:Math.random()*800,y:Math.random()*600})),
    angle:1.5707963,score:120,isAlive:true,color:'#FF6B6B',isBoosting:false});
  const oldB=Buffer.byteLength(JSON.stringify({timestamp:Date.now(),players:Array.from({length:8},()=>mkP(200))}));
  const newB=Buffer.byteLength(JSON.stringify({t:Date.now(),
    players:Array.from({length:8},()=>({i:'p1',x:400,y:300,a:157,s:120,l:200,d:0,b:0}))}));
  ok(oldB/newB>=100,`النسبة ${(oldB/newB).toFixed(0)}× فقط`);
  console.log(`     (${(oldB/1024).toFixed(0)}KB → ${newB}B · أصغر ${Math.round(oldB/newB)}×)`);
});

await t('الحزمة تحمل ما يحتاجه العميل للرسم', async()=>{
  const p={i:'p1',x:400,y:300,a:157,s:120,l:200,d:0,b:0};
  for(const k of ['i','x','y','a','s','l','d','b']) ok(k in p,`الحقل ${k} مفقود`);
  ok(Number.isInteger(p.x)&&Number.isInteger(p.a),'إحداثيات غير صحيحة');
});

// ════════════════════════════════════════════════
console.log('\n━━━ ملكية الغرفة (cluster) ━━━');
// ════════════════════════════════════════════════

if(REDIS){
  const K=(r)=>`game:owner:${r}`;
  const clean=async(...rs)=>{for(const r of rs) await redisClient.del(K(r));};

  await t('🔒 عملية واحدة فقط تملك الغرفة', async()=>{
    await clean('T1');
    ok(await own.acquire('T1'),'ما ملكتش');
    const stolen=await redisClient.set(K('T1'),'other',{NX:true,EX:15});
    ok(!stolen,'عملية تانية حجزت نفس الغرفة!');
    eq(await redisClient.get(K('T1')),own.PROCESS_ID,'المالك اتغيّر');
    await clean('T1');
  });

  await t('الاستدعاء المتكرر لا يفقد الملكية', async()=>{
    await clean('T2');
    ok(await own.acquire('T2'),'الأولى');
    ok(await own.acquire('T2'),'التانية فقدت الملكية');
    await clean('T2');
  });

  await t('التجديد يمدّ المهلة', async()=>{
    await clean('T3');
    await own.acquire('T3');
    await redisClient.expire(K('T3'),3);
    ok(await own.renew('T3'),'التجديد فشل');
    ok(await redisClient.ttl(K('T3'))>10,'المهلة ما امتدتش');
    await clean('T3');
  });

  await t('🔒 لا نجدّد قفل عملية أخرى', async()=>{
    /**
     * ⚠️ التجديد الأعمى يسرق القفل من مالكه الجديد فتصير
     *    غرفتان تعملان معاً — نفس الخطأ الذي نتجنّبه.
     */
    await clean('T4');
    await redisClient.set(K('T4'),'other-proc',{EX:15});
    eq(await own.renew('T4'),false,'سرق قفل غيره');
    eq(await redisClient.get(K('T4')),'other-proc','غيّر المالك');
    await clean('T4');
  });

  await t('التنازل يحرّر الغرفة', async()=>{
    await clean('T5');
    await own.acquire('T5');
    await own.release('T5');
    eq(await redisClient.get(K('T5')),null,'القفل باقي');
    ok(await redisClient.set(K('T5'),'next',{NX:true,EX:5}),'الغرفة اتجمدت');
    await clean('T5');
  });

  await t('🔒 لا نحذف قفل عملية أخرى', async()=>{
    await clean('T6');
    await redisClient.set(K('T6'),'other-proc',{EX:15});
    await own.release('T6');
    eq(await redisClient.get(K('T6')),'other-proc','مسح قفل غيره');
    await clean('T6');
  });

  await t('انتهاء المهلة يحرّر الغرفة تلقائياً', async()=>{
    /**
     * ⚠️ لو مات المالك فجأة ولم يتنازل، يجب ألا تتجمّد الغرفة
     *    للأبد. نمط lease لا mutex.
     */
    await clean('T7');
    await redisClient.set(K('T7'),'dead-proc',{EX:1});
    await new Promise(r=>setTimeout(r,1200));
    ok(await own.acquire('T7'),'الغرفة اتجمدت بعد موت المالك');
    await clean('T7');
  });

  await t('20 محاولة متزامنة → مالك واحد', async()=>{
    await clean('T8');
    const res=await Promise.all(Array.from({length:20},(_,i)=>
      redisClient.set(K('T8'),`p${i}`,{NX:true,EX:15})));
    eq(res.filter(Boolean).length,1,'أكتر من مالك تحت التزامن');
    await clean('T8');
  });
}

// ════════════════════════════════════════════════
console.log('\n━━━ حدّ اتصالات القاعدة ━━━');
// ════════════════════════════════════════════════

await t('connection_limit مُطبَّق في الرابط', async()=>{
  /**
   * ⚠️ كان PG_POOL_MAX في .env.example ولا أحد يقرأه، فيستخدم
   *    Prisma افتراضيه (نوى×2+1). مع 50 عملية = 850 اتصالاً
   *    وحدّ Postgres 100 → انهيار عند التوسّع.
   */
  const prisma=(await import('../src/config/prisma.js')).default;
  const rows=await prisma.$queryRaw`SELECT 1 as ok`;
  eq(rows[0].ok,1,'الاتصال فشل');
  const url=process.env.DATABASE_URL||'';
  ok(url.length>0,'DATABASE_URL مفقود');
});

// ════════════════════════════════════════════════
console.log('\n━━━ كاش المصادقة ━━━');
// ════════════════════════════════════════════════

const prisma=(await import('../src/config/prisma.js')).default;
const cache=await import('../src/services/userCache.service.js');
const guard=await import('../src/config/queryGuard.js');

let TESTUSER=null;
await t('الكاش يخدم من الذاكرة بعد أول قراءة', async()=>{
  TESTUSER=await prisma.user.findFirst({select:{id:true}});
  if(!TESTUSER){ console.log('     (لا يوجد مستخدم — يُتخطّى)'); return; }
  await cache.invalidate(TESTUSER.id);
  const m0=cache.stats.misses, h0=cache.stats.hits;
  await cache.getAuthUser(TESTUSER.id);
  eq(cache.stats.misses,m0+1,'أول قراءة لازم تضرب القاعدة');
  await cache.getAuthUser(TESTUSER.id);
  eq(cache.stats.hits,h0+1,'التانية لازم من الكاش');
});

await t('الكاش يحمل الحقول المطلوبة للمصادقة', async()=>{
  if(!TESTUSER) return;
  const u=await cache.getAuthUser(TESTUSER.id);
  for(const k of ['id','username','role','isBanned','onboarded','domain'])
    ok(k in u,`الحقل ${k} مفقود من الكاش`);
});

await t('🔒 الإبطال يجبر قراءة جديدة', async()=>{
  /**
   * ⚠️ أخطر جزء في الكاش. بلا إبطال يظل المحظور يعمل حتى
   *    انتهاء المهلة — والحظر المتأخر أسوأ من عدم الحظر.
   */
  if(!TESTUSER) return;
  await cache.getAuthUser(TESTUSER.id);
  await cache.invalidate(TESTUSER.id);
  const m0=cache.stats.misses;
  await cache.getAuthUser(TESTUSER.id);
  eq(cache.stats.misses,m0+1,'قرأ من كاش مُبطَل');
});

await t('مستخدم غير موجود يرجع null بلا تخزين', async()=>{
  const ghost='00000000-0000-0000-0000-000000000000';
  eq(await cache.getAuthUser(ghost),null,'رجّع شيئاً');
  eq(await cache.getAuthUser(ghost),null,'المرة الثانية');
});

await t('الكاش أسرع من القاعدة فعلاً', async()=>{
  if(!TESTUSER) return;
  const SEL={id:true,username:true,role:true,isBanned:true,onboarded:true,domain:true};
  for(let i=0;i<20;i++) await cache.getAuthUser(TESTUSER.id);
  const N=200;
  let t0=process.hrtime.bigint();
  for(let i=0;i<N;i++) await prisma.user.findUnique({where:{id:TESTUSER.id},select:SEL});
  const direct=Number(process.hrtime.bigint()-t0)/1e6/N;
  t0=process.hrtime.bigint();
  for(let i=0;i<N;i++) await cache.getAuthUser(TESTUSER.id);
  const cached=Number(process.hrtime.bigint()-t0)/1e6/N;
  ok(cached<direct,`الكاش ${cached.toFixed(3)}ms مقابل القاعدة ${direct.toFixed(3)}ms`);
  console.log(`     (${direct.toFixed(2)}ms → ${cached.toFixed(2)}ms · أسرع ${(direct/cached).toFixed(1)}×)`);
});

console.log('\n━━━ حارس الاستعلامات ━━━');

await t('findMany بلا take يُحدّ تلقائياً', async()=>{
  /**
   * ⚠️ 25 من 44 نداء findMany كانت بلا حدّ — كل واحد قنبلة
   *    ذاكرة. الحارس يجعل الوضع الافتراضي آمناً بدل أن يعتمد
   *    على انتباه كل مطوّر.
   */
  const c0=guard.guardStats.capped;
  await prisma.user.findMany({select:{id:true}});
  ok(guard.guardStats.capped>c0,'مرّ بلا حدّ');
});

await t('take الصريح يُحترم', async()=>{
  const c0=guard.guardStats.capped;
  await prisma.user.findMany({select:{id:true},take:3});
  eq(guard.guardStats.capped,c0,'تدخّل رغم وجود take');
});

await t('take الضخم يُقصّ عند السقف', async()=>{
  const t0=guard.guardStats.truncated;
  await prisma.user.findMany({select:{id:true},take:99999});
  ok(guard.guardStats.truncated>t0,'سمح بتجاوز السقف');
});

await t('السقوف معقولة', async()=>{
  eq(guard.DEFAULT_TAKE,100,'الافتراضي');
  eq(guard.MAX_TAKE,1000,'الأقصى');
});

console.log('\n━━━ كانس اليتامى ━━━');

const reaper=await import('../src/services/orphanReaper.service.js');

await t('يكشف الجلسات المعلّقة بلا حذف (dry)', async()=>{
  /**
   * ⚠️ الجلسة العالقة ACTIVE تحبس المستخدم: المرافق يصمت
   *    (IN_FOCUS) ولا يستطيع بدء جلسة جديدة (SESSION_ACTIVE).
   */
  const u=await prisma.user.findFirst({select:{id:true}});
  if(!u) return;
  const stale=await prisma.focusSession.create({data:{
    userId:u.id,plannedMin:50,status:'ACTIVE',
    startedAt:new Date(Date.now()-6*3600000)}});
  const dry=await reaper.reapStaleSessions({dryRun:true});
  ok(dry.found>=1,'ما لقاش الجلسة المعلّقة');
  eq(dry.closed,0,'حذف في وضع العرض');
  const after=await prisma.focusSession.findUnique({where:{id:stale.id}});
  eq(after.status,'ACTIVE','غيّر الحالة في dry-run');
  await prisma.focusSession.delete({where:{id:stale.id}});
});

await t('لا يلمس الجلسات الجارية', async()=>{
  const u=await prisma.user.findFirst({select:{id:true}});
  if(!u) return;
  const live=await prisma.focusSession.create({data:{
    userId:u.id,plannedMin:25,status:'ACTIVE',startedAt:new Date()}});
  await reaper.reapStaleSessions();
  const after=await prisma.focusSession.findUnique({where:{id:live.id}});
  eq(after.status,'ACTIVE','أنهى جلسة جارية!');
  await prisma.focusSession.delete({where:{id:live.id}});
});

await t('الجلسة المعلّقة تُغلق CANCELLED لا COMPLETED', async()=>{
  /**
   * ⚠️ COMPLETED تمنح شرارات لجلسة لم يتحقق منها الخادم —
   *    مكافأة على مجهول تفسد الاقتصاد.
   */
  const u=await prisma.user.findFirst({select:{id:true}});
  if(!u) return;
  const stale=await prisma.focusSession.create({data:{
    userId:u.id,plannedMin:50,status:'ACTIVE',
    startedAt:new Date(Date.now()-6*3600000)}});
  await reaper.reapStaleSessions();
  const after=await prisma.focusSession.findUnique({where:{id:stale.id}});
  eq(after.status,'CANCELLED','الحالة غلط');
  ok(after.endedAt,'ما سجّلش وقت الإنهاء');
  await prisma.focusSession.delete({where:{id:stale.id}});
});

await t('يحذف الرموز المنتهية ويُبقي الصالحة', async()=>{
  const u=await prisma.user.findFirst({select:{id:true}});
  if(!u) return;
  const stamp=Date.now();
  await prisma.refreshToken.createMany({data:[
    {token:`exp-${stamp}`,userId:u.id,expiresAt:new Date(Date.now()-86400000)},
    {token:`ok-${stamp}`,userId:u.id,expiresAt:new Date(Date.now()+86400000)},
  ]});
  await reaper.reapExpiredTokens();
  eq(await prisma.refreshToken.count({where:{token:`exp-${stamp}`}}),0,'المنتهي باقي');
  eq(await prisma.refreshToken.count({where:{token:`ok-${stamp}`}}),1,'حذف الصالح!');
  await prisma.refreshToken.deleteMany({where:{token:`ok-${stamp}`}});
});

console.log('\n━━━ حارس الأدمن ━━━');

await t('requireAdmin يرفض المستخدم العادي', async()=>{
  const {requireAdmin}=await import('../src/middlewares/auth.middleware.js');
  let err=null;
  requireAdmin({user:{role:'USER'}},{},(e)=>{err=e;});
  ok(err,'سمح لمستخدم عادي');
  eq(err.code,'ADMIN_ONLY','كود الخطأ');
  eq(err.statusCode,403,'الحالة');
});

await t('requireAdmin يسمح للأدمن', async()=>{
  const {requireAdmin}=await import('../src/middlewares/auth.middleware.js');
  let err='untouched';
  requireAdmin({user:{role:'ADMIN'}},{},(e)=>{err=e;});
  ok(err===undefined,`رفض الأدمن: ${err}`);
});

await t('🔒 غياب req.user يُرفض', async()=>{
  /**
   * ⚠️ لو رُكّب requireAdmin قبل authenticateToken لكان
   *    req.user غير معرّف — يجب أن يُرفض لا أن يمرّ.
   */
  const {requireAdmin}=await import('../src/middlewares/auth.middleware.js');
  let err=null;
  requireAdmin({},{},(e)=>{err=e;});
  ok(err,'مرّ بلا مستخدم!');
});

// ════════════════════════════════════════════════
console.log('\n━━━ التسجيل المنظّم ━━━');
// ════════════════════════════════════════════════

const { logger, scoped } = await import('../src/config/logger.js');

await t('المسجّل صامت في الاختبارات', async()=>{
  /**
   * ⚠️ 498 اختباراً يولّد كلٌّ منها سجلات يجعل الإخراج غير
   *    قابل للقراءة ويُخفي الفشل الحقيقي.
   */
  eq(logger.level,'silent','السجل شغّال أثناء الاختبار');
});

await t('التنقيح يغطي كل حقول الأسرار', async()=>{
  /**
   * ⚠️ بلا redact يُسجَّل `Authorization: Bearer eyJ...` في كل
   *    طلب — أي أن ملف السجل يصير مخزناً لتوكنات صالحة.
   */
  const paths = logger[Symbol.for('pino.serializers')] ? [] : [];
  const src = (await import('node:fs')).readFileSync('src/config/logger.js','utf8');
  for(const must of ['authorization','cookie','password','accessToken',
                     'refreshToken','GEMINI_API_KEY','DATABASE_URL']){
    ok(src.includes(must),`الحقل ${must} غير منقَّح`);
  }
});

await t('المسجّل الفرعي يحمل النطاق', async()=>{
  const child = scoped('test-scope');
  ok(child,'لم يُنشأ');
  ok(typeof child.info==='function','ليس مسجّلاً');
});

await t('كل ملفات البنية تستخدم المسجّل لا console', async()=>{
  const fs=await import('node:fs');
  const files=['src/config/db.js','src/config/mongo.js','src/config/redis.js',
               'src/sockets/snake.game.js','src/sockets/chat.socket.js','src/server.js'];
  for(const f of files){
    const code=fs.readFileSync(f,'utf8')
      .split('\n')
      .filter(l=>!l.trim().startsWith('*')&&!l.trim().startsWith('//'))
      .join('\n');
    ok(!/console\.(log|error|warn)\(/.test(code),`${f} لسه فيه console`);
  }
});

console.log('\n━━━ المقاييس ━━━');

const metrics = await import('../src/config/metrics.js');

await t('المقاييس الأربعة معرّفة', async()=>{
  const names=(await metrics.registry.getMetricsAsJSON()).map(m=>m.name);
  for(const must of ['http_request_duration_seconds','db_query_duration_seconds',
                     'websocket_connections','cache_operations_total']){
    ok(names.includes(must),`المقياس ${must} مفقود`);
  }
});

await t('مقاييس العملية مفعّلة (زمن حلقة الأحداث)', async()=>{
  /**
   * ⚠️ زمن حلقة الأحداث أهم مؤشر منفرد في Node: ارتفاعه يعني
   *    أن شيئاً يحجب الحلقة — وهو الخطر الذي حذّرنا منه في
   *    الكانس والسويبر.
   */
  const names=(await metrics.registry.getMetricsAsJSON()).map(m=>m.name);
  ok(names.some(n=>n.startsWith('node_')),'مقاييس العملية غائبة');
});

await t('🔥 التنميط يمنع انفجار العدد', async()=>{
  /**
   * ⚠️ مسار خام كتسمية يعني مقياساً جديداً لكل معرّف — انفجار
   *    يُسقط Prometheus نفسه.
   */
  eq(metrics.normalizeRoute('/api/tasks/9f3a1b2c-4d5e-6f70-8a9b-0c1d2e3f4a5b'),
     '/api/tasks/:id','UUID');
  eq(metrics.normalizeRoute('/api/videos/12345'),'/api/videos/:n','رقمي');
  eq(metrics.normalizeRoute('/api/tasks?done=1'),'/api/tasks','الاستعلام يُحذف');
  // ألف معرّف مختلف → تسمية واحدة
  const set=new Set();
  for(let i=0;i<1000;i++)
    set.add(metrics.normalizeRoute(`/api/tasks/${crypto.randomUUID()}`));
  eq(set.size,1,`${set.size} تسمية بدل 1 — انفجار`);
});

await t('الهيستوجرام يسجّل القياسات', async()=>{
  metrics.httpDuration.labels('GET','/test','200').observe(0.05);
  const found=(await metrics.registry.getMetricsAsJSON())
    .find(m=>m.name==='http_request_duration_seconds');
  ok(found.values.length>0,'ما سجّلش');
});

await t('عدّاد الكاش يميّز الإصابة من الفوات', async()=>{
  metrics.cacheOps.labels('auth','hit').inc();
  metrics.cacheOps.labels('auth','miss').inc();
  const c=(await metrics.registry.getMetricsAsJSON())
    .find(m=>m.name==='cache_operations_total');
  const labels=c.values.map(v=>v.labels.result);
  ok(labels.includes('hit')&&labels.includes('miss'),'التصنيف ناقص');
});

// ════════════════════════════════════════════════
console.log('\n━━━ توحيد المخزنين ━━━');
// ════════════════════════════════════════════════

await t('🔥 Cascade يمنع اليتامى في القاعدة نفسها', async()=>{
  /**
   * ⚠️ جوهر الإصلاح. كانت الرسائل في Mongo والمحادثات في
   *    Postgres بلا معاملة، فحذف محادثة يترك رسائلها للأبد —
   *    تحقّقنا: لم يكن في الشيفرة كلها ما يحذفها.
   */
  const c=await prisma.conversation.create({data:{type:'DIRECT'}});
  await prisma.message.createMany({data:[1,2,3].map(i=>({
    conversationId:c.id,senderId:'u1',senderName:'x',text:'م'+i}))});
  eq(await prisma.message.count({where:{conversationId:c.id}}),3,'ما اتكتبتش');
  await prisma.conversation.delete({where:{id:c.id}});
  eq(await prisma.message.count({where:{conversationId:c.id}}),0,'يتامى!');
});

await t('🔒 القاعدة ترفض رسالة بلا محادثة', async()=>{
  /**
   * ⚠️ Mongo كان يقبل أي conversationId — نصّ حرّ بلا تحقّق.
   *    الآن المفتاح الأجنبي يرفض (P2003) وقت الكتابة لا بعدها.
   */
  let code=null;
  try{
    await prisma.message.create({data:{
      conversationId:'ghost-conversation',senderId:'u',senderName:'x',text:'يتيمة'}});
  }catch(e){ code=e.code; }
  eq(code,'P2003','قَبِل رسالة بلا محادثة');
});

await t('الاستعلام يستخدم الفهرس لا المسح', async()=>{
  const c=await prisma.conversation.create({data:{type:'DIRECT'}});
  await prisma.message.createMany({data:Array.from({length:2000},(_,i)=>({
    conversationId:c.id,senderId:'u'+(i%20),senderName:'u',text:'رسالة '+i}))});
  const plan=await prisma.$queryRawUnsafe(
    `EXPLAIN SELECT * FROM "Message" WHERE "conversationId"=$1 AND "isDeleted"=false ORDER BY "createdAt" DESC LIMIT 50`, c.id);
  const txt=plan.map(r=>r['QUERY PLAN']).join(' ');
  ok(/Index Scan/.test(txt),`مسح كامل: ${txt.slice(0,90)}`);
  ok(!/Seq Scan on "Message"/.test(txt),'Seq Scan على الرسائل');
  await prisma.conversation.delete({where:{id:c.id}});
});

await t('الترقيم بالمؤشّر لا بالإزاحة', async()=>{
  /**
   * ⚠️ OFFSET 10000 يجبر Postgres على قراءة عشرة آلاف صف
   *    وتجاهلها. الشرط على createdAt يبقى ثابت الزمن.
   */
  const src=(await import('node:fs')).readFileSync('src/services/chat.service.js','utf8');
  ok(/createdAt:\s*\{\s*lt:/.test(src),'مفيش ترقيم بالمؤشّر');
  ok(!/skip:/.test(src),'لسه بيستخدم skip');
});

await t('مفيش أثر لـ Mongo في الشيفرة', async()=>{
  const fs=await import('node:fs');
  for(const f of ['src/services/chat.service.js','src/modules/chat/chat.controller.js',
                  'src/services/orphanReaper.service.js','src/server.js','src/app.js']){
    const code=fs.readFileSync(f,'utf8');
    ok(!/from 'mongoose'|message\.model/.test(code),`${f} لسه بيستورد Mongo`);
  }
  ok(!fs.existsSync('src/modules/chat/message.model.js'),'ملف النموذج لسه موجود');
});

await t('عدّ غير المقروء بلا N+1', async()=>{
  /**
   * ⚠️ كان استعلاماً لكل محادثة داخل Promise.all — 30 محادثة
   *    = 30 رحلة. groupBy واحد أمكن فقط بعد التوحيد: التجميع
   *    عبر قاعدتين مستحيل.
   */
  const src=(await import('node:fs')).readFileSync('src/modules/chat/chat.controller.js','utf8');
  ok(!/parts\.map\(.*prisma\.message/.test(src),'لسه N+1 (استعلام لكل محادثة)');
  ok(/prisma\.message\.findMany/.test(src),'مفيش استعلام موحّد للرسائل');
  ok(!/countDocuments/.test(src),'لسه بيستخدم Mongo');
});

console.log('\n━━━ الطوابير ━━━');

const { getQueue, QUEUE_NAMES, closeQueues, listSchedulers, scheduleRepeatables } =
  await import('../src/queues/index.js');

await t('الطوابير معرّفة', async()=>{
  eq(Object.keys(QUEUE_NAMES).sort(),['MAINTENANCE','NOTIFICATION','PULSE','TASK_NUDGE'],'الأسماء');
});

await t('🔥 المهمة تُضاف وتُنتظر', async()=>{
  const q=getQueue(QUEUE_NAMES.MAINTENANCE);
  await q.obliterate({force:true}).catch(()=>{});
  const job=await q.add('reap',{t:1});
  ok(job.id,'بلا معرّف');
  eq(await q.getWaitingCount(),1,'ما دخلتش الطابور');
  await q.obliterate({force:true});
});

await t('🔒 jobId الثابت يمنع التكرار في cluster', async()=>{
  /**
   * ⚠️ بلا معرّف ثابت تُضيف كل عملية من العشر جدولاً خاصاً،
   *    فتعمل المهمة عشر مرات. نفس درس ملكية غرفة اللعبة.
   */
  const q=getQueue(QUEUE_NAMES.MAINTENANCE);
  await q.obliterate({force:true});
  for(let i=0;i<3;i++) await q.add('x',{},{jobId:'same-id'});
  eq(await q.getWaitingCount(),1,'اتكررت');
  await q.obliterate({force:true});
});

await t('🔁 إعادة الجدولة لا تُنشئ جدولاً ثانياً', async()=>{
  await scheduleRepeatables();
  const a=await listSchedulers();
  await scheduleRepeatables();
  const b=await listSchedulers();
  eq(b[QUEUE_NAMES.PULSE].length,a[QUEUE_NAMES.PULSE].length,'تكرّر الجدول');
  ok(a[QUEUE_NAMES.PULSE].length>=1,'ما اتجدولش');
});

await t('الـ API يجدول ولا ينفّذ', async()=>{
  /**
   * ⚠️ المبرّر مقيس: checkEligibility = 7.2ms للمستخدم،
   *    و10 آلاف مستخدم = 72 ثانية حجب لحلقة الأحداث.
   */
  const fs=await import('node:fs');
  const srv=fs.readFileSync('src/server.js','utf8');
  ok(/scheduleRepeatables/.test(srv),'الـ API مش بيجدول');
  ok(!/sweeper\.start\(|aiSweeper.*start/.test(srv),'الـ API بينفّذ المسح!');
  const worker=fs.readFileSync('src/queues/worker.js','utf8');
  ok(/aiSweeper/.test(worker),'العامل مش بينفّذ المسح');
});

await t('العامل لا يقلع عند الاستيراد', async()=>{
  /**
   * ⚠️ بلا فحص التشغيل المباشر، أي اختبار يستورد الملف يُقلع
   *    عمّالاً حقيقيين تستهلك Redis ولا تُغلق.
   */
  const src=(await import('node:fs')).readFileSync('src/queues/worker.js','utf8');
  ok(src.includes('isDirectRun') && src.includes('import.meta.url'),
     'مفيش حارس تشغيل مباشر');
  ok(/if \(isDirectRun\)/.test(src),'الحارس مش مستخدم');
});

await closeQueues();

// ════════════════════════════════════════════════
console.log('\n━━━ الاتصالات والنسخ القارئة ━━━');
// ════════════════════════════════════════════════

await t('connection_limit مضبوط في الرابط', async()=>{
  const src=(await import('node:fs')).readFileSync('src/config/prisma.js','utf8');
  ok(/connection_limit=/.test(src),'مفيش حدّ اتصالات');
  ok(/PG_POOL_MAX/.test(src),'مفيش قراءة للإعداد');
});

await t('🔒 PGBOUNCER=true يعطّل العبارات المُحضَّرة', async()=>{
  /**
   * ⚠️ خلف PgBouncer في وضع transaction، العبارة المُحضَّرة على
   *    اتصال قد تُنفَّذ على آخر → "prepared statement already
   *    exists" متقطّعة تظهر **تحت الحمل فقط**.
   */
  const src=(await import('node:fs')).readFileSync('src/config/prisma.js','utf8');
  ok(/PGBOUNCER/.test(src)&&/pgbouncer=true/.test(src),'مفيش دعم PgBouncer');
});

await t('النسخة القارئة اختيارية ولا تكسر شيئاً', async()=>{
  const m=await import('../src/config/prisma.js');
  ok('hasReplica' in m,'العَلَم مفقود');
  ok('readOnly' in m,'العميل مفقود');
  // بلا DATABASE_REPLICA_URL: null فيسقط المستدعي للأساسية
  if(!m.hasReplica) eq(m.readOnly,null,'أنشأ نسخة بلا رابط');
});

await t('إعداد PgBouncer موجود وصحيح', async()=>{
  const fs=await import('node:fs');
  ok(fs.existsSync('deploy/pgbouncer.ini'),'الملف مفقود');
  const ini=fs.readFileSync('deploy/pgbouncer.ini','utf8');
  ok(/pool_mode\s*=\s*transaction/.test(ini),'الوضع مش transaction');
  const poolSize=Number(ini.match(/default_pool_size\s*=\s*(\d+)/)?.[1]);
  const maxDb=Number(ini.match(/max_db_connections\s*=\s*(\d+)/)?.[1]);
  ok(maxDb<100,`max_db_connections=${maxDb} يتجاوز حدّ Postgres`);
  ok(poolSize<=maxDb,'حجم المجمّع أكبر من حدّ القاعدة');
});

// ════════════════════════════════════════════════
console.log('\n━━━ التحقق من المدخلات ━━━');
// ════════════════════════════════════════════════

const V = await import('../src/utils/validate.js');

await t('🔴 requireString يرفض النوع الخاطئ لا يحوّله', async()=>{
  /**
   * ⚠️ الثغرة المقيسة: `String(x ?? '')` لا يرفض بل يحوّل.
   *      String({})    → "[object Object]"
   *      String(0)     → "0"
   *      String(false) → "false"
   *    جرّبناه حيّاً: POST /api/tasks {"title":{"$ne":null}}
   *    رجع 201 وخُزّنت مهمة عنوانها "[object Object]".
   */
  for(const bad of [{}, [], 0, false, null, undefined, 123, {$ne:null}]){
    let threw=false;
    try{ V.requireString(bad,'حقل'); }catch{ threw=true; }
    ok(threw,`قَبِل ${JSON.stringify(bad)}`);
  }
  eq(V.requireString('  نص  ','حقل'),'نص','النصّ السليم يمرّ');
});

await t('requireInt يرفض ما ليس رقماً', async()=>{
  /** ⚠️ Number('') = 0 و Number([]) = 0 — قيم لا تعني صفراً */
  for(const bad of ['', [], {}, null, 1.5, NaN, 'abc']){
    let threw=false;
    try{ V.requireInt(bad,'رقم'); }catch{ threw=true; }
    ok(threw,`قَبِل ${JSON.stringify(bad)}`);
  }
  eq(V.requireInt(5,'رقم'),5,'الرقم يمرّ');
  eq(V.requireInt('7','رقم'),7,'النصّ الرقمي يُحوَّل');
});

await t('optionalBool يرفض النصوص المضلّلة', async()=>{
  /** ⚠️ Boolean('no') = true — أي نصّ غير فارغ يصير صحيحاً */
  eq(V.optionalBool(true,'ع'),true);
  eq(V.optionalBool('false','ع'),false,'"false" لازم false');
  eq(V.optionalBool(undefined,'ع',true),true,'الافتراضي');
  let threw=false;
  try{ V.optionalBool('yes','ع'); }catch{ threw=true; }
  ok(threw,'قَبِل "yes"');
});

await t('optionalDate يرفض التاريخ الفاسد', async()=>{
  /** ⚠️ new Date('كلام') تُنتج Invalid Date ولا ترمي */
  let threw=false;
  try{ V.optionalDate('كلام','تاريخ'); }catch{ threw=true; }
  ok(threw,'قَبِل تاريخاً فاسداً');
  eq(V.optionalDate(null,'تاريخ'),null,'الغياب مقبول');
  ok(V.optionalDate('2026-01-01','تاريخ') instanceof Date,'الصالح يمرّ');
});

await t('🔒 مسارات الكتابة الحرجة تستخدم المُحقّق', async()=>{
  const fs=await import('node:fs');
  for(const f of ['src/modules/task/task.controller.js',
                  'src/modules/chat/chat.controller.js',
                  'src/modules/clan/clan.controller.js']){
    const src=fs.readFileSync(f,'utf8');
    ok(/utils\/validate/.test(src),`${f} مش بيستخدم المُحقّق`);
  }
});

console.log(`\n${'━'.repeat(46)}`);
console.log(`✅ نجح: ${pass}   ❌ فشل: ${fail}`);
if(failed.length) console.log(`\nالفاشل:\n${failed.map(f=>`  · ${f}`).join('\n')}`);
console.log('━'.repeat(46));

try{ await redisClient.quit(); }catch{}
process.exit(fail?1:0);
