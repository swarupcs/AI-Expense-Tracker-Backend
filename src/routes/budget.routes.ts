import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { upsertBudgetSchema, budgetOverviewSchema } from '../lib/schemas';
import {
  getBudgets,
  getBudgetOverview,
  upsertBudget,
  deleteBudget,
} from '../controllers/budget.controller';

export const budgetRouter: Router = Router();

budgetRouter.use(authenticate);

// IMPORTANT: /overview must come before /:id to avoid route collision
budgetRouter.get('/overview', validate(budgetOverviewSchema, 'query'), getBudgetOverview);
budgetRouter.get('/', getBudgets);
budgetRouter.put('/', validate(upsertBudgetSchema), upsertBudget);
budgetRouter.delete('/:id', deleteBudget);
