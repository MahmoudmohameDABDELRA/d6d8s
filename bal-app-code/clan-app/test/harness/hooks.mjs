const HERE = new URL('.', import.meta.url).pathname;
export async function resolve(spec, ctx, next) {
  if (spec === '@prisma/client')          return next(HERE + 'prisma-client.stub.mjs', ctx);
  if (spec.endsWith('config/prisma.js'))  return next(HERE + 'prisma.stub.mjs', ctx);
  if (spec.endsWith('config/redis.js'))   return next(HERE + 'redis.stub.mjs', ctx);
  if (spec.endsWith('queues/index.js'))   return next(HERE + 'queues.stub.mjs', ctx);

  /**
   * ️ بديل Gemini — بيتفعّل بـ `STUB_GEMINI=1` بس.
   *
   *  من غيره، مسار الحلم (أهم مسار في المنتج: حلم → أسئلة →
   *  خطة → جبل) مايتفحصش خالص: أول نداء بيرجّع 503 لغياب
   *  المفتاح والسلسلة بتقف.
   *
   *  ️ مش مفعّل افتراضياً عن قصد: فيه فحوص بتتأكد إن السيرفر
   *    بيقول «الرفيق مش متاح» بصراحة لما المفتاح ناقص — ودي
   *    حالة حقيقية لازم تفضل متغطية.
   */
  if (process.env.STUB_GEMINI === '1' && spec.endsWith('gemini.service.js')) {
    return next(HERE + 'gemini.stub.mjs', ctx);
  }
  return next(spec, ctx);
}
