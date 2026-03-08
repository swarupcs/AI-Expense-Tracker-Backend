import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import type { UpdateUserSettingsInput, UpdateProfileInput } from '../lib/schemas';
import {
  getUserSettingsService,
  updateUserSettingsService,
  updateProfileService,
  deleteAccountService,
} from '../services/user.service';

// ─── PATCH /api/user/profile ──────────────────────────────────────────────────

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const user = await updateProfileService(userId, req.body as UpdateProfileInput);
    res.json({ success: true, data: user, message: 'Profile updated.' });
  } catch (err) { next(err); }
}

// ─── DELETE /api/user ─────────────────────────────────────────────────────────

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    await deleteAccountService(userId);
    res.json({ success: true, message: 'Account deleted.' });
  } catch (err) { next(err); }
}

// ─── GET /api/user/settings ───────────────────────────────────────────────────

export async function getUserSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const settings = await getUserSettingsService(userId);
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/user/settings ─────────────────────────────────────────────────

export async function updateUserSettings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const settings = await updateUserSettingsService(userId, req.body as UpdateUserSettingsInput);
    res.json({ success: true, data: settings, message: 'Settings saved.' });
  } catch (err) {
    next(err);
  }
}
