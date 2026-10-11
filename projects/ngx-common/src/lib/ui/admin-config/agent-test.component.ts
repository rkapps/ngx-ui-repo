import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDropdownComponent, type TwangDropdownOption } from 'ngx-twang-ui';
import { forkJoin, map, type Subscription } from 'rxjs';
import {
  type AgentConfig,
  type AgentConfigResponse,
  type AgentConfigVersion,
  AdminConfigService,
  EXECUTION_TYPE_LABELS,
  type LlmConfig,
  type Preset,
  type ProviderConfig,
} from '../../services/admin-config.service';
import { type AgentTestSession, AgentTestSessions, type TestVersionChoice } from '../../services/agent-test-sessions';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ChatComponent } from '../chat/chat.component';
import type { ChatMessage } from '../chat/chat-message';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { rememberCurrentAgent } from './config-sections';

type Choice = TestVersionChoice;

const PRESETS: Preset[] = ['fast', 'balanced', 'data', 'precise', 'thorough', 'local'];


/**
 * Admin > Config > Agents > Test: chat with an agent — mostly its draft — without saving anything.
 * The right panel's Setup tab picks the LLM override, the agent (draft or live) and, for pipelines,
 * draft or live for each sub-agent; each run sends those as `POST /admin/agents/test` (drafts as
 * override configs, continuing from the previous response id). Nothing is saved on the server: the final chunk
 * carries the run's execution, kept with the conversation in the in-browser `AgentTestSessions`, and
 * View execution (header) opens the last run on the shared execution page.
 */
