import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtPayload, TokenPair } from '../types/index';
import type { Role } from '../generated/prisma'; 

export function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as JwtPayload; // ← double cast
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as JwtPayload; // ← double cast
}

export function generateTokenPair(
  userId: number,
  email: string,
  role: Role,
): TokenPair {
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, role };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 1000);
}

export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));
}
