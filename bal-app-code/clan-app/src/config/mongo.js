import mongoose from 'mongoose';

import env from './env.js';
import { scoped } from './logger.js';

const log = scoped('mongo');

export const connectMongo = async () => {
  mongoose.connection.on('error', (error) => {
    log.error(' MongoDB runtime error:', error.message);
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('️  MongoDB disconnected');
  });

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  });

  log.info(' MongoDB connected successfully');
};

export const disconnectMongo = async () => {
  await mongoose.connection.close();
  log.info(' MongoDB connection closed');
};