@Component({
  selector: 'app-agent-test',
  standalone: true,
  // Fill the admin body's height, so the chat reaches the bottom.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  imports: [
    ChatComponent,
    LucideAngularModule,
    NgTemplateOutlet,
    ThreePanelLayoutComponent,
    TwangButtonComponent,
    TwangDropdownComponent,
  ],
  template: `
    @if (loading()) {
      <div class="flex min-h-[50vh] items-center justify-center gap-2 rounded-lg border border-border bg-white p-8 text-sm text-text-muted">
        <lucide-icon name="loader-circle" [size]="16" class="animate-spin" /> Loading…
      </div>
    } @else if (loadError() || !agent()) {
      <div class="flex min-h-[50vh] items-center justify-center rounded-lg border border-border bg-white p-8 text-sm text-red-600">
        {{ loadError() || 'Agent "' + agentId() + '" doesn\'t exist.' }}
      </div>
    } @else {
      <app-three-panel-layout
        [showLeft]="false"
        rightTitle="Setup"
        [rightWidth]="rightWidth"
        storageKey="admin.config.agent-test.layout"
        [fill]="true"
      >
        <!-- Middle: the chat, filling the page height (the layout's "fill"). -->
        <div middle class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
          <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs">
            <span class="text-sm font-semibold text-primary-600">{{ agent()?.config?.name || agentId() }}</span>
            <span class="rounded px-1.5 py-0.5" [class]="choiceFor(agentId()) === 'draft' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'">
              {{ versionLabel(agentId(), choiceFor(agentId())) }}
            </span>
            @if (draftSubCount()) {
              <span class="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{{ draftSubCount() }} sub-agent draft{{ draftSubCount() === 1 ? '' : 's' }}</span>
            }
            <span class="text-text-muted">· {{ llmSummary() }}</span>
            <twang-button
              class="ml-auto"
              variant="default"
              size="sm"
              icon="trash-2"
              label="Clear"
              [disabled]="generating() || !messages().length"
              (buttonClick)="clear()"
            />
          </div>
          <ngx-chat
            class="min-h-0 flex-1"
            [messages]="messages()"
            [status]="status()"
            [statusBusy]="generating()"
            [errorMessage]="error()"
            [generating]="generating()"
            [clearTrigger]="clearTrigger()"
            (send)="run($event)"
            (stop)="stop()"
          />
        </div>

        <!-- Right: setup — LLM override, agent (draft/live), sub-agents (draft/live) -->
        <div right>
          <div class="flex flex-col gap-5 p-4 text-sm">
            <!-- 1. LLM override -->
            <section class="flex flex-col gap-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">LLM</span>
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-text-muted">Provider</label>
                  <twang-dropdown size="sm" [options]="providerOptions()" [value]="llm().llm ?? ''" (valueChange)="setProvider($event)" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-text-muted">Model</label>
                  <twang-dropdown
                    size="sm"
                    [options]="modelOptions()"
                    [value]="llm().model ?? ''"
                    [disabled]="!llm().llm"
                    (valueChange)="setLlm({ model: $event || null })"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-text-muted">Preset</label>
                  <twang-dropdown size="sm" [options]="presetOptions" [value]="llm().preset ?? ''" (valueChange)="setLlm({ preset: $any($event) || null })" />
                </div>
              </div>
            </section>

            <!-- 2. Agent -->
            <section class="flex flex-col gap-3 border-t border-border pt-4">
              <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Agent</span>
              <twang-dropdown size="sm" [options]="agentOptions()" [value]="agentId()" [disabled]="generating()" (valueChange)="selectAgent($event)" />
              @if (agent(); as a) {
                @if (choicesFor(a.config.id).length > 1) {
                  <div class="flex">
                    <ng-container *ngTemplateOutlet="choicePicker; context: { $implicit: a.config.id }" />
                  </div>
                }
              }
            </section>

            <!-- 3. Sub-agents (pipelines) -->
            @if (subAgentIds().length) {
              <section class="flex flex-col gap-2 border-t border-border pt-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Sub-agents</span>
                @for (id of subAgentIds(); track id) {
                  <div class="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <div class="min-w-0 flex-1">
                      <div class="truncate">{{ agentById(id)?.config?.name || id }}</div>
                      <div class="truncate font-mono text-[11px] text-text-muted">{{ id }}</div>
                    </div>
                    @if (!agentById(id)) {
                      <span class="rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase text-red-700">missing</span>
                    } @else if (choicesFor(id).length > 1) {
                      <ng-container *ngTemplateOutlet="choicePicker; context: { $implicit: id }" />
                    }
                  </div>
                }
              </section>
            }

            @if (setupError()) {
              <p class="text-xs text-red-600">{{ setupError() }}</p>
            }
          </div>
        </div>
      </app-three-panel-layout>
    }

    <!-- Draft | Live switch for one agent (Draft only offered when it has one). -->
    <ng-template #choicePicker let-id>
      <span class="ml-auto inline-flex shrink-0 rounded-lg border border-border p-0.5 text-xs" role="radiogroup" [attr.aria-label]="'Version of ' + id">
        @for (c of choicesFor(id); track c) {
          <button
            type="button"
            role="radio"
            class="rounded-md px-2 py-0.5 transition-colors"
            [class]="choiceFor(id) === c ? (c === 'draft' ? 'bg-amber-50 font-medium text-amber-700' : 'bg-green-50 font-medium text-green-700') : 'text-text-muted hover:text-text'"
            [attr.aria-checked]="choiceFor(id) === c"
            [disabled]="generating()"
            (click)="setChoice(id, c)"
          >{{ versionLabel(id, c) }}</button>
        }
      </span>
    </ng-template>

    <!-- Rendered on the right of the admin header via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      <twang-button
        variant="primary"
        size="sm"
        icon="git-branch"
        label="View execution"
        [title]="hasLastRun() ? 'Open the last run on the execution page' : 'Run a prompt first'"
        [disabled]="!hasLastRun()"
        (buttonClick)="viewExecution()"
      />
    </ng-template>
  `,
})
export class AgentTestComponent {
  private readonly configService = inject(AdminConfigService);
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  private readonly breadcrumbs = inject(PageBreadcrumbs);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly executionLabel = (e: AgentConfig['execution']) => EXECUTION_TYPE_LABELS[e] ?? e;

  /** The agent under test — from the URL; the Agent dropdown navigates. */
  private readonly route = inject(ActivatedRoute);
  protected readonly agentId = toSignal(this.route.paramMap.pipe(map(p => p.get('id') ?? '')), { requireSync: true });
  /** Opened from the editor (`agents/:id/edit/test`) rather than the Agents table (`agents/:id/test`). */
  private readonly fromEdit = !!this.route.snapshot.data['fromEdit'];
  /** This page's own route, per agent — for the execution link and agent switching. */
  private testPath(id: string): string[] {
    return ['/admin', 'config', 'agents', id, ...(this.fromEdit ? ['edit'] : []), 'test'];
  }

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly setupError = signal<string | null>(null);

