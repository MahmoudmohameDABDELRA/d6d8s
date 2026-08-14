/**
 * Module hooks: بيحوّلوا prisma و gemini للنسخ الوهمية أثناء الاختبار.
 *
 * ️ ليه hooks بدل حقن بالـ import؟ عشان الكنترولر يفضل نظيف —
 *    ما نضيفش فيه أي كود موجود عشان الاختبار.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('config/prisma.js')) {
    return nextResolve(
      new URL('./stubs/prisma.stub.mjs', import.meta.url).href,
      context,
    );
  }
  if (specifier.endsWith('services/gemini.service.js')) {
    return nextResolve(
      new URL('./stubs/gemini.stub.mjs', import.meta.url).href,
      context,
    );
  }
  return nextResolve(specifier, context);
}
