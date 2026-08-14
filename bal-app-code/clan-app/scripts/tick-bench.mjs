const C={MAX_LENGTH:200,MAX_FOOD:50,W:800,H:600,SPD:5};
const mk=(n,L)=>({players:new Map(Array.from({length:n},(_,i)=>['p'+i,{
  isAlive:true,angle:Math.random()*6.28,nextAngle:Math.random()*6.28,
  head:{x:Math.random()*800,y:Math.random()*600},
  segments:Array.from({length:L},()=>({x:Math.random()*800,y:Math.random()*600}))}])),
  food:Array.from({length:50},()=>({x:Math.random()*800,y:Math.random()*600}))});

// النسخة الحالية: Math.hypot + فحص كل جزء
const tickNow=(r)=>{
  for(const p of r.players.values()){
    p.angle=p.nextAngle;
    p.head.x=((p.head.x+Math.cos(p.angle)*C.SPD)%C.W+C.W)%C.W;
    p.head.y=((p.head.y+Math.sin(p.angle)*C.SPD)%C.H+C.H)%C.H;
    p.segments.unshift({...p.head});
    if(p.segments.length>C.MAX_LENGTH) p.segments.pop();
  }
  for(const p of r.players.values()) r.food=r.food.filter(f=>Math.hypot(p.head.x-f.x,p.head.y-f.y)>=10);
  const a=[...r.players.values()];
  for(let i=0;i<a.length;i++) for(let j=i+1;j<a.length;j++)
    a[j].segments.some(s=>Math.hypot(a[i].head.x-s.x,a[i].head.y-s.y)<11);
};

// محسّنة: مربع المسافة (بلا جذر) + تخطي الأجزاء (كل 3) + بلا filter/spread
const tickOpt=(r)=>{
  for(const p of r.players.values()){
    p.angle=p.nextAngle;
    p.head.x=((p.head.x+Math.cos(p.angle)*C.SPD)%C.W+C.W)%C.W;
    p.head.y=((p.head.y+Math.sin(p.angle)*C.SPD)%C.H+C.H)%C.H;
    p.segments.unshift({x:p.head.x,y:p.head.y});
    if(p.segments.length>C.MAX_LENGTH) p.segments.pop();
  }
  for(const p of r.players.values()){
    for(let k=r.food.length-1;k>=0;k--){
      const dx=p.head.x-r.food[k].x, dy=p.head.y-r.food[k].y;
      if(dx*dx+dy*dy<100) r.food.splice(k,1);
    }
  }
  const a=[...r.players.values()];
  for(let i=0;i<a.length;i++){
    const hx=a[i].head.x, hy=a[i].head.y;
    for(let j=i+1;j<a.length;j++){
      const s=a[j].segments;
      // فحص كل 3 أجزاء — الأجزاء متداخلة أصلاً (المسافة بينها < نصف قطر التصادم)
      for(let k=0;k<s.length;k+=3){
        const dx=hx-s[k].x, dy=hy-s[k].y;
        if(dx*dx+dy*dy<121) break;
      }
    }
  }
};

for(const [fn,label] of [[tickNow,'الحالية'],[tickOpt,'المحسّنة']]){
  const room=mk(8,200); fn(room);
  const N=3000,t0=process.hrtime.bigint();
  for(let i=0;i<N;i++) fn(room);
  const us=Number(process.hrtime.bigint()-t0)/1000/N;
  const players=Math.floor(1000000/(us*30))*8;
  console.log(`${label.padEnd(10)} ${us.toFixed(0)}µs/tick · نواة تشيل ${players.toLocaleString()} لاعب · 1M محتاج ${Math.ceil(1000000/players)} نواة`);
}
