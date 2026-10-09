import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { TwangButtonComponent, TwangDropdownComponent, type TwangDropdownOption, TwangInputComponent } from 'ngx-twang-ui';
import { map, type Observable } from 'rxjs';
import {
  type AgentConfig,
  type AgentConfigVersion,
  AdminConfigService,
  EXECUTION_TYPE_LABELS,
  type ExecutionType,
  type LlmConfig,
  type PipelineConfig,
  type PipelineType,
  type Preset,
  type ProviderConfig,
  type ToolDefinition,
} from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { MarkdownPipe } from '../chat/markdown.pipe';
import { JsonViewComponent } from '../logs/json-view.component';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';

type ToolSource = 'registry' | 'mcp';

/** One entry in the left section nav; `depth` 1 = nested under Pipeline (stages, etc.). */
interface NavItem {
  id: string;
  label: string;
  depth: 0 | 1;
  /** Muted tag after the label (e.g. "synthesizer"). */
  tag?: string;
}

const EXECUTION_OPTIONS: TwangDropdownOption[] = (Object.keys(EXECUTION_TYPE_LABELS) as ExecutionType[]).map(value => ({
  value,
  label: EXECUTION_TYPE_LABELS[value],
}));

const PRESETS: { value: Preset; hint: string }[] = [
  { value: 'fast', hint: 'speed first' },
  { value: 'balanced', hint: 'cache, low reasoning' },
  { value: 'data', hint: 'extraction' },
  { value: 'precise', hint: 'accuracy over speed' },
  { value: 'thorough', hint: 'max quality' },
  { value: 'local', hint: 'local models' },
];

const SERVER_DEFAULT: TwangDropdownOption = { value: '', label: 'Server default' };

/** Option list for `value`, keeping an unknown stored value visible rather than silently blank. */
function withCurrent(options: TwangDropdownOption[], value: string | null | undefined): TwangDropdownOption[] {
  return value && !options.some(o => o.value === value) ? [...options, { value, label: `${value} (not configured)` }] : options;
}

function blankAgent(): AgentConfig {
  return {
    id: '',
    name: '',
    description: '',
    llm_config: null,
    enabled: true,
    origin: 'client',
    standalone: false,
    execution: 'single_agent',
    system_prompt: '',
    tools: [],
    mcp_tools: [],
    conversation: null,
    pipeline: null,
    response_format_schema_path: '',
    response_format_schema: null,
  };
}

function blankPipeline(): PipelineConfig {
  return { type: 'deterministic', available_agents: [], stages: [], followup_agent: null, persisted_blackboard_keys: null };
}

/** The backend's error message (handlers return plain-text bodies), else `fallback`. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

/** The backend runs any `pipeline.type` other than "deterministic" as dynamic. */
const pipelineMode = (p: PipelineConfig | null | undefined): PipelineType => (p?.type === 'deterministic' ? 'deterministic' : 'dynamic');

/**
 * Admin > Config > Agents > New / Edit. One layout for both: the left panel is a section nav
 * (pipelines list their stages, or available agents/follow-up, under "Pipeline"), the middle shows
 * one section at a time with previous/next at the bottom, and the right is version history.
 *
 * New: Create agent → `POST /admin/agents` (v1 draft), then continues in edit mode. Edit: opens the
 * agent's draft (`POST …/versions`, created if needed); Save draft → `PUT …/versions/{v}`. Edits change a local draft;
 * Save creates a new version (create mode: the agent and its version 1).
 *
 * Built so far: General (incl. LLM; type only while creating), Description (markdown), System prompt, Tools (registry + MCP). The remaining sections
 * are placeholders/read-only until they're built out, and Save isn't wired to the backend yet.
 */
