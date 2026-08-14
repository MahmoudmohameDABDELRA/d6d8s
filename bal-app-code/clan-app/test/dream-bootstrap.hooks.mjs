export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('config/prisma.js')) {
    return nextResolve(new URL('./stubs/dream-prisma.stub.mjs', import.meta.url).href, context);
  }
  if (specifier.endsWith('config/redis.js')) {
    return nextResolve(new URL('./stubs/redis.stub.mjs', import.meta.url).href, context);
  }
  if (specifier.endsWith('queues/index.js')) {
    return nextResolve(new URL('./stubs/queues.stub.mjs', import.meta.url).href, context);
  }
  if (specifier.endsWith('gemini.service.js')) {
    return nextResolve(new URL('./stubs/dream-gemini.stub.mjs', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
