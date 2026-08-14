import { createClient } from 'redis';

import env from './env.js';
import { scoped } from './logger.js';

const log = scoped('redis');

export const redisClient = createClient({
  url: env.redisUrl,
  socket: {
    connectTimeout: 2000,
    reconnectStrategy: (retries) => (retries > 3 ? false : Math.min(retries * 100, 1000)),
  },
});

redisClient.on('error', (error) => {
  // ملاحظة: هذا الـ handler يُستدعى أيضاً أثناء إعادة المحاولة،
  // لذلك لا نُنهي العملية هنا — فقط نسجّل الخطأ.
  log.error(' Redis error:', error.message);
});

redisClient.on('reconnecting', () => {
  log.warn('️  Redis reconnecting...');
});

export const connectRedis = async () => {
  await redisClient.connect();
  await redisClient.ping();
  log.info(' Redis connected successfully');
};

export const disconnectRedis = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
    log.info(' Redis connection closed');
  }
};

export default redisClient;