  private readonly agents = signal<AgentConfigResponse[]>([]);
  private readonly providers = signal<ProviderConfig[]>([]);
  private readonly agentMap = computed(() => new Map(this.agents().map(a => [a.config.id, a])));
  protected readonly agentById = (id: string) => this.agentMap().get(id) ?? null;
  protected readonly agent = computed(() => this.agentById(this.agentId()));

  // ── Draft or live, per agent id ──
  /** Draft versions fetched so far (null = the agent has none). */
  private readonly drafts = signal<Record<string, AgentConfigVersion | null>>({});
  /** Setup, conversation and runs live in the in-browser session for this agent (nothing is saved). */
  private readonly sessions = inject(AgentTestSessions);
  private readonly session = computed(() => this.sessions.get(this.agentId()));
  private readonly choices = computed(() => this.session().choices);

  /** What can be picked for `id`: Draft when it has one, Live when it has been promoted. */
  protected choicesFor(id: string): Choice[] {
    const a = this.agentById(id);
    if (!a) return [];
    const list: Choice[] = [];
    if (a.draft_version != null) list.push('draft');
    if (a.status !== 'draft') list.push('live');
    return list;
  }

  /** Current pick: explicit choice, else the default — draft for the agent under test, live for sub-agents. */
  protected choiceFor(id: string): Choice {
    const available = this.choicesFor(id);
    const picked = this.choices()[id];
    if (picked && available.includes(picked)) return picked;
    const preferred: Choice = id === this.agentId() ? 'draft' : 'live';
    return available.includes(preferred) ? preferred : (available[0] ?? 'live');
  }

  protected versionLabel(id: string, choice: Choice): string {
    const a = this.agentById(id);
    if (choice === 'draft') return a?.draft_version != null ? `Draft v${a.draft_version}` : 'Draft';
    return a?.live_version != null ? `Live v${a.live_version}` : 'Live';
  }

  /** The config that will run for `id` under the current choices (null while its draft loads). */
  private configFor(id: string): AgentConfig | null {
    const a = this.agentById(id);
    if (!a) return null;
    if (this.choiceFor(id) === 'draft') return this.drafts()[id]?.config ?? null;
    return a.config; // live (for live agents `config` is the live one)
  }

  /** Sub-agents of the agent under test (pipelines): stage sub-agents, available agents, follow-up. */
  protected readonly subAgentIds = computed(() => {
    this.drafts();
    this.choices();
    const config = this.configFor(this.agentId());
    const p = config?.execution === 'pipeline' ? config.pipeline : null;
    if (!p) return [];
    const ids = [...p.stages.flatMap(s => s.sub_agents.map(r => r.id)), ...p.available_agents.map(r => r.id)];
    if (p.followup_agent) ids.push(p.followup_agent);
    return [...new Set(ids)];
  });

  protected readonly draftSubCount = computed(() => this.subAgentIds().filter(id => this.choiceFor(id) === 'draft').length);

  protected readonly agentOptions = computed<TwangDropdownOption[]>(() =>
    [...this.agents()]
      .sort((a, b) => (a.config.name || a.config.id).localeCompare(b.config.name || b.config.id))
      .map(a => ({
        value: a.config.id,
        label: `${a.config.name || a.config.id} · ${this.executionLabel(a.config.execution)}${a.draft_version != null ? ' · draft' : ''}`,
      })),
  );

