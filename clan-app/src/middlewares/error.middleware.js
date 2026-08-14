import { Prisma } from '@prisma/client';

import env from '../config/env.js';
import AppError from '../utils/AppError.js';
import logger from '../config/logger.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `المسار غير موجود: ${req.method} ${req.originalUrl}`,
  });
};

// eslint-disable-next-line no-unused-vars -- Express يتعرّف على معالج الأخطاء بوجود 4 معاملات
export const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'حدث خطأ في الخادم';
  let code = error.code;

  // أخطاء Prisma المعروفة -> رسائل مفهومة بدل 500 صامت
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const fields = error.meta?.target;
        const label = Array.isArray(fields) ? fields.join(', ') : 'الحقل';
        statusCode = 409;
        message = `القيمة مستخدمة بالفعل (${label})`;
        code = 'DUPLICATE';
        break;
      }
      case 'P2025':
        statusCode = 404;
        message = 'السجل غير موجود';
        code = 'NOT_FOUND';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'مرجع غير صالح لسجل مرتبط';
        code = 'FK_VIOLATION';
        break;
      default:
        statusCode = 400;
        message = 'خطأ في قاعدة البيانات';
        code = error.code;
    }
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'بيانات الطلب غير صالحة';
    code = 'VALIDATION';
  } else if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'صيغة JSON غير صالحة';
    code = 'BAD_JSON';
  } else if (error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'حجم الطلب كبير جداً';
    code = 'PAYLOAD_TOO_LARGE';
  }

  // لا نسرّب تفاصيل الأخطاء البرمجية للعميل في الإنتاج
  const isSafeToExpose = error instanceof AppError || statusCode < 500;

  if (!isSafeToExpose) {
    /**
     * ️ كان `console.error(error)` — سطر بلا معرّف طلب ولا
     *    مستخدم ولا مسار. عشرة أخطاء في نفس الثانية تصير عشرة
     *    أسطر لا يمكن ربط أيّها بأي طلب.
     *
     *    `req.log` يحمل requestId و userId تلقائياً من
     *    pino-http، فيصير الخطأ جزءاً من قصّة الطلب لا حدثاً
     *    معزولاً. نسقط إلى المسجّل العام لو استُدعي المعالج
     *    خارج دورة طلب.
     */
    (req.log ?? logger).error(
      { err: error, method: req.method, url: req.originalUrl, statusCode },
      'خطأ غير معالَج',
    );
    if (env.isProduction) message = 'حدث خطأ في الخادم';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    /**
     * ️ معرّف الطلب في الرد: المستخدم يشتكي فيعطيك المعرّف،
     *    فتصل لسطوره مباشرةً بدل البحث بالوقت التقريبي.
     */
    ...(req.id ? { requestId: req.id } : {}),
    ...(env.isProduction ? {} : { stack: error.stack }),
  });
};
