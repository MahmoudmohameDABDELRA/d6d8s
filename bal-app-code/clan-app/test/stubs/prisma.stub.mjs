/** بديل config/prisma.js أثناء اختبار الرد على الإشعار */
import { prismaMock } from '../checkin-reply.mocks.mjs';

export default prismaMock;
export const prisma = prismaMock;
