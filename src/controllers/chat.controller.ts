import type { Request, Response, NextFunction } from 'express';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { AuthenticatedRequest, StreamMessage } from '../types/index';
import type { ChatQueryInput } from '../lib/schemas';
import { getAgent } from '../agents/index';
import { env } from '../config/env';
import {
  scopeThreadId,
  persistUserMessage,
  getChatHistoryService,
  deleteChatHistoryService,
} from '../services/chat.service';

// ─── POST /api/chat ───────────────────────────────────────────────────────────

export async function streamChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req as AuthenticatedRequest).user.sub;
  const { query, threadId } = req.body as ChatQueryInput;
  const scopedThreadId = scopeThreadId(userId, threadId);

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable Nginx response buffering
    'Access-Control-Allow-Origin': env.FRONTEND_URL,
  });

  const writeEvent = (eventName: string, data: StreamMessage): void => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let isConnected = true;
  req.on('close', () => {
    isConnected = false;
  });

  try {
    const agent = getAgent(userId);

    const responseStream = await agent.stream(
      { messages: [{ role: 'user', content: query }] },
      {
        streamMode: ['messages', 'custom'],
        configurable: { thread_id: scopedThreadId },
      },
    );

    for await (const [eventType, chunk] of responseStream) {
      if (!isConnected) break;

      let message: StreamMessage | null = null;

      if (eventType === 'custom') {
        // Tool-call announcement emitted by shouldContinue()
        message = chunk as StreamMessage;
      } else if (eventType === 'messages') {
        const msgChunk = Array.isArray(chunk) ? chunk[0] : chunk;
        if (!msgChunk || msgChunk.content === '') continue;

        if (
          msgChunk instanceof AIMessage &&
          typeof msgChunk.content === 'string'
        ) {
          message = { type: 'ai', payload: { text: msgChunk.content } };
        } else if (msgChunk instanceof ToolMessage) {
          let result: Record<string, unknown>;
          try {
            result = JSON.parse(msgChunk.content as string) as Record<
              string,
              unknown
            >;
          } catch {
            result = { raw: msgChunk.content };
          }
          message = {
            type: 'tool',
            payload: { name: msgChunk.name ?? 'unknown', result },
          };
        }
      }

      if (message) writeEvent(eventType, message);
    }

    // Persist user message after successful stream (fire-and-forget)
    persistUserMessage(userId, scopedThreadId, query).catch(console.error);
  } catch (err) {
    console.error('[Chat stream error]', err);
    if (isConnected) {
      writeEvent('error', {
        type: 'error',
        payload: { text: 'An error occurred. Please try again.' },
      });
    }
    next(err);
  } finally {
    res.end();
  }
}

// ─── GET /api/chat/history ────────────────────────────────────────────────────

export async function getChatHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.sub;
    const { threadId, limit = '50' } = req.query as {
      threadId?: string;
      limit?: string;
    };
    const scopedThreadId = scopeThreadId(userId, threadId);
    const messages = await getChatHistoryService(
      userId,
      scopedThreadId,
      parseInt(limit, 10),
    );
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/chat/history ─────────────────────────────────────────────────

export async function deleteChatHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user.sub;
    const { threadId } = req.query as { threadId?: string };
    const scopedThreadId = threadId
      ? scopeThreadId(userId, threadId)
      : undefined;
    const count = await deleteChatHistoryService(userId, scopedThreadId);
    res.json({ success: true, message: `${count} message(s) deleted` });
  } catch (err) {
    next(err);
  }
}
