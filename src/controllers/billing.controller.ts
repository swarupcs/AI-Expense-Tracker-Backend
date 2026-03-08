import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index';
import {
  getUserBillingService,
  createSubscriptionService,
  verifyPaymentService,
  cancelSubscriptionService,
  handleWebhookService,
} from '../services/billing.service';

// ─── GET /api/billing ─────────────────────────────────────────────────────────

export async function getBilling(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await getUserBillingService(userId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── POST /api/billing/subscribe ──────────────────────────────────────────────

export async function subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await createSubscriptionService(userId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── POST /api/billing/verify ─────────────────────────────────────────────────

export async function verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await verifyPaymentService(userId, req.body as {
      razorpayPaymentId: string;
      razorpaySubscriptionId: string;
      razorpaySignature: string;
    });
    res.json({ success: true, data, message: 'Subscription activated.' });
  } catch (err) { next(err); }
}

// ─── POST /api/billing/cancel ─────────────────────────────────────────────────

export async function cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = (req as AuthenticatedRequest).user;
    const data = await cancelSubscriptionService(userId);
    res.json({ success: true, data, message: 'Subscription will cancel at period end.' });
  } catch (err) { next(err); }
}

// ─── POST /api/billing/webhook ────────────────────────────────────────────────

export async function billingWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'No raw body' });
      return;
    }
    await handleWebhookService(rawBody, signature);
    res.json({ received: true });
  } catch (err) { next(err); }
}
