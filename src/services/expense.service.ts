import type { Prisma, Category } from '../generated/prisma';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFiltersInput,
  BulkDeleteInput,
} from '../lib/schemas';
import type { ExpenseStats, PaginationMeta } from '../types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpenseListResult {
  expenses: Awaited<ReturnType<typeof prisma.expense.findMany>>;
  pagination: PaginationMeta;
}

// ─── List Expenses ────────────────────────────────────────────────────────────

export async function listExpensesService(
  userId: number,
  filters: ExpenseFiltersInput,
): Promise<ExpenseListResult> {
  const { from, to, category, search } = filters;

  // Coerce to numbers with safe defaults
  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 20;
  const skip = (page - 1) * limit;

  const where: Prisma.ExpenseWhereInput = { userId };

  if (from && to) where.date = { gte: from, lte: to };
  else if (from) where.date = { gte: from };
  else if (to) where.date = { lte: to };
  if (category) where.category = category;
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ]);

  return {
    expenses,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Get Stats ────────────────────────────────────────────────────────────────

export async function getStatsService(
  userId: number,
  from?: string,
  to?: string,
): Promise<ExpenseStats> {
  const where: Prisma.ExpenseWhereInput = { userId };

  if (from && to) where.date = { gte: from, lte: to };
  else if (from) where.date = { gte: from };
  else if (to) where.date = { lte: to };

  const [aggregate, byCategory] = await Promise.all([
    prisma.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
      _max: { amount: true },
      _min: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
    }),
  ]);

  return {
    total: aggregate._sum.amount ?? 0,
    count: aggregate._count,
    average: aggregate._avg.amount ?? 0,
    max: aggregate._max.amount ?? 0,
    min: aggregate._min.amount ?? 0,
    byCategory: byCategory.map((c) => ({
      category: c.category,
      amount: c._sum.amount ?? 0,
      count: c._count,
    })),
  };
}

// ─── Get Single ───────────────────────────────────────────────────────────────

export async function getExpenseByIdService(userId: number, id: number) {
  const expense = await prisma.expense.findFirst({ where: { id, userId } });
  if (!expense) throw new AppError(404, 'Expense not found');
  return expense;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createExpenseService(
  userId: number,
  input: CreateExpenseInput,
) {
  const { title, amount, category, date, notes } = input;

  return prisma.expense.create({
    data: {
      title,
      amount,
      category: (category as Category) ?? 'OTHER',
      date: date ?? new Date().toISOString().split('T')[0],
      notes,
      userId,
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateExpenseService(
  userId: number,
  id: number,
  input: UpdateExpenseInput,
) {
  const existing = await prisma.expense.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(404, 'Expense not found');

  const { title, amount, category, date, notes } = input;

  return prisma.expense.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(amount !== undefined && { amount }),
      ...(category !== undefined && { category: category as Category }),
      ...(date !== undefined && { date }),
      ...(notes !== undefined && { notes }),
    },
  });
}

// ─── Delete One ───────────────────────────────────────────────────────────────

export async function deleteExpenseService(
  userId: number,
  id: number,
): Promise<void> {
  const existing = await prisma.expense.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(404, 'Expense not found');
  await prisma.expense.delete({ where: { id } });
}

// ─── Bulk Delete ──────────────────────────────────────────────────────────────

export async function bulkDeleteExpensesService(
  userId: number,
  input: BulkDeleteInput,
): Promise<number> {
  const { count } = await prisma.expense.deleteMany({
    where: { id: { in: input.ids }, userId },
  });
  return count;
}
