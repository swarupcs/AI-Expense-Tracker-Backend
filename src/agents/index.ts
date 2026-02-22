import { ChatOpenAI } from '@langchain/openai';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { initTools } from '../tools/index';
import { env } from '../config/env';
import type { StreamMessage } from '../types/index';

// ─── LLM ─────────────────────────────────────────────────────────────────────

const llm = new ChatOpenAI({
  model: env.OPENAI_MODEL,
  apiKey: env.OPENAI_API_KEY,
  temperature: 0.2,
});

// Shared MemorySaver — thread history is keyed by thread_id inside each stream call.
// For production at scale, replace with a Redis-backed or DB-backed checkpointer.
const checkpointer = new MemorySaver();

// ─── Agent Factory ────────────────────────────────────────────────────────────

/**
 * Builds and compiles a LangGraph StateGraph for a specific user.
 * Tools are instantiated with userId so they always query the right user's data.
 */
export function createAgent(userId: number) {
  const tools = initTools(userId);
  const toolNode = new ToolNode(tools);

  // ── Nodes ────────────────────────────────────────────────────────────────

  async function callModel(
    state: typeof MessagesAnnotation.State,
    _config: LangGraphRunnableConfig,
  ) {
    const llmWithTools = llm.bindTools(tools);

    const response = await llmWithTools.invoke([
      {
        role: 'system',
        content: [
          'You are a helpful personal finance assistant for an expense tracking app.',
          `Current datetime: ${new Date().toISOString()}.`,
          '',
          'BEHAVIOUR:',
          '- Use INR (₹) currency unless the user specifies otherwise.',
          '- Call add_expense when the user mentions spending or buying something.',
          '- Call get_expenses to answer questions about past spending.',
          '- Call generate_expense_chart ONLY when the user explicitly asks for a chart or graph.',
          '- Call delete_expense when the user asks to remove a specific expense by ID.',
          '- If you need more info before adding an expense, ask for the missing details.',
          '- Be concise, friendly, and format numbers in the Indian number system (e.g. ₹1,50,000).',
        ].join('\n'),
      },
      ...state.messages,
    ]);

    return { messages: [response] };
  }

  // ── Edge logic ────────────────────────────────────────────────────────────

  function shouldContinue(
    state: typeof MessagesAnnotation.State,
    config: LangGraphRunnableConfig,
  ): string {
    const lastMessage = state.messages.at(-1) as AIMessage;

    if (lastMessage.tool_calls?.length) {
      const firstCall = lastMessage.tool_calls[0];
      // Emit a custom SSE event so the frontend can show a "Calling tool…" indicator
      const announcement: StreamMessage = {
        type: 'toolCall:start',
        payload: {
          name: firstCall.name,
          args: firstCall.args as Record<string, unknown>,
        },
      };
      config.writer!(announcement);
      return 'tools';
    }

    return '__end__';
  }

  function shouldCallModel(state: typeof MessagesAnnotation.State): string {
    const lastMessage = state.messages.at(-1) as ToolMessage;

    try {
      const parsed = JSON.parse(lastMessage.content as string) as Record<
        string,
        unknown
      >;
      // Chart data is rendered client-side — don't send it back to the LLM
      if (parsed['type'] === 'chart') return '__end__';
    } catch {
      // Not JSON → normal tool result, continue to model for a human-readable reply
    }

    return 'callModel';
  }

  // ── Graph ─────────────────────────────────────────────────────────────────

  const graph = new StateGraph(MessagesAnnotation)
    .addNode('callModel', callModel)
    .addNode('tools', toolNode)
    .addEdge('__start__', 'callModel')
    .addConditionalEdges('callModel', shouldContinue, {
      tools: 'tools',
      __end__: '__end__',
    })
    .addConditionalEdges('tools', shouldCallModel, {
      callModel: 'callModel',
      __end__: '__end__',
    });

  return graph.compile({ checkpointer });
}

// ─── Agent Cache ──────────────────────────────────────────────────────────────

/**
 * Cache compiled agents by userId.
 * The MemorySaver stores per-thread history; the agent instance itself is stateless.
 */
const agentCache = new Map<number, ReturnType<typeof createAgent>>();

export function getAgent(userId: number): ReturnType<typeof createAgent> {
  if (!agentCache.has(userId)) {
    agentCache.set(userId, createAgent(userId));
  }
  return agentCache.get(userId)!;
}
