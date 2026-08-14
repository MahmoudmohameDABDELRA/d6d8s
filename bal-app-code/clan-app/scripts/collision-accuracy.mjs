/**
 * يتحقق أن تحسين كشف التصادم لا يفوّت اصطداماً حقيقياً.
 * شغّله بعد أي تعديل على SEGMENT_STEP أو BASE_SPEED.
 *   node scripts/collision-accuracy.mjs
 */
// هل التخطي بيفوّت اصطدامات حقيقية؟ نقارن بالمرجع (فحص كل جزء)
const HEAD=12, SEG=10, SPEED=5;
const R=HEAD+SEG/2, R2=R*R;
const STEP=1; // ⚠️ القيمة المعتمدة في snake.game.js — غيّرها هنا لو غيّرتها هناك
console.log(`نصف قطر التصادم: ${R} · سرعة: ${SPEED} · الخطوة المحسوبة: ${STEP}`);
console.log(`فجوة التخطي: ${(STEP-1)*SPEED} بكسل — لازم تكون < ${R}\n`);

// ثعبان واقعي: أجزاء متتابعة بمسافة = السرعة
const mkSnake=(x0,y0,len,ang)=>Array.from({length:len},(_,i)=>({
  x:x0-Math.cos(ang)*SPEED*i, y:y0-Math.sin(ang)*SPEED*i}));

const refHit=(hx,hy,seg)=>seg.some(s=>(hx-s.x)**2+(hy-s.y)**2<R2);
const optHit=(hx,hy,seg)=>{
  for(let k=0;k<seg.length;k+=STEP){const dx=hx-seg[k].x,dy=hy-seg[k].y;if(dx*dx+dy*dy<R2)return true;}
  const last=seg.length-1;
  if(last>=0&&last%STEP!==0){const dx=hx-seg[last].x,dy=hy-seg[last].y;if(dx*dx+dy*dy<R2)return true;}
  return false;
};

let miss=0,falsePos=0,hits=0,total=0;
for(let t=0;t<200000;t++){
  const ang=Math.random()*Math.PI*2;
  const seg=mkSnake(400,300,20+Math.floor(Math.random()*180),ang);
  const hx=350+Math.random()*100, hy=250+Math.random()*100;
  const r=refHit(hx,hy,seg), o=optHit(hx,hy,seg);
  total++; if(r)hits++;
  if(r&&!o)miss++;
  if(!r&&o)falsePos++;
}
console.log(`${total.toLocaleString()} حالة · ${hits.toLocaleString()} اصطدام حقيقي`);
console.log(`اصطدامات فاتت:  ${miss}  ${miss===0?'✅':'🔴'}`);
console.log(`إنذارات كاذبة: ${falsePos}  ${falsePos===0?'✅':'🔴'}`);
