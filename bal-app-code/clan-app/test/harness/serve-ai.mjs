/**
 * السيرفر ببديل Gemini — لفحص مسار الحلم كامل.
 *
 * ️ منفصل عن `serve.mjs` عن قصد: الفحص العادي لازم يشوف
 *    السلوك الحقيقي لما المفتاح ناقص (503 صريح).
 *
 * ️ المتغيّر لازم يتظبط **قبل** ما `setup.mjs` يسجّل الـhooks،
 *    مش هنا. `--import` بيشتغل قبل الملف ده، فلو حطيناه هنا
 *    الـhook بيكون اتسجّل والشرط اتقرا وهو فاضي.
 *
 *    شغّله بـ: npm run harness:ai
 */
if (process.env.STUB_GEMINI !== '1') {
  console.error('⚠️ STUB_GEMINI مش متظبط — استخدم npm run harness:ai');
}
await import('./serve.mjs');
