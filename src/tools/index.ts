import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../config/db';
import type { Category } from '../generated/prisma';

const categoryEnum = z.enum([
  'DINING',
  'SHOPPING',
  'TRANSPORT',
  'ENTERTAINMENT',
  'UTILITIES',
  'HEALTH',
  'EDUCATION',
  'OTHER',
]);

/**
 * Initialises all LangGraph tools scoped to a specific user.
 * Called once per user — results are cached in the agent factory.
 */
export function initTools(userId: number) {
  // ─── add_expense ─────────────────────────────────────────────────────────

  const addExpense = tool(
    async ({ title, amount, category, date, notes }) => {
      const expense = await prisma.expense.create({
        data: {
          title,
          amount,
          category: (category as Category) ?? 'OTHER',
          date: date ?? new Date().toISOString().split('T')[0],
          notes,
          userId,
        },
      });
      return JSON.stringify({
        status: 'success',
        message: `Added "${title}" (₹${amount.toLocaleString('en-IN')}) to your expenses.`,
        id: expense.id,
      });
    },
    {
      name: 'add_expense',
      description:
        'Add a new expense. Call this when the user mentions spending or buying something.',
      schema: z.object({
        title: z.string().describe('Short description of the expense'),
        amount: z.number().positive().describe('Amount spent in INR'),
        category: categoryEnum
          .optional()
          .describe('Expense category — pick the most fitting one'),
        date: z
          .string()
          .optional()
          .describe('Date in YYYY-MM-DD. Defaults to today if not provided.'),
        notes: z.string().optional().describe('Any extra notes'),
      }),
    },
  );

  // ─── get_expenses ─────────────────────────────────────────────────────────

  const getExpenses = tool(
    async ({ from, to, category }) => {
      const rows = await prisma.expense.findMany({
        where: {
          userId,
          date: { gte: from, lte: to },
          ...(category && { category: category as Category }),
        },
        orderBy: { date: 'desc' },
      });

      if (rows.length === 0) {
        return JSON.stringify({
          message: 'No expenses found for this period.',
          data: [],
        });
      }

      const total = rows.reduce((sum, r) => sum + r.amount, 0);

      return JSON.stringify({
        data: rows,
        summary: {
          count: rows.length,
          total: Math.round(total * 100) / 100,
        },
      });
    },
    {
      name: 'get_expenses',
      description:
        'Retrieve expenses for a date range. Use this to answer questions about past spending.',
      schema: z.object({
        from: z.string().describe('Start date in YYYY-MM-DD format'),
        to: z.string().describe('End date in YYYY-MM-DD format'),
        category: categoryEnum.optional().describe('Optional category filter'),
      }),
    },
  );

  // ─── generate_expense_chart ───────────────────────────────────────────────

  const generateChart = tool(
    async ({ from, to, groupBy }) => {
      const rows = await prisma.expense.findMany({
        where: { userId, date: { gte: from, lte: to } },
        select: { date: true, amount: true, category: true },
        orderBy: { date: 'asc' },
      });

      const grouped: Record<string, number> = {};

      for (const row of rows) {
        let key: string;
        const d = new Date(row.date);

        if (groupBy === 'month') {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (groupBy === 'week') {
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          const week = Math.ceil(
            ((d.getTime() - startOfYear.getTime()) / 86400000 +
              startOfYear.getDay() +
              1) /
              7,
          );
          key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
        } else if (groupBy === 'category') {
          key = row.category;
        } else {
          key = row.date;
        }

        grouped[key] = (grouped[key] ?? 0) + row.amount;
      }

      const data = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, total]) => ({
          [groupBy]: period,
          amount: Math.round(total * 100) / 100,
        }));

      return JSON.stringify({ type: 'chart', data, labelKey: groupBy });
    },
    {
      name: 'generate_expense_chart',
      description:
        'Generate chart data grouped by date, week, month, or category. ' +
        'Call ONLY when the user explicitly asks for a chart or graph.',
      schema: z.object({
        from: z.string().describe('Start date in YYYY-MM-DD format'),
        to: z.string().describe('End date in YYYY-MM-DD format'),
        groupBy: z
          .enum(['date', 'week', 'month', 'category'])
          .describe('How to group the data'),
      }),
    },
  );

  // ─── delete_expense ───────────────────────────────────────────────────────

  const deleteExpense = tool(
    async ({ id }) => {
      const expense = await prisma.expense.findFirst({ where: { id, userId } });
      if (!expense) {
        return JSON.stringify({
          status: 'error',
          message: `Expense #${id} not found.`,
        });
      }
      await prisma.expense.delete({ where: { id } });
      return JSON.stringify({
        status: 'success',
        message: `Deleted "${expense.title}" (₹${expense.amount.toLocaleString('en-IN')}).`,
      });
    },
    {
      name: 'delete_expense',
      description: 'Delete a specific expense by its numeric ID.',
      schema: z.object({
        id: z.number().int().positive().describe('The expense ID to delete'),
      }),
    },
  );

  return [addExpense, getExpenses, generateChart, deleteExpense];
}
