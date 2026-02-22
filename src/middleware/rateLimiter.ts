import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

/** General API rate limiter — applied to all /api routes */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  skip: () => env.NODE_ENV === 'test',
});

/** Stricter limiter for auth endpoints (signup / signin) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again in 15 minutes.',
  },
  skip: () => env.NODE_ENV === 'test',
});

/** Tight limiter for AI chat streaming endpoint */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error:
      'Chat rate limit exceeded. Please wait before sending more messages.',
  },
  skip: () => env.NODE_ENV === 'test',
});
