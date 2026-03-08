import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getBilling,
  subscribe,
  verifyPayment,
  cancelSubscription,
  billingWebhook,
} from '../controllers/billing.controller';

export const billingRouter: Router = Router();

// Webhook — no auth, raw body already captured via express.json verify option
billingRouter.post('/webhook', billingWebhook);

// Authenticated routes
billingRouter.use(authenticate);
billingRouter.get('/', getBilling);
billingRouter.post('/subscribe', subscribe);
billingRouter.post('/verify', verifyPayment);
billingRouter.post('/cancel', cancelSubscription);
