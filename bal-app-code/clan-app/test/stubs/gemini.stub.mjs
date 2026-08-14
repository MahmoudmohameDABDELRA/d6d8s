/** بديل services/gemini.service.js أثناء اختبار الرد على الإشعار */
import { generateMock, isConfiguredMock } from '../checkin-reply.mocks.mjs';

export const generate = generateMock;
export const isConfigured = isConfiguredMock;
export default { generate: generateMock, isConfigured: isConfiguredMock };
