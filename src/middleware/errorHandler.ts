import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// ─── AppError ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Operational errors we threw intentionally
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.code && { code: err.code }),
    });
    return;
  }

  // Prisma unique-constraint violation (P2002)
  if (isPrismaUniqueError(err)) {
    res.status(409).json({ success: false, error: 'Resource already exists' });
    return;
  }

  // Prisma record-not-found (P2025)
  if (isPrismaNotFoundError(err)) {
    res.status(404).json({ success: false, error: 'Record not found' });
    return;
  }

  // Unknown — hide internals in production
  console.error('[ErrorHandler]', err);
  res.status(500).json({
    success: false,
    error:
      env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPrismaUniqueError(err: Error): boolean {
  return 'code' in err && (err as { code: string }).code === 'P2002';
}

function isPrismaNotFoundError(err: Error): boolean {
  return 'code' in err && (err as { code: string }).code === 'P2025';
}
