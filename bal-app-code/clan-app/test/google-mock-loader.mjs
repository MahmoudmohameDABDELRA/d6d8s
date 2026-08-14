// يستبدل خدمة جوجل و عميل Prisma بمزيّف أثناء الاختبار
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('services/google.service.js')) {
    return nextResolve(new URL('./google-mock.mjs', import.meta.url).href, context);
  }
  if (specifier.endsWith('config/prisma.js')) {
    return nextResolve(new URL('./mock-prisma.js', import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