@Component({
  selector: 'app-agent-editor',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, JsonViewComponent, LucideAngularModule, MarkdownPipe, ThreePanelLayoutComponent, TwangButtonComponent, TwangDropdownComponent, TwangInputComponent],
  template: `
    @if (loading()) {
      <div class="flex min-h-[50vh] items-center justify-center gap-2 rounded-lg border border-border bg-white p-8 text-sm text-text-muted">
        <lucide-icon name="loader-circle" [size]="16" class="animate-spin" /> Loading agent…
      </div>
    } @else if (loadError()) {
      <div class="flex min-h-[50vh] items-center justify-center rounded-lg border border-border bg-white p-8 text-sm text-red-600">
        {{ loadError() }}
      </div>
    } @else {
      <app-three-panel-layout
        leftTitle="Sections"
        rightTitle="Versions"
        [rightWidth]="rightWidth"
        storageKey="admin.config.agent-editor.layout"
        panelMinHeight="min-h-[70vh]"
      >
        <!-- Left: section nav (pipelines nest their stages) -->
        <nav left class="flex flex-col gap-0.5" aria-label="Agent sections">
          @for (item of nav(); track item.id) {
            <button
              type="button"
              class="flex items-center gap-2 rounded-md py-1.5 pr-3 text-left text-sm transition-colors hover:bg-surface-muted"
              [class.pl-3]="item.depth === 0"
              [class.pl-8]="item.depth === 1"
              [class.font-medium]="item.depth === 0"
              [class.text-text-muted]="current() !== item.id"
              [class.bg-primary-50]="current() === item.id"
              [class.!text-primary-700]="current() === item.id"
              (click)="goTo(item.id)"
            >
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              @if (item.tag) {
                <span class="shrink-0 text-[10px] uppercase text-text-muted">{{ item.tag }}</span>
              }
            </button>
          }
        </nav>

        <!-- Middle: one section at a time (fixed height, so editors get the room), with
             previous/next at the bottom. flex-none: flex-1 would size to content here. -->
        <div middle class="flex h-[70vh] flex-none flex-col gap-3">
          <!-- Save bar: only while there are unsaved changes -->
          @if (dirty()) {
            <div class="sticky top-0 z-10 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm">
              <lucide-icon name="circle-alert" [size]="16" class="text-primary-600" />
              <span class="flex-1 text-primary-700">
                @if (saveError()) {
                  <span class="text-red-600">{{ saveError() }}</span>
                } @else if (isNew() && !idValid()) {
                  Enter an ID (letters, numbers, - or _) to create the agent.
                } @else {
                  Unsaved changes
                }
              </span>
              <twang-button variant="default" size="sm" label="Discard" [disabled]="saving()" (buttonClick)="discard()" />
              <twang-button
                variant="primary"
                size="sm"
                [label]="isNew() ? 'Create agent' : 'Save draft'"
                [loading]="saving()"
                [disabled]="saving() || (isNew() && !idValid())"
                (buttonClick)="save()"
              />
            </div>
          }

          <!-- General (incl. LLM) -->
          @if (current() === 'sec-general') {
            <section id="sec-general" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
              <h2 class="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">General</h2>
              <!-- Two columns: ID, name, type, flags stacked (⅔) | LLM (⅓) -->
              <div class="grid min-h-0 flex-1 content-start gap-x-8 gap-y-5 overflow-y-auto p-4 md:grid-cols-3">
                <div class="flex flex-col gap-4 md:col-span-2">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-text-muted">ID</label>
                    @if (isNew()) {
                      <twang-input placeholder="e.g. finance-data" [mono]="true" [ngModel]="draft().id" (ngModelChange)="patch({ id: $event })" />
                    } @else {
                      <span class="py-2 font-mono text-sm">{{ draft().id }}</span>
                    }
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-text-muted">Name</label>
                    <twang-input placeholder="Display name" [ngModel]="draft().name" (ngModelChange)="patch({ name: $event })" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-xs font-medium text-text-muted">Type</label>
                    @if (isNew()) {
                      <twang-dropdown size="sm" [options]="executionOptions" [value]="draft().execution" (valueChange)="setExecution($any($event))" />
                    } @else {
                      <span class="py-2 text-sm">{{ executionLabel(draft().execution) }}</span>
                    }
                  </div>
                  <label class="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" class="accent-primary-600" [checked]="draft().enabled" (change)="patch({ enabled: !draft().enabled })" />
                    Enabled
                  </label>
                  <label class="flex cursor-pointer items-center gap-2 text-sm" title="Appears in the public catalog and can be started directly">
                    <input type="checkbox" class="accent-primary-600" [checked]="draft().standalone" (change)="patch({ standalone: !draft().standalone })" />
                    Standalone (public)
                  </label>
                </div>

                <!-- LLM -->
                <div class="flex flex-col gap-4 md:border-l md:border-border md:pl-8">
                  <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">LLM</span>
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
                  <p class="text-xs text-text-muted">
                    Unset fields fall back to the caller's choice, then the server default.
                    @if (providersError()) {
                      <span class="text-red-600">{{ providersError() }}</span>
                    }
                  </p>
                </div>
              </div>
            </section>
          }

          <!-- Description (markdown: what the agent does, with examples) -->
          @if (current() === 'sec-description') {
            <section id="sec-description" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
              <h2 class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-sm font-semibold text-primary-600">
                Description
                <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-text-muted">markdown</span>
                <span class="ml-auto inline-flex rounded-lg border border-border p-0.5 text-xs font-normal" role="tablist">
                  @for (tab of descriptionTabs; track tab) {
                    <button
                      type="button"
                      role="tab"
                      class="rounded-md px-2.5 py-1 capitalize transition-colors"
                      [class]="descriptionTab() === tab ? 'bg-primary-50 font-medium text-primary-700' : 'text-text-muted hover:text-text'"
                      [attr.aria-selected]="descriptionTab() === tab"
                      (click)="descriptionTab.set(tab)"
                    >{{ tab }}</button>
                  }
                </span>
              </h2>
              <div class="flex min-h-0 flex-1 flex-col p-4">
                @if (descriptionTab() === 'write') {
                  <textarea
                    class="min-h-48 w-full flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs leading-relaxed text-text placeholder:text-text-muted outline-none transition-shadow focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                    placeholder="What this agent does, when to use it, and example prompts — markdown supported"
                    [value]="draft().description"
                    (input)="patch({ description: $any($event.target).value })"
                  ></textarea>
                } @else if (draft().description.trim()) {
                  <div class="prose prose-sm min-h-48 max-w-none flex-1 overflow-y-auto rounded-lg border border-border px-4 py-3" [innerHTML]="draft().description | markdown"></div>
                } @else {
                  <p class="min-h-48 flex-1 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-text-muted">Nothing to preview yet.</p>
                }
              </div>
            </section>
          }

          <!-- System prompt (all types — a pipeline's own agent uses it too, e.g. the dynamic orchestrator) -->
          @if (current() === 'sec-prompt') {
            <section id="sec-prompt" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
              <h2 class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">
                System prompt
                <span class="ml-auto text-xs font-normal tabular-nums text-text-muted">
                  {{ draft().system_prompt.length | number }} chars · ~{{ promptTokens() | number }} tokens
                </span>
              </h2>
              <div class="flex min-h-0 flex-1 flex-col p-4">
                <textarea
                  class="min-h-48 w-full flex-1 resize-none rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs leading-relaxed text-text placeholder:text-text-muted outline-none transition-shadow focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                  placeholder="Instructions injected before every conversation"
                  spellcheck="false"
                  [value]="draft().system_prompt"
                  (input)="patch({ system_prompt: $any($event.target).value })"
                ></textarea>
              </div>
            </section>
          }

          @if (isPipeline()) {
            <!-- Pipeline -->
            @if (current() === 'sec-pipeline') {
              <section id="sec-pipeline" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
                <h2 class="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">Pipeline</h2>
                <p class="p-4 text-sm text-text-muted">
                  Mode: <span class="font-medium text-text">{{ mode() === 'deterministic' ? 'Deterministic' : 'Dynamic' }}</span> — toggle,
                  plus {{ mode() === 'deterministic' ? 'ordered stages of sub-agents' : 'available agents and a follow-up agent' }} picked from existing agents.
                </p>
              </section>
            }

            @if (mode() === 'deterministic') {
              @for (stage of draft().pipeline!.stages; track $index; let i = $index; let last = $last) {
@if (current() === 'sec-stage-' + i) {
                    <section [id]="'sec-stage-' + i" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
                    <h2 class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">
                      Stage {{ i + 1 }} · {{ stage.name || 'Untitled' }}
                      @if (last) {
                        <span class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] uppercase text-green-700">synthesizer</span>
                      }
                      @if (stage.parallel) {
                        <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-text-muted">parallel</span>
                      }
                    </h2>
                    <div class="flex flex-wrap gap-1 p-4">
                      @for (sub of stage.sub_agents; track $index) {
                        <span class="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs">{{ sub.id }}</span>
                      } @empty {
                        <span class="text-sm text-text-muted">No sub-agents.</span>
                      }
                    </div>
                  </section>
                }
              }
            } @else {
              @if (current() === 'sec-available') {
                <section id="sec-available" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
                  <h2 class="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">Available agents</h2>
                  <div class="flex flex-wrap gap-1 p-4">
                    @for (sub of draft().pipeline!.available_agents; track $index) {
                      <span class="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs">{{ sub.id }}</span>
                    } @empty {
                      <span class="text-sm text-text-muted">No agents selected.</span>
                    }
                  </div>
                </section>
              }
              @if (current() === 'sec-followup') {
                <section id="sec-followup" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
                  <h2 class="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">Follow-up</h2>
                  <p class="p-4 font-mono text-sm">{{ draft().pipeline!.followup_agent || '—' }}</p>
                </section>
              }
            }
          } @else {
            <!-- Tools (standard and pipeline agents) -->
            @if (current() === 'sec-tools') {
            <section id="sec-tools" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
              <h2 class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-sm font-semibold text-primary-600">
                Tools
                <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ draft().tools.length + draft().mcp_tools.length }} selected</span>
                <div class="ml-auto w-56 font-normal">
                  <twang-input placeholder="Filter tools…" [ngModel]="toolFilter()" (ngModelChange)="toolFilter.set($event)" />
                </div>
              </h2>
              <div class="grid min-h-0 flex-1 md:grid-cols-3">
                <!-- Checklist: names only, grouped by source -->
                <ul class="min-h-0 overflow-y-auto border-border md:border-r">
                  @for (group of toolGroups(); track group.source) {
                    <li class="sticky top-0 z-[1] flex items-center gap-2 border-b border-border bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {{ group.label }}
                      <span class="font-normal normal-case tracking-normal">{{ group.selectedCount }} / {{ group.rows.length }}</span>
                    </li>
                    @if (group.error) {
                      <li class="px-4 py-2 text-sm text-red-600">{{ group.error }}</li>
                    }
                    @for (tool of group.rows; track tool.key) {
                      <li
                        class="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 hover:bg-surface-muted"
                        [class.bg-primary-50]="focusedTool() === tool.key"
                        (click)="focusedTool.set(tool.key)"
                      >
                        <input
                          type="checkbox"
                          class="accent-primary-600"
                          [checked]="tool.selected"
                          [attr.aria-label]="'Give the agent ' + tool.name"
                          (click)="$event.stopPropagation()"
                          (change)="toggleTool(group.source, tool.name)"
                        />
                        <span class="min-w-0 flex-1 truncate font-mono text-xs" [class.font-semibold]="tool.selected">{{ tool.name }}</span>
                        @if (!tool.def && group.loaded) {
                          <span class="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase text-red-700" [title]="'Not offered by ' + group.label">missing</span>
                        }
                      </li>
                    } @empty {
                      <li class="px-4 py-2 text-sm text-text-muted">{{ group.loaded ? 'No tools match.' : 'Loading…' }}</li>
                    }
                  }
                </ul>

                <!-- Focused tool: description (top half) | parameters (bottom half) -->
                <div class="flex min-h-0 flex-col md:col-span-2">
                  @if (focusedDef(); as def) {
                    <div class="flex min-h-0 flex-1 flex-col gap-2 border-b border-border p-4 text-sm">
                      <span class="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold">
                        {{ def.name }}
                        <span class="rounded bg-surface-muted px-1.5 py-0.5 font-sans text-[10px] font-normal uppercase text-text-muted">{{ focusedSource() === 'mcp' ? 'MCP' : 'Registry' }}</span>
                      </span>
                      <p class="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-text-muted">{{ def.description || 'No description.' }}</p>
                    </div>
                    <div class="flex min-h-0 flex-1 flex-col p-4">
                      <app-json-view title="Parameters" [value]="def.parameters" emptyText="No parameters." [fill]="true" />
                    </div>
                  } @else {
                    <p class="p-4 text-sm text-text-muted">Select a tool to see its description and parameters.</p>
                  }
                </div>
              </div>
            </section>
          }
          }

          <!-- Response format -->
          @if (current() === 'sec-response') {
            <section id="sec-response" class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
              <h2 class="shrink-0 border-b border-border px-4 py-3 text-sm font-semibold text-primary-600">Response format</h2>
              <p class="p-4 text-sm text-text-muted">Schema path or inline JSON schema.</p>
            </section>
          }

          <!-- Step through sections -->
          <div class="flex shrink-0 items-center justify-end gap-2">
            <span class="mr-1 text-xs tabular-nums text-text-muted">{{ index() + 1 }} / {{ nav().length }}</span>
            <twang-button
              variant="default"
              size="sm"
              icon="chevron-left"
              label="Prev"
              [title]="prev() ? 'Previous: ' + prev()!.label : ''"
              [disabled]="!prev()"
              (buttonClick)="goTo(prev()!.id)"
            />
            <twang-button
              variant="primarySoft"
              size="sm"
              icon="chevron-right"
              label="Next"
              [title]="next() ? 'Next: ' + next()!.label : ''"
              [disabled]="!next()"
              (buttonClick)="goTo(next()!.id)"
            />
          </div>
        </div>

        <!-- Right: versions -->
        <div right class="flex flex-col gap-2 p-4 text-sm">
          @if (isNew()) {
            <p class="text-text-muted">Creating the agent saves it as version 1 (draft). It goes live once promoted.</p>
          } @else {
            @for (v of versionsNewestFirst(); track v.id) {
              <div class="rounded-md border px-3 py-2" [class]="v.version === draftVersion()?.version ? 'border-primary-300 bg-primary-50' : 'border-border'">
                <div class="flex items-center gap-2">
                  <span class="font-semibold tabular-nums">v{{ v.version }}</span>
                  @if (v.status === 'Draft') {
                    <span class="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">draft</span>
                  } @else if (v.version === liveVersion()) {
                    <span class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] uppercase text-green-700">live</span>
                  }
                  @if (v.version === draftVersion()?.version) {
                    <span class="ml-auto text-[10px] uppercase text-primary-700">editing</span>
                  }
                </div>
                <div class="mt-0.5 truncate text-xs text-text-muted">{{ v.created_by_email || v.created_by }} · {{ v.created_at | date: 'MMM d, HH:mm' }}</div>
                @if (v.note) {
                  <div class="mt-1 text-xs">{{ v.note }}</div>
                }
              </div>
            } @empty {
              <p class="text-text-muted">No versions yet.</p>
            }
          }
        </div>
      </app-three-panel-layout>
    }
  `,
})
export class AgentEditorComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly breadcrumbs = inject(PageBreadcrumbs);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;
  protected readonly executionOptions = EXECUTION_OPTIONS;
  protected readonly executionLabel = (e: ExecutionType) => EXECUTION_TYPE_LABELS[e] ?? e;

  /** Agent id from `:id`; null on the `new` route. */
  private readonly agentId = toSignal(this.route.paramMap.pipe(map(p => p.get('id'))), { requireSync: true });
  protected readonly isNew = computed(() => !this.agentId());

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  // ── Versions / saving ──
  /** The draft version being edited (edit mode). */
  protected readonly draftVersion = signal<AgentConfigVersion | null>(null);
  private readonly versions = signal<AgentConfigVersion[]>([]);
  protected readonly versionsNewestFirst = computed(() => [...this.versions()].sort((a, b) => b.version - a.version));
  /** The newest promoted version — what's live. */
  protected readonly liveVersion = computed(
    () => this.versionsNewestFirst().find(v => v.status === 'Promoted')?.version ?? null,
  );
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Create mode: the only check before the backend's — a usable, URL-safe id. */
  protected readonly idValid = computed(() => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(this.draft().id.trim()));

  /** Last saved state (blank for a new agent) and the working copy being edited. */
  private readonly original = signal<AgentConfig>(blankAgent());
  protected readonly draft = signal<AgentConfig>(blankAgent());
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.original()));

  protected readonly isPipeline = computed(() => this.draft().execution === 'pipeline');
  protected readonly mode = computed(() => pipelineMode(this.draft().pipeline));

  protected readonly activeSection = signal('sec-general');
  /** The section on screen — the selected one, or the first if it no longer exists (e.g. type changed). */
  protected readonly current = computed(() => {
    const items = this.nav();
    return items.some(n => n.id === this.activeSection()) ? this.activeSection() : items[0].id;
  });
  protected readonly index = computed(() => this.nav().findIndex(n => n.id === this.current()));
  protected readonly prev = computed<NavItem | null>(() => this.nav()[this.index() - 1] ?? null);
  protected readonly next = computed<NavItem | null>(() => this.nav()[this.index() + 1] ?? null);

  // ── LLM ──
  private readonly providers = signal<ProviderConfig[]>([]);
  protected readonly providersError = signal<string | null>(null);
  /** The draft's LLM settings, with nulls for anything unset. */
  protected readonly llm = computed<LlmConfig>(() => this.draft().llm_config ?? { llm: null, model: null, preset: null });

  protected readonly providerOptions = computed<TwangDropdownOption[]>(() =>
    withCurrent(
      [
        SERVER_DEFAULT,
        ...[...this.providers()]
          .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.llm.localeCompare(b.llm))
          .map(p => ({ value: p.id, label: p.enabled ? p.llm : `${p.llm} (disabled)` })),
      ],
      this.llm().llm,
    ),
  );

  /** The selected provider's models: default first, then enabled, then disabled. */
  protected readonly modelOptions = computed<TwangDropdownOption[]>(() => {
    const provider = this.providers().find(p => p.id === this.llm().llm);
    const rank = (id: string, enabled: boolean) => (id === provider?.default_model ? 0 : enabled ? 1 : 2);
    const models = [...(provider?.models ?? [])].sort((a, b) => rank(a.id, a.enabled) - rank(b.id, b.enabled) || a.id.localeCompare(b.id));
    return withCurrent(
      [
        { value: '', label: provider ? `Provider default (${provider.default_model})` : 'Server default' },
        ...models.map(m => ({
          value: m.id,
          label: m.id + (m.id === provider?.default_model ? ' · default' : '') + (m.enabled ? '' : ' (disabled)'),
        })),
      ],
      this.llm().model,
    );
  });

  protected readonly presetOptions: TwangDropdownOption[] = [SERVER_DEFAULT, ...PRESETS.map(p => ({ value: p.value, label: `${p.value} — ${p.hint}` }))];

  // ── Description ──
  protected readonly descriptionTabs = ['write', 'preview'] as const;
  protected readonly descriptionTab = signal<'write' | 'preview'>('write');

  // ── Tools ──
  // Two sources: the tool registry (stored in `tools`) and MCP servers (stored in `mcp_tools`).
  private readonly toolSources = {
    registry: { label: 'Registry', field: 'tools', defs: signal<ToolDefinition[]>([]), loaded: signal(false), error: signal<string | null>(null) },
    mcp: { label: 'MCP', field: 'mcp_tools', defs: signal<ToolDefinition[]>([]), loaded: signal(false), error: signal<string | null>(null) },
  } as const;
  protected readonly toolFilter = signal('');
  /** `source:name` of the tool whose description/schema shows on the right. */
  protected readonly focusedTool = signal<string | null>(null);

  /**
   * Per source: offered tools plus any selected ones that aren't offered (so they can be
   * unticked), filtered by name/description, alphabetical.
   */
  protected readonly toolGroups = computed(() => {
    const q = this.toolFilter().trim().toLowerCase();
    return (Object.keys(this.toolSources) as ToolSource[]).map(source => {
      const src = this.toolSources[source];
      const selected = new Set(this.draft()[src.field]);
      const byName = new Map(src.defs().map(t => [t.name, t]));
      const rows = [...new Set([...byName.keys(), ...selected])]
        .map(name => ({ key: `${source}:${name}`, name, def: byName.get(name) ?? null, selected: selected.has(name) }))
        .filter(r => !q || r.name.toLowerCase().includes(q) || r.def?.description.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { source, label: src.label, rows, selectedCount: selected.size, loaded: src.loaded(), error: src.error() };
    });
  });

  protected readonly focusedSource = computed(() => (this.focusedTool()?.split(':')[0] ?? null) as ToolSource | null);
  protected readonly focusedDef = computed(() => {
    const key = this.focusedTool();
    const source = this.focusedSource();
    if (!key || !source) return null;
    const name = key.slice(source.length + 1);
    return this.toolSources[source].defs().find(t => t.name === name) ?? null;
  });

  // ── System prompt ──
  /** Rough token estimate (~4 chars/token) — just a size hint. */
  protected readonly promptTokens = computed(() => Math.ceil(this.draft().system_prompt.length / 4));

  /** Section nav; pipelines nest their stages (deterministic) or available/follow-up (dynamic). */
  protected readonly nav = computed<NavItem[]>(() => {
    const items: NavItem[] = [
      { id: 'sec-general', label: 'General', depth: 0 },
      { id: 'sec-description', label: 'Description', depth: 0 },
      { id: 'sec-prompt', label: 'System prompt', depth: 0 },
    ];
    const pipeline = this.draft().pipeline;
    if (this.isPipeline() && pipeline) {
      const deterministic = this.mode() === 'deterministic';
      items.push({ id: 'sec-pipeline', label: `Pipeline · ${deterministic ? 'Deterministic' : 'Dynamic'}`, depth: 0 });
      if (deterministic) {
        pipeline.stages.forEach((stage, i) =>
          items.push({
            id: `sec-stage-${i}`,
            label: `${i + 1}. ${stage.name || 'Untitled'}`,
            depth: 1,
            tag: i === pipeline.stages.length - 1 ? 'synthesizer' : undefined,
          }),
        );
      } else {
        items.push({ id: 'sec-available', label: 'Available agents', depth: 1 });
        items.push({ id: 'sec-followup', label: 'Follow-up', depth: 1 });
      }
    } else {
      items.push({ id: 'sec-tools', label: 'Tools', depth: 0 });
    }
    items.push({ id: 'sec-response', label: 'Response format', depth: 0 });
    return items;
  });

  constructor() {
    const destroyRef = this.destroyRef;

    this.loadToolSource('registry', this.configService.getTools(), destroyRef);
    this.loadToolSource('mcp', this.configService.getMcpTools(), destroyRef);

    this.configService
      .getProviders()
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe({
        next: providers => this.providers.set(providers),
        error: err => {
          console.error('Failed to load providers', err);
          this.providersError.set("Couldn't load providers.");
        },
      });

    // Edit mode: open the agent's draft version (the backend creates one — and a v1 baseline for
    // agents that predate versioning — if needed), then load the version list.
    const id = this.agentId();
    if (id) {
      this.loading.set(true);
      this.configService
        .openAgentDraft(id)
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe({
          next: version => {
            this.draftVersion.set(version);
            this.original.set(structuredClone(version.config));
            this.draft.set(structuredClone(version.config));
            this.loading.set(false);
            this.loadVersions();
          },
          error: err => {
            console.error('Failed to open agent draft', err);
            this.loadError.set(err?.status === 404 ? `Agent "${id}" doesn't exist.` : errorText(err, "Couldn't open the agent for editing."));
            this.loading.set(false);
          },
        });
    }

    effect(() => {
      const name = this.isNew() ? 'New agent' : this.original().name || this.agentId() || 'Agent';
      this.breadcrumbs.set([
        { label: 'Agents', path: ['/admin', 'config', 'agents'] },
        { label: name },
        ...(this.isNew() ? [] : [{ label: this.draftVersion() ? `Edit · v${this.draftVersion()!.version} draft` : 'Edit' }]),
      ]);
    });
    destroyRef.onDestroy(() => this.breadcrumbs.clear());
  }

  protected patch(changes: Partial<AgentConfig>): void {
    this.draft.update(d => ({ ...d, ...changes }));
  }

  /** Merges into `llm_config`; all-unset collapses back to `null` (no override). */
  protected setLlm(changes: Partial<LlmConfig>): void {
    this.draft.update(d => {
      const next: LlmConfig = { ...(d.llm_config ?? { llm: null, model: null, preset: null }), ...changes };
      return { ...d, llm_config: next.llm || next.model || next.preset ? next : null };
    });
  }

  /** Changing provider drops a model that the new provider doesn't have. */
  protected setProvider(value: string): void {
    const llm = value || null;
    const model = this.llm().model;
    const keep = !!llm && !!model && !!this.providers().find(p => p.id === llm)?.models.some(m => m.id === model);
    this.setLlm({ llm, model: keep ? model : null });
  }

  protected toggleTool(source: ToolSource, name: string): void {
    const field = this.toolSources[source].field;
    this.draft.update(d => ({
      ...d,
      [field]: d[field].includes(name) ? d[field].filter(t => t !== name) : [...d[field], name],
    }));
  }

  private loadToolSource(source: ToolSource, request: Observable<ToolDefinition[]>, destroyRef: DestroyRef): void {
    const src = this.toolSources[source];
    request.pipe(takeUntilDestroyed(destroyRef)).subscribe({
      next: defs => {
        src.defs.set(defs);
        src.loaded.set(true);
      },
      error: err => {
        console.error(`Failed to load ${src.label} tools`, err);
        src.error.set(`Couldn't load ${src.label} tools.`);
        src.loaded.set(true);
      },
    });
  }

  /** Create mode only: switching to/from a pipeline adds or drops the pipeline settings. */
  protected setExecution(execution: ExecutionType): void {
    this.draft.update(d => ({
      ...d,
      execution,
      pipeline: execution === 'pipeline' ? (d.pipeline ?? blankPipeline()) : null,
    }));
  }

  protected save(): void {
    const config = this.draft();
    this.saving.set(true);
    this.saveError.set(null);
    const done = () => this.saving.set(false);
    const fail = (fallback: string) => (err: unknown) => {
      console.error(fallback, err);
      this.saveError.set(errorText(err, fallback));
      done();
    };

    if (this.isNew()) {
      // Create → v1 draft, then continue in edit mode for that agent (which reopens the same draft).
      this.configService.createAgent(config).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: version => {
          this.original.set(structuredClone(config)); // no "unsaved changes" flash on the way out
          done();
          this.router.navigate(['/admin', 'config', 'agents', version.agent_id, 'edit'], { replaceUrl: true });
        },
        error: fail("Couldn't create the agent."),
      });
      return;
    }

    const version = this.draftVersion();
    if (!version) return done();
    this.configService.saveAgentDraft(version.agent_id, version.version, config).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.original.set(structuredClone(config));
        done();
        this.loadVersions();
      },
      error: fail("Couldn't save the draft."),
    });
  }

  private loadVersions(): void {
    const id = this.agentId();
    if (!id) return;
    this.configService.getAgentVersions(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: versions => this.versions.set(versions),
      error: err => console.error('Failed to load versions', err),
    });
  }

  protected discard(): void {
    this.saveError.set(null);
    this.draft.set(structuredClone(this.original()));
  }

  protected goTo(sectionId: string): void {
    this.activeSection.set(sectionId);
  }
}