  // ── LLM override ──
  protected readonly llm = computed(() => this.session().llm);
  protected readonly providerOptions = computed<TwangDropdownOption[]>(() => [
    { value: '', label: "Agent's setting" },
    ...this.providers()
      .filter(p => p.enabled)
      .sort((a, b) => a.llm.localeCompare(b.llm))
      .map(p => ({ value: p.id, label: p.llm })),
  ]);
  protected readonly modelOptions = computed<TwangDropdownOption[]>(() => {
    const provider = this.providers().find(p => p.id === this.llm().llm);
    // No provider override → the agent's own model applies; with one, pick from its models
    // (setProvider pre-selects the default, so there's no separate "default" entry).
    if (!provider) return [{ value: '', label: "Agent's setting" }];
    return provider.models
      .filter(m => m.enabled)
      .map(m => ({ value: m.id, label: m.id === provider.default_model ? `${m.id} · default` : m.id }));
  });
  /**
   * Provider and model a run will use (the request needs both): the override if set, else the tested
   * config's own LLM settings, with the provider's default model filling a missing model.
   */
  protected readonly resolvedLlm = computed<{ llm: string; model: string } | null>(() => {
    const override = this.llm();
    const own = this.configFor(this.agentId())?.llm_config;
    const llm = override.llm || own?.llm || null;
    if (!llm) return null;
    const provider = this.providers().find(p => p.id === llm);
    const model = override.model || (override.llm ? null : own?.model) || provider?.default_model || null;
    return model ? { llm, model } : null;
  });
  protected readonly presetOptions: TwangDropdownOption[] = [
    { value: '', label: "Agent's setting" },
    ...PRESETS.map(p => ({ value: p, label: p })),
  ];
  /** Preset a run will use: the override, else the tested config's own (null = server default). */
  protected readonly resolvedPreset = computed<Preset | null>(() => this.llm().preset ?? this.configFor(this.agentId())?.llm_config?.preset ?? null);

  protected readonly llmSummary = computed(() => {
    const r = this.resolvedLlm();
    const preset = this.resolvedPreset();
    return r ? `${r.llm} / ${r.model}${preset ? ' / ' + preset : ''}` : 'no LLM set';
  });

  // ── Conversation ──
  protected readonly messages = computed(() => this.session().messages);
  protected readonly generating = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly clearTrigger = signal(0);
  private run$: Subscription | null = null;

