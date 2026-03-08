import { prisma as db } from '../config/db';
import type { CreateRecurringInput, UpdateRecurringInput } from '../lib/schemas';
import { Frequency } from '../generated/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split('T')[0]!;
}

function advanceDate(dateStr: string, frequency: Frequency): string {
  const d = new Date(dateStr);
  switch (frequency) {
    case Frequency.DAILY:
      d.setDate(d.getDate() + 1);
      break;
    case Frequency.WEEKLY:
      d.setDate(d.getDate() + 7);
      break;
    case Frequency.MONTHLY:
      d.setMonth(d.getMonth() + 1);
      break;
    case Frequency.YEARLY:
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().split('T')[0]!;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getRecurringExpensesService(userId: number) {
  return db.recurringExpense.findMany({
    where: { userId },
    orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
  });
}

export async function createRecurringService(userId: number, data: CreateRecurringInput) {
  const today = todayString();
  // nextDueDate = startDate if startDate >= today, else today
  const nextDueDate = data.startDate >= today ? data.startDate : today;

  return db.recurringExpense.create({
    data: {
      userId,
      title: data.title,
      amount: data.amount,
      category: data.category ?? 'OTHER',
      frequency: data.frequency,
      startDate: data.startDate,
      nextDueDate,
      notes: data.notes,
    },
  });
}

export async function updateRecurringService(userId: number, id: number, data: UpdateRecurringInput) {
  const existing = await db.recurringExpense.findFirst({ where: { id, userId } });
  if (!existing) throw Object.assign(new Error('Recurring expense not found'), { status: 404 });

  return db.recurringExpense.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}

export async function deleteRecurringService(userId: number, id: number) {
  const existing = await db.recurringExpense.findFirst({ where: { id, userId } });
  if (!existing) throw Object.assign(new Error('Recurring expense not found'), { status: 404 });
  await db.recurringExpense.delete({ where: { id } });
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Finds all active recurring expenses whose nextDueDate <= today,
 * creates an expense entry for each, and advances nextDueDate.
 * Safe to call multiple times — will not double-create for the same day
 * because nextDueDate is advanced on each run.
 */
export async function processRecurringExpenses(): Promise<void> {
  const today = todayString();

  const due = await db.recurringExpense.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: today },
    },
  });

  if (due.length === 0) return;

  for (const rec of due) {
    // Walk forward from current nextDueDate until we've covered all missed occurrences
    let cursor = rec.nextDueDate;

    while (cursor <= today) {
      await db.expense.create({
        data: {
          userId: rec.userId,
          title: rec.title,
          amount: rec.amount,
          category: rec.category,
          date: cursor,
          notes: rec.notes ?? undefined,
        },
      });
      cursor = advanceDate(cursor, rec.frequency);
    }

    // Update nextDueDate to next future occurrence
    await db.recurringExpense.update({
      where: { id: rec.id },
      data: { nextDueDate: cursor },
    });
  }

  console.log(`[recurring] Processed ${due.length} recurring expense(s) — ${today}`);
}
