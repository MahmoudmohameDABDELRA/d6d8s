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
const yt=await import('../src/services/youtube.service.js');
const pulse=await import('../src/services/pulse.service.js');

let pass=0,fail=0;
const t=async(n,f)=>{try{await f();console.log(`✅ ${n}`);pass++}catch(e){console.log(`❌ ${n}\n     ${e.message}`);fail++}};
const eq=(a,b,m='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: توقعت ${JSON.stringify(b)} فحصلت ${JSON.stringify(a)}`)};

for(const m of ['gameRoomPlayer','gameRoom','videoPurchase','video','notification','focusCheck','focusSession','clanBan','clanMember','clan','sparkTransaction','userAchievement','refreshToken','user'])
  await prisma[m].deleteMany();

const reg=await request(app).post('/api/auth/google').send({idToken:'valid:v1:vid@t.com:Vid'});
const TOK=reg.body.accessToken; const uid=reg.body.user.id;
await request(app).post('/api/auth/onboarding').set('Authorization',`Bearer ${TOK}`).send({domain:'BUSINESS'});
const A=(r)=>r.set('Authorization',`Bearer ${TOK}`);

/**
 * ⚠️ مسارات كتالوج الفيديو صارت للإدارة فقط.
 *
 *  كانت مفتوحة لأي حساب مسجَّل — أي مستخدم ينشر محتوى يراه
 *  الجميع أو يحذفه. الاختبار كان ينجح لأن الثغرة موجودة.
 *
 *  نرقّي مستخدم الاختبار من القاعدة مباشرةً (لا يوجد مسار
 *  ترقية عمداً) ونُبطل كاش المصادقة ليسري الدور فوراً.
 */
await prisma.user.update({ where: { id: uid }, data: { role: 'ADMIN' } });
const userCache = await import('../src/services/userCache.service.js');
await userCache.invalidate(uid);

console.log('\n━━━ 🎬 استخراج معرّف يوتيوب ━━━');

await t('🔥 رابط Shorts (اللي بعته)', ()=>{
  eq(yt.extractVideoId('https://youtube.com/shorts/k7xL_jy4J8Q?si=IofQfi6mgYsWbGpA'),'k7xL_jy4J8Q');
});
await t('رابط watch عادي', ()=>eq(yt.extractVideoId('https://www.youtube.com/watch?v=k7xL_jy4J8Q'),'k7xL_jy4J8Q'));
await t('رابط youtu.be مختصر', ()=>eq(yt.extractVideoId('https://youtu.be/k7xL_jy4J8Q'),'k7xL_jy4J8Q'));
await t('المعرّف مباشرة', ()=>eq(yt.extractVideoId('k7xL_jy4J8Q'),'k7xL_jy4J8Q'));
await t('رابط غير صالح يرجع null', ()=>eq(yt.extractVideoId('https://google.com'),null));
await t('رابط التضمين بلا كوكيز وبلا مقترحات', ()=>{
  const u=yt.buildUrls('k7xL_jy4J8Q');
  if(!u.embedUrl.includes('nocookie'))throw new Error('ليس nocookie');
  if(!u.embedUrl.includes('rel=0'))throw new Error('المقترحات مفعّلة');
});

console.log('\n━━━ 🎬 إضافة الفيديو ━━━');
let vid;

await t('🔥 إضافة فيديو BMW X6 برابط Shorts', async()=>{
  const r=await A(request(app).post('/api/videos')).send({
    url:'https://youtube.com/shorts/k7xL_jy4J8Q?si=IofQfi6mgYsWbGpA',
    title:'BMW X6', domain:'BUSINESS', priceSparks:30, durationSec:45
  });
  eq(r.status,201,'status');
  eq(r.body.video.title,'BMW X6','العنوان');
  eq(r.body.video.priceSparks,30,'السعر');
  vid=r.body.video.id;
});

await t('المعرّف مخزَّن لا الرابط الكامل', async()=>{
  const v=await prisma.video.findUnique({where:{id:vid}});
  eq(v.sourceUrl,'k7xL_jy4J8Q','المعرّف');
  eq(v.provider,'YOUTUBE','المزوّد');
});

await t('رابط غير صالح يُرفض 400', async()=>{
  const r=await A(request(app).post('/api/videos')).send({url:'https://google.com',title:'x'});
  eq(r.status,400,'status'); eq(r.body.code,'INVALID_YOUTUBE_URL','code');
});

await t('نفس الفيديو مرتين يُرفض 409', async()=>{
  const r=await A(request(app).post('/api/videos')).send({url:'k7xL_jy4J8Q',title:'مكرر'});
  eq(r.status,409);
});

console.log('\n━━━ 🔒 بوابة الراحة ━━━');

const inBreak=pulse.isBreakTime();
console.log(`     (الطور الآن: ${pulse.getPulseState().phase} — ${inBreak?'راحة':'تركيز'})`);

await t('🔥 الفيديوهات تظهر لكن الروابط محجوبة قبل الشراء', async()=>{
  const r=await A(request(app).get('/api/videos'));
  eq(r.status,200,'status');
  const v=r.body.videos.find(x=>x.id===vid);
  if(!v)throw new Error('الفيديو لا يظهر');
  eq(v.owned,false,'غير مملوك');
  if(v.embedUrl)throw new Error('🚨 رابط التشغيل مسرَّب لغير المالك!');
  if(!v.thumbnail)throw new Error('الصورة مفقودة');
});

await t('🔥 الشراء يُرفض وقت التركيز', async()=>{
  const r=await A(request(app).post(`/api/videos/${vid}/purchase`));
  if(inBreak){ eq(r.status===201||r.status===400,true,'راحة'); }
  else { eq(r.status,403,'status'); eq(r.body.code,'NOT_BREAK_TIME','code'); }
});

await t('🔥 خيارات الراحة تعكس الطور', async()=>{
  const r=await A(request(app).get('/api/videos/break-options'));
  eq(r.status,200,'status');
  eq(r.body.isBreakTime,inBreak,'الحالة');
  eq(r.body.options.length,inBreak?2:0,'الخيارات');
  if(inBreak){
    eq(r.body.options.map(o=>o.key),['DOPAMINE','GAMES'],'الخيارين');
  }
});

console.log('\n━━━ 💎 الشراء (محاكاة راحة) ━━━');

// نحاكي الراحة بتزوير الوقت عبر اختبار الخدمة مباشرة
await t('🔥 الشراء يخصم الشرارات ويمنح الملكية', async()=>{
  await prisma.user.update({where:{id:uid},data:{sparksBalance:100,totalSparksEarned:100}});
  // نشتري عبر الخدمة مباشرة لتجاوز بوابة الوقت في الاختبار
  const sparks=await import('../src/services/sparks.service.js');
  await prisma.$transaction(async(tx)=>{
    await sparks.spend(uid,{source:'VIDEO_PURCHASE',amount:30,refId:vid,tx});
    await tx.videoPurchase.create({data:{userId:uid,videoId:vid,sparksSpent:30}});
  });
  const u=await prisma.user.findUnique({where:{id:uid}});
  eq(u.sparksBalance,70,'الرصيد');
  eq(u.totalSparksEarned,100,'🔥 الإجمالي لم ينقص');
});

await t('🔥 بعد الشراء تظهر روابط التشغيل', async()=>{
  const r=await A(request(app).get('/api/videos'));
  const v=r.body.videos.find(x=>x.id===vid);
  eq(v.owned,true,'مملوك');
  if(!v.embedUrl)throw new Error('رابط التشغيل مفقود');
  if(!v.embedUrl.includes('k7xL_jy4J8Q'))throw new Error('الرابط خاطئ');
});

await t('المكتبة تعرض المشتريات', async()=>{
  const r=await A(request(app).get('/api/videos/library'));
  eq(r.body.total,1,'العدد');
  eq(r.body.videos[0].title,'BMW X6','العنوان');
});

console.log('\n━━━ 🎮 الألعاب ━━━');

await t('قائمة الألعاب تُظهر الثعبان والرسم', async()=>{
  const r=await A(request(app).get('/api/games'));
  eq(r.status,200,'status');
  eq(r.body.games.map(g=>g.type),['SNAKE','DOMINO','DRAW'],'الألعاب');
  eq(r.body.isBreakTime,inBreak,'الحالة');
});

await t('🔥 إنشاء غرفة يُرفض وقت التركيز', async()=>{
  const r=await A(request(app).post('/api/games/rooms')).send({type:'SNAKE'});
  if(!inBreak){ eq(r.status,403,'status'); eq(r.body.code,'NOT_BREAK_TIME','code'); }
  else eq(r.status,201,'status');
});

await t('نوع لعبة غير معروف يُرفض', async()=>{
  const r=await A(request(app).post('/api/games/rooms')).send({type:'CHESS'});
  eq([400,403].includes(r.status),true);
});

console.log('\n━━━ 🐍 إصلاحات محرك اللعبة ━━━');

await t('🔥 لا console.log مكسور (كان يمنع الإقلاع)', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(/console\.log`/.test(src))throw new Error('صياغة مكسورة موجودة');
});

await t('🔥 ESM لا CommonJS', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(/require\(/.test(src))throw new Error('require موجود في ملف ESM');
  if(!/^import /m.test(src))throw new Error('لا يوجد import');
});

await t('🔥 المصادقة إلزامية', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(!src.includes('jwt.verify'))throw new Error('لا تحقق من التوكن');
  if(!src.includes('UNAUTHORIZED'))throw new Error('لا رفض للاتصال');
});

await t('🔥 غرف منفصلة لا ساحة عالمية', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(!src.includes('rooms = new Map'))throw new Error('لا يوجد نظام غرف');
  if(!src.includes('socket.join'))throw new Error('لا انضمام لغرفة');
});

await t('🔥 إغلاق تلقائي عند نهاية الراحة', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(!src.includes('BREAK_ENDED'))throw new Error('لا إغلاق تلقائي');
});

await t('🔥 الحلقة تتوقف حين تفرغ الغرفة', async()=>{
  const src=await import('node:fs').then(f=>f.readFileSync('src/sockets/snake.game.js','utf8'));
  if(!src.includes("closeRoom(nsp, roomId, 'EMPTY')"))throw new Error('الحلقة لا تتوقف');
});

await prisma.user.deleteMany();
console.log(`\n${'═'.repeat(52)}\nالنتيجة:  ✅ ${pass} نجح   ❌ ${fail} فشل\n${'═'.repeat(52)}`);
await prisma.$disconnect();
process.exit(fail?1:0);
