/**
 * بديل config/redis.js في الاختبارات.
 *
 * ️ مش بيغيّر سلوك الإنتاج: الكود الحقيقي بيتعامل مع Redis الواقع
 *    بـ fail-open (بيتحقق من isOpen وبيلف كل حاجة في try/catch).
 *    الستَب ده بيحاكي «Redis مقفول» على طول عشان الاختبار ما يقعدش
 *    مستني مهلة الاتصال.
 */
export const redisClient = {
  isOpen: false,
  async connect() {},
  async quit() {},
  async get() { return null; },
  async set() {},
  async publish() {},
  async subscribe() {},
  duplicate() { return this; },
  on() { return this; },
};

export const connectRedis = async () => {};
export const disconnectRedis = async () => {};
export default redisClient;
