import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseFiltersSchema,
  bulkDeleteSchema,
} from '../lib/schemas';
import {
  listExpenses,
  getStats,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  bulkDeleteExpenses,
} from '../controllers/expense.controller';

export const expenseRouter: Router = Router();

// All expense routes require a valid Bearer JWT
expenseRouter.use(authenticate);

// Collection routes
expenseRouter.get('/', validate(expenseFiltersSchema, 'query'), listExpenses);
expenseRouter.get('/stats', getStats);
expenseRouter.post('/', validate(createExpenseSchema), createExpense);
expenseRouter.delete('/', validate(bulkDeleteSchema), bulkDeleteExpenses);

// Single-resource routes — note: /stats must be declared before /:id
expenseRouter.get('/:id', getExpenseById);
expenseRouter.patch('/:id', validate(updateExpenseSchema), updateExpense);
expenseRouter.delete('/:id', deleteExpense);
