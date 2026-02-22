import { Router } from 'express';
import { authRouter } from './auth.routes';
import { expenseRouter } from './expense.routes';
import { chatRouter } from './chat.routes';

export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/chat', chatRouter);
