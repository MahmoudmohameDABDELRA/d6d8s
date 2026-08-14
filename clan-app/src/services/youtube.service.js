/**
 * ════════════════════════════════════════════════════════════
 *  خدمة يوتيوب
 * ════════════════════════════════════════════════════════════
 *
 * لماذا يوتيوب؟
 *   مجاني تماماً · CDN عالمي · جودة تتكيّف مع سرعة النت
 *   بلا تكلفة استضافة ولا حدود نطاق ترددي.
 *
 * نخزّن **المعرّف** لا الرابط الكامل — أنظف وأسهل في التوليد.
 */

/**
 * يستخرج معرّف الفيديو من أي صيغة رابط يوتيوب.
 *
 * يدعم:
 *   https://youtube.com/shorts/k7xL_jy4J8Q?si=...
 *   https://www.youtube.com/watch?v=k7xL_jy4J8Q
 *   https://youtu.be/k7xL_jy4J8Q
 *   k7xL_jy4J8Q  (المعرّف مباشرة)
 *
 * @returns {string|null}
 */
export const extractVideoId = (input) => {
  if (!input) return null;

  const raw = String(input).trim();

  // معرّف مباشر: 11 حرفاً من الأبجدية والأرقام و - و _
  if (/^[\w-]{11}$/.test(raw)) return raw;

  const patterns = [
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/watch\?.*[?&]?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/v\/([\w-]{11})/,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m) return m[1];
  }

  return null;
};

/** روابط التشغيل والصورة المصغّرة */
export const buildUrls = (videoId) => ({
  /** للتضمين داخل التطبيق — بلا فيديوهات مقترحة ولا شعار */
  embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`,
  watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  shortsUrl: `https://www.youtube.com/shorts/${videoId}`,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  thumbnailHd: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
});

/**
 * بيانات الفيديو من oEmbed — بلا مفتاح API.
 * يعطي العنوان واسم القناة والصورة. لا يعطي المدة.
 */
export const fetchMetadata = async (videoId) => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!res.ok) return null;

    const data = await res.json();
    return {
      title: data.title,
      author: data.author_name,
      thumbnail: data.thumbnail_url,
    };
  } catch {
    // فشل الشبكة لا يمنع إضافة الفيديو — المشرف يكتب العنوان يدوياً
    return null;
  }
};

export default { extractVideoId, buildUrls, fetchMetadata };
