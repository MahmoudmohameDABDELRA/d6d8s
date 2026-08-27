/**
 * يثبت إن الرسالة بتوصل **لحظياً** عبر Socket.io.
 * بيستخدم شات العشيرة (مفيش طلب صداقة في الطريق).
 */
import { io } from 'socket.io-client';
const B='http://127.0.0.1:3999', API=B+'/api';
const c=async(m,p,o={})=>{const r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(o.token?{Authorization:'Bearer '+o.token}:{})},...(o.body?{body:JSON.stringify(o.body)}:{})});return{s:r.status,b:await r.json().catch(()=>null)};};
const u=()=>Math.random().toString(36).slice(2,8);

const mk=async()=>{
  const e=`sk_${u()}@bal.app`;
  const r=await c('POST','/auth/register',{body:{username:'س_'+u(),email:e,password:'Passw0rd!23',domain:'TECH'}});
  await c('POST','/auth/onboarding',{token:r.b.accessToken,body:{domain:'TECH',interests:['TECH']}});
  return {t:r.b.accessToken,id:r.b.user.id};
};

const A = await mk();
const clan = await c('POST','/clans/private/create',{token:A.t,body:{name:'عشيرة_'+u()}});
const clanId = clan.b?.clan?.id;
const open = await c('GET',`/chat/clans/${clanId}/open`,{token:A.t});
const cid = (open.b?.conversationId ?? open.b?.conversation?.id)?.toString();
console.log('شات العشيرة:', cid ?? 'مفيش', '| HTTP', open.s);

if (!cid) { console.log('❌ مقدرناش نفتح شات'); process.exit(0); }

const sock = io(B+'/chat',{auth:{token:A.t},transports:['websocket'],reconnection:false});
const got = await new Promise((res)=>{
  const to=setTimeout(()=>res(null),8000);
  sock.on('connect',()=>{
    sock.emit('join_conversation',{conversationId:cid});
    setTimeout(()=>{
      c('POST',`/chat/${cid}/messages`,{token:A.t,body:{text:'رسالة لحظية'}}).catch(()=>{});
    },700);
  });
  sock.on('new_message',(m)=>{clearTimeout(to);res(m);});
  sock.on('connect_error',(e)=>{clearTimeout(to);res({err:e.message});});
});
sock.disconnect();

if (got?.err)   console.log('❌ فشل الاتصال:', got.err);
else if (got)   console.log('✅ الرسالة وصلت لحظياً عبر السوكيت:', JSON.stringify(got).slice(0,80));
else            console.log('❌ الرسالة مـاوصلتش خلال 8 ثواني');
process.exit(0);
