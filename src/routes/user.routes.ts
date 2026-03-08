import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { updateUserSettingsSchema, updateProfileSchema } from '../lib/schemas';
import {
  getUserSettings,
  updateUserSettings,
  updateProfile,
  deleteAccount,
} from '../controllers/user.controller';

export const userRouter: Router = Router();

// All user routes require authentication
userRouter.use(authenticate);

userRouter.patch('/profile', validate(updateProfileSchema), updateProfile);
userRouter.delete('/', deleteAccount);
userRouter.get('/settings', getUserSettings);
userRouter.patch('/settings', validate(updateUserSettingsSchema), updateUserSettings);
