import crypto from 'crypto';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { razorpay } from '../lib/razorpay';

// ─── Plan limits ──────────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  FREE: { expenses: 100, aiMessages: 15 },
  PRO: { expenses: null, aiMessages: null }, // null = unlimited
} as const;

export const PRO_PRICE_INR = 299;

// ─── Get user billing ─────────────────────────────────────────────────────────

export async function getUserBillingService(userId: number) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [subscription, expenseCount, aiMessageCount] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.expense.count({ where: { userId, createdAt: { gte: monthStart } } }),
    prisma.chatMessage.count({
      where: { userId, role: 'user', createdAt: { gte: monthStart } },
    }),
  ]);

  const plan = subscription?.plan ?? 'FREE';
  const limits = PLAN_LIMITS[plan];

  return {
    plan,
    status: subscription?.status ?? 'ACTIVE',
    razorpaySubId: subscription?.razorpaySubId ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    usage: {
      expenses: expenseCount,
      aiMessages: aiMessageCount,
      limits,
    },
    keyId: env.RAZORPAY_KEY_ID ?? null,
    billingEnabled: !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_PLAN_ID),
  };
}

// ─── Create subscription ──────────────────────────────────────────────────────

export async function createSubscriptionService(userId: number) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_PLAN_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError(503, 'Billing is not configured');
  }

  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing?.plan === 'PRO' && existing.status === 'ACTIVE' && !existing.cancelAtPeriodEnd) {
    throw new AppError(400, 'Already on PRO plan');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = await (razorpay.subscriptions.create as any)({
    plan_id: env.RAZORPAY_PLAN_ID,
    customer_notify: 1,
    quantity: 1,
    total_count: 12,
    notes: { userId: String(userId) },
  });

  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: 'FREE', status: 'PENDING', razorpaySubId: sub.id },
    update: { status: 'PENDING', razorpaySubId: sub.id, cancelAtPeriodEnd: false },
  });

  return { subscriptionId: sub.id as string, keyId: env.RAZORPAY_KEY_ID };
}

// ─── Verify payment ───────────────────────────────────────────────────────────

export async function verifyPaymentService(
  userId: number,
  data: {
    razorpayPaymentId: string;
    razorpaySubscriptionId: string;
    razorpaySignature: string;
  },
) {
  if (!env.RAZORPAY_KEY_SECRET) throw new AppError(503, 'Billing is not configured');

  const { razorpayPaymentId, razorpaySubscriptionId, razorpaySignature } = data;
  const body = `${razorpayPaymentId}|${razorpaySubscriptionId}`;
  const expectedSig = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSig !== razorpaySignature) {
    throw new AppError(400, 'Invalid payment signature');
  }

  // Fetch subscription to get billing period end
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rzpSub = await (razorpay.subscriptions.fetch as any)(razorpaySubscriptionId) as any;
  const currentPeriodEnd = rzpSub.current_end
    ? new Date((rzpSub.current_end as number) * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      plan: 'PRO',
      status: 'ACTIVE',
      razorpaySubId: razorpaySubscriptionId,
      currentPeriodEnd,
    },
    update: {
      plan: 'PRO',
      status: 'ACTIVE',
      razorpaySubId: razorpaySubscriptionId,
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  return { plan: 'PRO' as const };
}

// ─── Cancel subscription ──────────────────────────────────────────────────────

export async function cancelSubscriptionService(userId: number) {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  if (!subscription?.razorpaySubId || subscription.plan !== 'PRO') {
    throw new AppError(404, 'No active PRO subscription');
  }
  if (subscription.cancelAtPeriodEnd) {
    throw new AppError(400, 'Subscription already scheduled for cancellation');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (razorpay.subscriptions.cancel as any)(subscription.razorpaySubId, { cancel_at_cycle_end: 1 });

  await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true },
  });

  return { cancelAtPeriodEnd: true };
}

// ─── Handle webhook ───────────────────────────────────────────────────────────

export async function handleWebhookService(rawBody: Buffer, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new AppError(503, 'Webhook secret not configured');
  }

  const expectedSig = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (expectedSig !== signature) {
    throw new AppError(400, 'Invalid webhook signature');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = JSON.parse(rawBody.toString()) as any;
  const { event: eventName, payload } = event;
  const rzpSub = payload?.subscription?.entity;

  if (!rzpSub?.id) return;

  const userId = Number(rzpSub.notes?.userId);
  if (!userId || isNaN(userId)) return;

  if (eventName === 'subscription.activated' || eventName === 'subscription.charged') {
    const currentPeriodEnd = rzpSub.current_end
      ? new Date((rzpSub.current_end as number) * 1000)
      : null;
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan: 'PRO',
        status: 'ACTIVE',
        razorpaySubId: rzpSub.id as string,
        currentPeriodEnd,
      },
      update: {
        plan: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
    });
  } else if (eventName === 'subscription.cancelled') {
    await prisma.subscription.updateMany({
      where: { razorpaySubId: rzpSub.id as string },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
    });
  } else if (eventName === 'subscription.expired' || eventName === 'subscription.halted') {
    await prisma.subscription.updateMany({
      where: { razorpaySubId: rzpSub.id as string },
      data: { plan: 'FREE', status: 'EXPIRED', currentPeriodEnd: null },
    });
  }
}

// ─── Plan limit check (used in expense + chat services) ──────────────────────

export async function checkPlanLimit(
  userId: number,
  resource: 'expenses' | 'aiMessages',
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const plan = subscription?.plan ?? 'FREE';
  if (plan === 'PRO') return;

  const limit = PLAN_LIMITS.FREE[resource];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let count: number;
  if (resource === 'expenses') {
    count = await prisma.expense.count({ where: { userId, createdAt: { gte: monthStart } } });
  } else {
    count = await prisma.chatMessage.count({
      where: { userId, role: 'user', createdAt: { gte: monthStart } },
    });
  }

  if (count >= limit) {
    const label = resource === 'expenses' ? 'expense' : 'AI message';
    throw new AppError(
      403,
      `Monthly ${label} limit reached (${limit}). Upgrade to PRO for unlimited access.`,
    );
  }
}
