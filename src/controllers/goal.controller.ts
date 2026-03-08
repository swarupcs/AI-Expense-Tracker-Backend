import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import type { CreateGoalInput, UpdateGoalInput } from '../lib/schemas';
import {
  getGoalsService,
  createGoalService,
  updateGoalService,
  deleteGoalService,
} from '../services/goal.service';

// ─── GET /api/goals ───────────────────────────────────────────────────────────

export async function getGoals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const goals = await getGoalsService(userId);
    res.json({ success: true, data: goals });
  } catch (err) { next(err); }
}

// ─── POST /api/goals ──────────────────────────────────────────────────────────

export async function createGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const goal = await createGoalService(userId, req.body as CreateGoalInput);
    res.status(201).json({ success: true, data: goal, message: 'Goal created.' });
  } catch (err) { next(err); }
}

// ─── PATCH /api/goals/:id ─────────────────────────────────────────────────────

export async function updateGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const goalId = Number(req.params.id);
    const goal = await updateGoalService(userId, goalId, req.body as UpdateGoalInput);
    res.json({ success: true, data: goal, message: 'Goal updated.' });
  } catch (err) { next(err); }
}

// ─── DELETE /api/goals/:id ────────────────────────────────────────────────────

export async function deleteGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const goalId = Number(req.params.id);
    await deleteGoalService(userId, goalId);
    res.json({ success: true, message: 'Goal deleted.' });
  } catch (err) { next(err); }
}
