import 'dotenv/config';
import './config/env'; // ← Must be first — validates all env vars before anything else

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDB, disconnectDB } from './config/db';
import { apiRouter } from './routes/index';
import { apiLimiter } from './middleware/rateLimiter';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { env } from './config/env';

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Pure API — no HTML served
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

// Trust proxy — required for correct IP-based rate limiting behind Nginx / Railway / Render
app.set('trust proxy', 1);

// ─── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── HTTP logging ─────────────────────────────────────────────────────────────

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate limiting ────────────────────────────────────────────────────────────

app.use('/api', apiLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api', apiRouter);

// ─── 404 + Error handling ─────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🚀  Server    → http://localhost:${env.PORT}`);
    console.log(`🔐  Auth      → http://localhost:${env.PORT}/api/auth`);
    console.log(`📊  Expenses  → http://localhost:${env.PORT}/api/expenses`);
    console.log(`💬  Chat      → http://localhost:${env.PORT}/api/chat`);
    console.log(`🩺  Health    → http://localhost:${env.PORT}/health`);
    console.log(`🌱  Env       → ${env.NODE_ENV}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n🛑  ${signal} — shutting down gracefully...`);

    server.close(async () => {
      await disconnectDB();
      console.log('👋  Server closed.');
      process.exit(0);
    });

    // Force exit after 10 s if connections are stuck
    setTimeout(() => {
      console.error('⚠️   Forcing shutdown after 10 s timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('💥  Uncaught exception:', err);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('💥  Unhandled rejection:', reason);
  });
}

start().catch((err: Error) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
