import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { createGoalSchema, updateGoalSchema } from '../lib/schemas';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../controllers/goal.controller';

export const goalRouter: Router = Router();

goalRouter.use(authenticate);

goalRouter.get('/', getGoals);
goalRouter.post('/', validate(createGoalSchema), createGoal);
goalRouter.patch('/:id', validate(updateGoalSchema), updateGoal);
goalRouter.delete('/:id', deleteGoal);
