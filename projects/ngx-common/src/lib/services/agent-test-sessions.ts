import { Injectable, signal } from '@angular/core';
import type { TurnResponse } from '../models/turn-execution';
import type { ChatMessage } from '../ui/chat/chat-message';
import type { LlmConfig } from './admin-config.service';
import type { TurnLogDetail } from './turn-logs.service';

export type TestVersionChoice = 'draft' | 'live';

/** One agent's test session: its setup, the conversation, and each run's execution (by message id). */
export interface AgentTestSession {
  llm: LlmConfig;
  choices: Record<string, TestVersionChoice>;
  messages: ChatMessage[];
  executions: Record<string, TurnResponse | null>;
  lastRunId: string | null;
  /** Provider response id of the last run — sent as `prev_response_id` to continue the conversation. */
  lastResponseId: string | null;
  nextId: number;
}

function emptySession(): AgentTestSession {
  return { llm: { llm: null, model: null, preset: null }, choices: {}, messages: [], executions: {}, lastRunId: null, lastResponseId: null, nextId: 1 };
}

/**
 * Test sessions per agent, kept for the life of the app (test runs aren't saved on the server), so
 * opening a run on the execution page and coming back keeps the conversation and setup.
 */
@Injectable({ providedIn: 'root' })
export class AgentTestSessions {
  private readonly sessions = signal<Record<string, AgentTestSession>>({});

  get(agentId: string): AgentTestSession {
    return this.sessions()[agentId] ?? emptySession();
  }

  update(agentId: string, fn: (session: AgentTestSession) => AgentTestSession): void {
    this.sessions.update(all => ({ ...all, [agentId]: fn(all[agentId] ?? emptySession()) }));
  }

  /** The last run, shaped like a logged turn so the execution page can show it; null if none. */
  lastRunDetail(agentId: string): TurnLogDetail | null {
    const session = this.get(agentId);
    const runId = session.lastRunId;
    const execution = runId ? session.executions[runId] : null;
    if (!runId || !execution) return null;
    const index = session.messages.findIndex(m => m.id === runId);
    return {
      turn_id: runId,
      email: '',
      conversation_id: '',
      sequence: index + 1,
      title: 'Test run',
      agent_id: agentId,
      llm: session.llm.llm ?? '',
      model: session.llm.model ?? '',
      created_at: new Date().toISOString(),
      input_tokens_cost: 0,
      cached_read_tokens_cost: 0,
      cached_write_tokens_cost: 0,
      output_tokens_cost: 0,
      total_tokens_cost: 0,
      execution_time_ms: null,
      has_execution: true,
      execution,
    };
  }
}
