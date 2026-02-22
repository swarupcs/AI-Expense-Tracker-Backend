import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import type {
  SignUpInput,
  SignInInput,
  RefreshTokenInput,
  ChangePasswordInput,
} from '../lib/schemas';
import {
  signUpService,
  signInService,
  refreshTokenService,
  logoutService,
  getMeService,
  changePasswordService,
} from '../services/auth.service';

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

export async function signUp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await signUpService(req.body as SignUpInput);
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/signin ────────────────────────────────────────────────────

export async function signIn(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await signInService(req.body as SignInInput);
    res.json({
      success: true,
      message: 'Signed in successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken: token } = req.body as RefreshTokenInput;
    const tokens = await refreshTokenService(token);
    res.json({ success: true, message: 'Tokens refreshed', data: { tokens } });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken: token } = req.body as RefreshTokenInput;
    await logoutService(token);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const user = await getMeService(userId);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/auth/change-password ─────────────────────────────────────────

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    await changePasswordService(userId, req.body as ChangePasswordInput);
    res.json({
      success: true,
      message: 'Password changed. Please sign in again on all devices.',
    });
  } catch (err) {
    next(err);
  }
}
