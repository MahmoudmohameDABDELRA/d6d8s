const HERE = new URL('.', import.meta.url).pathname;
export async function resolve(spec, ctx, next) {
  if (spec === '@prisma/client')          return next(HERE + 'prisma-client.stub.mjs', ctx);
  if (spec.endsWith('config/prisma.js'))  return next(HERE + 'prisma.stub.mjs', ctx);
  if (spec.endsWith('config/redis.js'))   return next(HERE + 'redis.stub.mjs', ctx);
  if (spec.endsWith('queues/index.js'))   return next(HERE + 'queues.stub.mjs', ctx);
  return next(spec, ctx);
}
