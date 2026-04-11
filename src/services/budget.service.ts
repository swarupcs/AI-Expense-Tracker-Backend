import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import type { Category } from '../generated/prisma';
import type { UpsertBudgetInput } from '../lib/schemas';

export interface BudgetOverviewItem {
  id: number;
  category: Category;
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
}

export async function getBudgetsService(userId: number) {
  return prisma.budget.findMany({
    where: { userId },
    orderBy: { category: 'asc' },
    select: { id: true, category: true, amount: true, updatedAt: true },
  });
}

export async function upsertBudgetService(
  userId: number,
  input: UpsertBudgetInput,
) {
  const { category, amount } = input;
  return prisma.budget.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category, amount },
    update: { amount },
    select: { id: true, category: true, amount: true, updatedAt: true },
  });
}

export async function deleteBudgetService(userId: number, budgetId: number) {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, userId },
  });
  if (!budget) throw new AppError(404, 'Budget not found');
  await prisma.budget.delete({ where: { id: budgetId } });
}

export async function getBudgetOverviewService(
  userId: number,
  month?: string,
): Promise<BudgetOverviewItem[]> {
  const now = new Date();
  const targetMonth =
    month ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [yearStr, monStr] = targetMonth.split('-');
  const year = parseInt(yearStr!, 10);
  const mon = parseInt(monStr!, 10); // 1-based

  const from = `${targetMonth}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;

  const [budgets, expenses] = await Promise.all([
    prisma.budget.findMany({
      where: { userId },
      select: { id: true, category: true, amount: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: from, lte: to } },
      // FIX: also select `amount` so we can fall back for legacy rows
      select: { category: true, convertedAmount: true, amount: true },
    }),
  ]);

  const spentByCategory: Partial<Record<Category, number>> = {};
  for (const exp of expenses) {
    // FIX: fall back to raw `amount` when convertedAmount is 0 (legacy rows
    // inserted before the convertedAmount fix was applied)
    const effectiveAmount =
      exp.convertedAmount > 0 ? exp.convertedAmount : exp.amount;
    spentByCategory[exp.category] =
      (spentByCategory[exp.category] ?? 0) + effectiveAmount;
  }

  return budgets.map((b) => {
    const spent = Math.round((spentByCategory[b.category] ?? 0) * 100) / 100;
    const remaining = Math.round((b.amount - spent) * 100) / 100;
    const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    return {
      id: b.id,
      category: b.category,
      limit: b.amount,
      spent,
      remaining,
      percentage,
      isOverBudget: spent > b.amount,
    };
  });
}