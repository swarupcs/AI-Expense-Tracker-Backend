import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import type { CreateRecurringInput, UpdateRecurringInput } from '../lib/schemas';
import {
  getRecurringExpensesService,
  createRecurringService,
  updateRecurringService,
  deleteRecurringService,
} from '../services/recurring.service';

export async function getRecurringExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await getRecurringExpensesService(userId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createRecurringExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await createRecurringService(userId, req.body as CreateRecurringInput);
    res.status(201).json({ success: true, data, message: 'Recurring expense created.' });
  } catch (err) { next(err); }
}

export async function updateRecurringExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: 'Invalid ID' }); return; }
    const data = await updateRecurringService(userId, id, req.body as UpdateRecurringInput);
    res.json({ success: true, data, message: 'Recurring expense updated.' });
  } catch (err) { next(err); }
}

export async function deleteRecurringExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: 'Invalid ID' }); return; }
    await deleteRecurringService(userId, id);
    res.json({ success: true, message: 'Recurring expense deleted.' });
  } catch (err) { next(err); }
}
