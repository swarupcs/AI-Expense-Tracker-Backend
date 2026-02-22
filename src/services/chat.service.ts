import { prisma } from '../config/db';

// ─── Thread ID scoping ────────────────────────────────────────────────────────

/** Prefixes threadId with userId — users can never access each other's threads */
export function scopeThreadId(userId: number, threadId?: string): string {
  return `user-${userId}-${threadId ?? 'default'}`;
}

// ─── Persist a user message ───────────────────────────────────────────────────

export async function persistUserMessage(
  userId: number,
  threadId: string,
  content: string,
): Promise<void> {
  await prisma.chatMessage.create({
    data: { userId, threadId, role: 'user', content },
  });
}

// ─── Get chat history ─────────────────────────────────────────────────────────

export async function getChatHistoryService(
  userId: number,
  threadId: string,
  limit: number,
) {
  return prisma.chatMessage.findMany({
    where: { userId, threadId },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: {
      id: true,
      threadId: true,
      role: true,
      content: true,
      createdAt: true,
    },
  });
}

// ─── Delete chat history ──────────────────────────────────────────────────────

export async function deleteChatHistoryService(
  userId: number,
  threadId?: string,
): Promise<number> {
  const where = threadId ? { userId, threadId } : { userId };
  const { count } = await prisma.chatMessage.deleteMany({ where });
  return count;
}
