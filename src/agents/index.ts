import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import {
  MemorySaver,
  MessagesAnnotation,
  StateGraph,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { initTools } from '../tools/index';
import { getLlm } from './llm.factory';
import type { ToolCapableLlm } from './llm.factory';
import type { StreamMessage } from '../types/index';

// ─── Shared checkpointer ──────────────────────────────────────────────────────
// For production at scale, replace with a Redis-backed or DB-backed checkpointer.
const checkpointer = new MemorySaver();

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You are a personal finance assistant embedded in an expense tracking app.',
  `Current datetime: ${new Date().toISOString()}.`,
  '',
  '════════════════════════════════════════',
  'STRICT SCOPE — READ THIS FIRST:',
  '════════════════════════════════════════',
  'You ONLY help with personal finance and expense tracking topics. This includes:',
  '  • Adding, viewing, editing, or deleting expenses',
  '  • Spending summaries, budgets, and financial insights',
  "  • Charts and reports about the user's expenses",
  '  • General personal finance advice (saving, budgeting, etc.)',
  '',
  'If the user asks about ANYTHING outside this scope — including but not limited to:',
  '  coding, general knowledge, science, history, entertainment, recipes, travel,',
  '  writing essays, creative content, technical support, or any other topic —',
  'you MUST respond with EXACTLY this message and nothing else:',
  '  "I\'m your expense tracking assistant, so I can only help with personal finance',
  '   and expense-related topics. Try asking me to add an expense, show your',
  '   spending summary, or give you a budget breakdown! 💰"',
  '',
  'Do NOT attempt to answer off-topic questions. Do NOT apologise at length.',
  'Do NOT say you "cannot" help — just redirect as shown above.',
  '════════════════════════════════════════',
  '',
  'BEHAVIOUR (for in-scope requests):',
  '- Use INR (₹) currency unless the user specifies otherwise.',
  '- Call add_expense when the user mentions spending or buying something.',
  '- Call get_expenses to answer questions about past spending.',
  '- Call generate_expense_chart ONLY when the user explicitly asks for a chart or graph.',
  '- Call delete_expense when the user asks to remove a specific expense by ID.',
  '- If you need more info before adding an expense, ask for the missing details.',
  '- Be concise, friendly, and format numbers in the Indian number system (e.g. ₹1,50,000).',
].join('\n');

// ─── Off-topic reply ──────────────────────────────────────────────────────────

const OFF_TOPIC_REPLY =
  "I'm your expense tracking assistant, so I can only help with personal finance " +
  'and expense-related topics. Try asking me to add an expense, show your spending ' +
  'summary, or give you a budget breakdown! 💰';

// ─── Topic Guard ──────────────────────────────────────────────────────────────

/**
 * Lightweight keyword-based pre-flight check that short-circuits the LLM call
 * for messages that are obviously off-topic.
 * Saves tokens + latency before even hitting the model.
 *
 * Returns true  → message is RELEVANT (let it through to the LLM).
 * Returns false → message is OFF-TOPIC (reject immediately).
 */
function isRelevantMessage(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const ALLOW_PATTERNS: RegExp[] = [
    /^h(i|ello|ey)\b/,
    /^good\s+(morning|afternoon|evening)/,
    /\bwhat can you (do|help)/,
    /\bhow (do|can) (i|you)/,
    /\bexpense/,
    /\bspend/,
    /\bspent/,
    /\bbought/,
    /\bpurchase/,
    /\bbill/,
    /\binvoice/,
    /\breceipt/,
    /\bbudget/,
    /\bsav(e|ing|ings)/,
    /\bfinance/,
    /\bmoney/,
    /\bcash/,
    /\bpay(ment|ing|ed)?\b/,
    /\bcost/,
    /\bprice/,
    /\bamount/,
    /\btotal/,
    /\bsummar(y|ise|ize)/,
    /\bchart/,
    /\bgraph/,
    /\breport/,
    /\binsight/,
    /\bcategor(y|ies)/,
    /\bdelete\s+(expense|record)/,
    /\bremove\s+(expense|record)/,
    /\binr\b/,
    /₹/,
    /\brupee/,
    /\bdining/,
    /\bshopping/,
    /\btransport/,
    /\butilities/,
    /\bhealth\s+expense/,
    /\beducation\s+expense/,
    /\btracking/,
    /\btransaction/,
  ];

  if (ALLOW_PATTERNS.some((re) => re.test(lower))) return true;

  const BLOCK_PATTERNS: RegExp[] = [
    /\bwrite (a |an )?(poem|story|essay|code|function|script|email(?! expense)|letter|song|blog)/,
    /\b(recipe|how (to )?cook|bake|ingredient|meal (plan|prep))\b/,
    /\b(weather|forecast|temperature|climate)\b/,
    /\b(debug|fix (my )?code|coding|programming|javascript|python|typescript|react|nodejs|sql(?! expense)|algorithm|data structure)\b/,
    /\b(capital of|president of|who (invented|discovered|wrote)|history of|tell me about|explain (quantum|relativity|photosynthesis))\b/,
    /\b(movie|film|series|tv show|song|music|lyrics|actor|actress|celebrity|anime)\b/,
    /\b(translate (this|to|into)|in (french|spanish|german|japanese|arabic|chinese|korean))\b/,
    /\b(joke|riddle|fun fact|trivia|play (a\s+)?(game|quiz))\b/,
    /\b(sport|cricket|football|basketball|tennis|ipl|fifa)\b(?!.*expense)(?!.*spend)/,
    /\b(how (does )?bitcoin work|what is ethereum|nft|blockchain)\b(?!.*expense)/,
    /\b(diagnose|symptom|medicine|dosage|workout routine|exercise plan)\b(?!.*expense)/,
    /\b(best (place|destination) to (visit|travel)|tourist spot|visa requirements)\b(?!.*expense)/,
  ];

  if (BLOCK_PATTERNS.some((re) => re.test(lower))) return false;

  return true; // Default: allow — system prompt is the final guard
}

// ─── Agent Factory ────────────────────────────────────────────────────────────

/**
 * Builds and compiles a LangGraph StateGraph for a specific user.
 * Tools are instantiated with userId so they always query the right user's data.
 * The LLM instance is resolved once via the factory (singleton across agents).
 */
export function createAgent(userId: number) {
  const tools = initTools(userId);
  const toolNode = new ToolNode(tools);
  const llm: ToolCapableLlm = getLlm(); // ← provider-agnostic singleton

  // ── Nodes ─────────────────────────────────────────────────────────────────

  async function callModel(
    state: typeof MessagesAnnotation.State,
    _config: LangGraphRunnableConfig,
  ) {
    // Pre-flight topic guard — short-circuit before hitting the provider
    const lastUserMessage = [...state.messages]
      .reverse()
      .find((m) => m.getType() === 'human');

    if (lastUserMessage) {
      const text =
        typeof lastUserMessage.content === 'string'
          ? lastUserMessage.content
          : JSON.stringify(lastUserMessage.content);

      if (!isRelevantMessage(text)) {
        return { messages: [new AIMessage({ content: OFF_TOPIC_REPLY })] };
      }
    }

    const llmWithTools = llm.bindTools(tools);

    const response = await llmWithTools.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
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
      // Chart data is rendered client-side — don't pass it back to the LLM
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

/** Flush the cache — useful in tests or after a provider change. */
export function clearAgentCache(): void {
  agentCache.clear();
}
