const store = new Map();
const subs = new Map();
export const redisClient = {
  isOpen: true,
  async connect(){}, async quit(){}, async ping(){return 'PONG';},
  async get(k){return store.get(k) ?? null;},
  async set(k,v){store.set(k,v);}, async del(k){store.delete(k);},
  async publish(ch,msg){ (subs.get(ch)??[]).forEach(f=>f(msg)); return 1; },
  async subscribe(ch,f){ if(!subs.has(ch)) subs.set(ch,[]); subs.get(ch).push(f); },
  async incr(){return 1;}, async expire(){}, async ttl(){return -1;},
  async keys(){return [];}, async sMembers(){return [];}, async sAdd(){},
  async hGetAll(){return {};},
  duplicate(){return this;}, on(){return this;}, off(){return this;},
};
export const connectRedis = async () => {};
export const disconnectRedis = async () => {};
export default redisClient;
