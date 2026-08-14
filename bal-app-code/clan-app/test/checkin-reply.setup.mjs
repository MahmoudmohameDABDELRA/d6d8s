/**
 * يسجّل الـ resolver hooks قبل تحميل الاختبار.
 * الاستخدام: node --import ./test/checkin-reply.setup.mjs test/checkin-reply.test.mjs
 */
import { register } from 'node:module';

register('./checkin-reply.hooks.mjs', import.meta.url);
