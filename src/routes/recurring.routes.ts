import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createRecurringSchema, updateRecurringSchema } from '../lib/schemas';
import {
  getRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
} from '../controllers/recurring.controller';

export const recurringRouter: Router = Router();

recurringRouter.use(authenticate);

recurringRouter.get('/', getRecurringExpenses);
recurringRouter.post('/', validate(createRecurringSchema), createRecurringExpense);
recurringRouter.patch('/:id', validate(updateRecurringSchema), updateRecurringExpense);
recurringRouter.delete('/:id', deleteRecurringExpense);
