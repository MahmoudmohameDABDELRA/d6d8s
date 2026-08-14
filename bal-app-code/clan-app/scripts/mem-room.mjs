// قياس: كام رام بتاخد غرفة لعبة واحدة في الذاكرة؟
const CONFIG={GRID:40, MAX_PLAYERS:8};
const mkRoom=(id)=>({
  roomId:'room-'+id, status:'PLAYING', tickCount:0,
  players:new Map(Array.from({length:CONFIG.MAX_PLAYERS},(_,i)=>[
    'p'+i,{socketId:'s'.repeat(20)+i,userId:'u'.repeat(36),username:'player'+i,
      snake:Array.from({length:12},(_,j)=>({x:j,y:i})),dir:'RIGHT',score:0,alive:true}
  ])),
  food:Array.from({length:5},(_,k)=>({x:k,y:k})),
  loop:null,
});
if(global.gc) global.gc();
const before=process.memoryUsage().heapUsed;
const rooms=[];
for(let i=0;i<1000;i++) rooms.push(mkRoom(i));
if(global.gc) global.gc();
const after=process.memoryUsage().heapUsed;
const perRoom=(after-before)/1000;
console.log(`غرفة واحدة (8 لاعبين): ${(perRoom/1024).toFixed(1)} كيلوبايت`);
console.log(`1000 غرفة = ${((after-before)/1048576).toFixed(1)} ميجا`);
console.log(`\n--- الإسقاط ---`);
for(const users of [10000,100000,1000000]){
  const roomsN=users/8;
  const gb=(roomsN*perRoom)/1073741824;
  console.log(`${users.toLocaleString()} لاعب = ${roomsN.toLocaleString()} غرفة = ${gb.toFixed(2)} جيجا رام (للحالة فقط)`);
}
console.log(`\nعدد الـ setInterval لـ 1M لاعب: ${(1000000/8).toLocaleString()} مؤقّت متزامن`);
