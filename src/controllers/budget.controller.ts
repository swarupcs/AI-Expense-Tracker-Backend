import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import type { UpsertBudgetInput, BudgetOverviewInput } from '../lib/schemas';
import {
  getBudgetsService,
  upsertBudgetService,
  deleteBudgetService,
  getBudgetOverviewService,
} from '../services/budget.service';

// ─── GET /api/budgets ─────────────────────────────────────────────────────────

export async function getBudgets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const budgets = await getBudgetsService(userId);
    res.json({ success: true, data: budgets });
  } catch (err) { next(err); }
}

// ─── GET /api/budgets/overview ────────────────────────────────────────────────

export async function getBudgetOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const overview = await getBudgetOverviewService(userId, month);
    res.json({ success: true, data: overview });
  } catch (err) { next(err); }
}

// ─── PUT /api/budgets ─────────────────────────────────────────────────────────

export async function upsertBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const budget = await upsertBudgetService(userId, req.body as UpsertBudgetInput);
    res.json({ success: true, data: budget, message: 'Budget saved.' });
  } catch (err) { next(err); }
}

// ─── DELETE /api/budgets/:id ──────────────────────────────────────────────────

export async function deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: 'Invalid budget ID' }); return; }
    await deleteBudgetService(userId, id);
    res.json({ success: true, message: 'Budget deleted.' });
  } catch (err) { next(err); }
}