  /** Whether the most recent run returned an execution to open. */
  protected readonly hasLastRun = computed(() => {
    const s = this.session();
    return !!s.lastRunId && !!s.executions[s.lastRunId];
  });
  /** View execution, shown on the right of the admin header. */
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  constructor() {
    forkJoin({ agents: this.configService.getAgents(), providers: this.configService.getProviders() })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ({ agents, providers }) => {
          this.agents.set(agents);
          this.providers.set(providers);
          this.loading.set(false);
        },
        error: err => {
          console.error('Failed to load agents', err);
          this.loadError.set("Couldn't load agents.");
          this.loading.set(false);
        },
      });

    // Fetch the drafts the current setup needs (the agent and any sub-agent switched to draft).
    effect(() => {
      if (this.loading()) return;
      const needed = [this.agentId(), ...this.subAgentIds()].filter(id => this.choiceFor(id) === 'draft' && !(id in this.drafts()));
      for (const id of needed) this.loadDraft(id);
    });

    effect(() => {
      const name = { label: this.agent()?.config.name || this.agentId() };
      const edit = { label: 'Edit', path: ['/admin', 'config', 'agents', this.agentId(), 'edit'] };
      this.breadcrumbs.set(this.fromEdit ? [name, edit, { label: 'Test' }] : [name, { label: 'Test' }]);
    });
    effect(() => this.breadcrumbs.actions.set(this.headerActions() ?? null));
    effect(() => rememberCurrentAgent(this.agentId()));
    this.destroyRef.onDestroy(() => {
      this.run$?.unsubscribe();
      this.breadcrumbs.clear();
    });
  }

  private loadDraft(id: string): void {
    this.drafts.update(d => ({ ...d, [id]: null })); // mark as requested
    this.configService
      .getAgentVersions(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: versions => this.drafts.update(d => ({ ...d, [id]: versions.find(v => v.status === 'Draft') ?? null })),
        error: err => {
          console.error(`Failed to load draft for ${id}`, err);
          this.setupError.set(`Couldn't load the draft for ${id}.`);
        },
      });
  }

  private updateSession(fn: (s: AgentTestSession) => AgentTestSession): void {
    this.sessions.update(this.agentId(), fn);
  }

  protected selectAgent(id: string): void {
    if (!id || id === this.agentId()) return;
    this.stop(); // each agent keeps its own session
    this.router.navigate(this.testPath(id), { replaceUrl: true });
  }

  protected setChoice(id: string, choice: Choice): void {
    this.updateSession(s => ({ ...s, choices: { ...s.choices, [id]: choice } }));
  }

  protected setLlm(changes: Partial<LlmConfig>): void {
    this.updateSession(s => ({ ...s, llm: { ...s.llm, ...changes } }));
  }

  /** Changing provider drops a model it doesn't offer. */
  protected setProvider(value: string): void {
    const llm = value || null;
    const model = this.llm().model;
    const provider = this.providers().find(p => p.id === llm);
    const keep = !!model && !!provider?.models.some(m => m.id === model);
    // Keep a model the new provider offers; otherwise start from its default.
    this.setLlm({ llm, model: keep ? model : (provider?.default_model ?? null) });
  }

  protected run(prompt: string): void {
    if (this.generating()) return;
    this.setupError.set(null);

    // Every agent in the run travels in `configsm` — the chosen draft or the live config — so the
    // backend never has to find one in storage (a new, never-promoted agent isn't there).
    const configs: Record<string, AgentConfig> = {};
    for (const id of [this.agentId(), ...this.subAgentIds()]) {
      const config = this.configFor(id);
      if (!config) {
        this.setupError.set(
          this.agentById(id) ? `The draft for ${id} hasn't loaded yet — try again in a moment.` : `Sub-agent ${id} doesn't exist.`,
        );
        return;
      }
      configs[id] = config;
    }
    const resolved = this.resolvedLlm();
    if (!resolved) {
      this.setupError.set('Pick an LLM provider (and model) — this agent has none set.');
      return;
    }

    const agentId = this.agentId();
    const id = `run-${this.session().nextId}`;
    this.updateSession(s => ({
      ...s,
      nextId: s.nextId + 1,
      messages: [...s.messages, { id, userContent: prompt, assistantContent: '', streaming: true }],
    }));
    this.generating.set(true);
    this.error.set(null);
    this.status.set('');
    this.clearTrigger.update(n => n + 1);

    // A previous stream may still be closing after its final chunk — drop it so its completion
    // can't end this run.
    this.run$?.unsubscribe();
    const patch = (changes: Partial<ChatMessage>) =>
      this.sessions.update(agentId, s => ({ ...s, messages: s.messages.map(m => (m.id === id ? { ...m, ...changes } : m)) }));
    let content = '';
    this.run$ = this.configService
      .testAgent({ agent_id: agentId, llm: resolved.llm, model: resolved.model, preset: this.resolvedPreset(), prompt, prev_response_id: this.session().lastResponseId, configsm: configs })
      .subscribe({
      next: chunk => {
        // Statuses accumulate as sent — the backend already formats them (line breaks included).
        if (chunk.status) this.status.update(prev => prev + chunk.status);
        // The final chunk ends the run for the UI (spinner off), even if the stream lingers.
        if (chunk.is_final) this.generating.set(false);
        if (chunk.content) {
          content += chunk.content;
          patch({ assistantContent: content });
        }
        if (chunk.is_final) {
          this.sessions.update(agentId, s => ({
            ...s,
            executions: { ...s.executions, [id]: chunk.execution ?? null },
            lastRunId: id,
            lastResponseId: chunk.response_id || s.lastResponseId,
          }));
        }
      },
      error: err => {
        console.error('Test run failed', err);
        patch({ streaming: false });
        this.error.set((err as Error)?.message || 'The test run failed.');
        this.finish();
      },
      complete: () => {
        patch({ streaming: false });
        this.finish();
      },
    });
  }

  protected stop(): void {
    this.run$?.unsubscribe();
    this.updateSession(s => ({ ...s, messages: s.messages.map(m => (m.streaming ? { ...m, streaming: false } : m)) }));
    this.finish();
  }

  protected clear(): void {
    this.stop();
    this.updateSession(s => ({ ...s, messages: [], executions: {}, lastRunId: null, lastResponseId: null }));
    this.error.set(null);
  }

  protected viewExecution(): void {
    if (this.hasLastRun()) this.router.navigate([...this.testPath(this.agentId()), 'execution']);
  }

  /** The last status stays on screen; it's cleared only when the next prompt is sent (or on page entry). */
  private finish(): void {
    this.run$ = null;
    this.generating.set(false);
  }

}
