import { prisma } from '../config/db';
import { hashPassword, comparePassword } from '../lib/hash';
import {
  generateTokenPair,
  verifyRefreshToken,
  getRefreshTokenExpiry,
} from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';
import type {
  SignUpInput,
  SignInInput,
  ChangePasswordInput,
} from '../lib/schemas';
import type { PublicUser, TokenPair } from '../types/index';

// Dummy hash for constant-time comparison — prevents timing attacks that
// reveal whether an email address exists in the system.
const DUMMY_HASH =
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeANHBfElmfNyD1ra';

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

export async function signUpService(input: SignUpInput): Promise<AuthResult> {
  const { name, email, password } = input;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(409, 'Email already registered');
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const tokens = generateTokenPair(user.id, user.email, user.role);

  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: getRefreshTokenExpiry(),
    },
  });

  return { user, tokens };
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

export async function signInService(input: SignInInput): Promise<AuthResult> {
  const { email, password } = input;

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Always run bcrypt compare to prevent timing attacks
  const isValid = await comparePassword(
    password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (!user || !isValid) {
    throw new AppError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError(403, 'Account deactivated. Please contact support.');
  }

  const tokens = generateTokenPair(user.id, user.email, user.role);

  await Promise.all([
    prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
        expiresAt: getRefreshTokenExpiry(),
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  const { passwordHash: _omit, ...publicUser } = user;
  return { user: publicUser, tokens };
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export async function refreshTokenService(
  refreshToken: string,
): Promise<TokenPair> {
  let _payload: ReturnType<typeof verifyRefreshToken>;
  try {
    _payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Invalid refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      user: { select: { id: true, email: true, role: true, isActive: true } },
    },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Refresh token expired or revoked');
  }

  if (!stored.user.isActive) {
    throw new AppError(403, 'Account deactivated');
  }

  // Rotate — revoke old token, issue new pair
  const tokens = generateTokenPair(
    stored.user.id,
    stored.user.email,
    stored.user.role,
  );

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: stored.userId,
        expiresAt: getRefreshTokenExpiry(),
      },
    }),
  ]);

  return tokens;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logoutService(refreshToken: string): Promise<void> {
  // Silently revoke — don't leak whether the token exists
  await prisma.refreshToken
    .update({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}

// ─── Get Current User ─────────────────────────────────────────────────────────

export async function getMeService(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { expenses: true } },
    },
  });

  if (!user) throw new AppError(404, 'User not found');
  return user;
}

// ─── Change Password ──────────────────────────────────────────────────────────

export async function changePasswordService(
  userId: number,
  input: ChangePasswordInput,
): Promise<void> {
  const { currentPassword, newPassword } = input;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) throw new AppError(404, 'User not found');

  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) throw new AppError(401, 'Current password is incorrect');

  const newHash = await hashPassword(newPassword);

  // Update password AND revoke all refresh tokens — forces re-login on all devices
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
