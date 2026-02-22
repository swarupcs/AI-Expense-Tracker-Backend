import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../config/db';

export async function authenticate(
  req: Request, 
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res
        .status(401)
        .json({ success: false, error: 'User not found or deactivated' });
      return;
    }

    (req as AuthenticatedRequest).user = payload; // ← Cast here
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireAdmin(
  req: Request, 
  res: Response,
  next: NextFunction,
): void {
  if ((req as AuthenticatedRequest).user.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}
