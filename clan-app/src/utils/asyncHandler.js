/**
 * يلتقط أخطاء الدوال async ويمرّرها إلى معالج الأخطاء المركزي،
 * بدلاً من تكرار try/catch في كل كنترولر وإرجاع error.message للعميل.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
