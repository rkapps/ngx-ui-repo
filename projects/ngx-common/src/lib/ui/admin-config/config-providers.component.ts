import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, linkedSignal, signal, type TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  TwangButtonComponent,
  TwangInputComponent,
  TwangTreeTableComponent,
  type TwangTreeTableColumn,
  type TwangTreeTableNode,
} from 'ngx-twang-ui';
import { finalize } from 'rxjs';
import { AdminConfigService, type ConfigScope, type ModelConfig, type ModelPrice, type ProviderConfig } from '../../services/admin-config.service';
import { ADMIN_RIGHT_WIDTH, ADMIN_TABLE_HEIGHT } from '../admin-page/admin-layout';
import { PageBreadcrumbs } from '../breadcrumbs/page-breadcrumbs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { CONFIG_LAYOUT_KEY } from './config-sections';
import { RefreshCacheButtonComponent } from './refresh-cache-button.component';

type StatusView = 'enabled' | 'disabled';

/** One tree row: a provider (`model` null) or one of its models, with the model's price in effect. */
interface ProviderRow {
  provider: ProviderConfig;
  model: ModelConfig | null;
  price: ModelPrice | null;
}

const providerNodeId = (p: ProviderConfig) => `provider:${p.id}`;
const modelNodeId = (p: ProviderConfig, m: ModelConfig) => `model:${p.id}:${m.id}`;
const priceKey = (provider: string, model: string) => `${provider}:${model}`;

/** A decimal-string price per million tokens, as shown. */
const price = (v: string | null | undefined) => (v ? `$${v}` : '—');

/** Token counts compactly: 1000000 → "1M", 128000 → "128K". */
function tokens(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000 && v % 100_000 === 0) return `${v / 1_000_000}M`;
  if (v >= 1_000 && v % 100 === 0) return `${v / 1_000}K`;
  return v.toLocaleString();
}

/** Local today as `YYYY-MM-DD`, to compare with `effective_from`. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Per `provider:model`, the price in effect: the latest `effective_from` on or before today. */
function currentPrices(prices: ModelPrice[]): Map<string, ModelPrice> {
  const now = today();
  const current = new Map<string, ModelPrice>();
  for (const p of prices) {
    if (p.effective_from > now) continue;
    const key = priceKey(p.provider, p.model);
    const prev = current.get(key);
    if (!prev || p.effective_from > prev.effective_from) current.set(key, p);
  }
  return current;
}

type LimitKey = 'context_window' | 'max_output_tokens';
const LIMIT_FIELDS: { key: LimitKey; label: string }[] = [
  { key: 'context_window', label: 'Context window' },
  { key: 'max_output_tokens', label: 'Max output' },
];

type PriceKey = 'input' | 'cached_input' | 'cache_write' | 'output' | 'reasoning';
const PRICE_FIELDS: { key: PriceKey; label: string }[] = [
  { key: 'input', label: 'Input' },
  { key: 'cached_input', label: 'Cached input' },
  { key: 'cache_write', label: 'Cache write' },
  { key: 'output', label: 'Output' },
  { key: 'reasoning', label: 'Reasoning' },
];

/** A model while it's edited: limits stay as typed text, converted on save. */
type ModelDraft = Omit<ModelConfig, LimitKey> & Record<LimitKey, string>;

const blankModel = (): ModelDraft => ({ id: '', enabled: true, context_window: '', max_output_tokens: '' });
const toDraft = (m: ModelConfig): ModelDraft => ({
  ...m,
  context_window: m.context_window == null ? '' : String(m.context_window),
  max_output_tokens: m.max_output_tokens == null ? '' : String(m.max_output_tokens),
});

/** Whole token count; blank = null (unknown); undefined when it isn't one. */
const parseLimit = (text: string): number | null | undefined => {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : undefined;
};

/** The draft as a ModelConfig, or null while any limit isn't a whole number. */
function fromDraft(d: ModelDraft): ModelConfig | null {
  const contextWindow = parseLimit(d.context_window);
  const maxOutput = parseLimit(d.max_output_tokens);
  if (contextWindow === undefined || maxOutput === undefined) return null;
  return { id: d.id, enabled: d.enabled, context_window: contextWindow, max_output_tokens: maxOutput };
}

const sameModel = (a: ModelConfig, b: ModelConfig) =>
  a.id === b.id && a.enabled === b.enabled && LIMIT_FIELDS.every(c => (a[c.key] ?? null) === (b[c.key] ?? null));

/** Backend error text (axum returns plain strings), else a fallback. */
function errorText(err: unknown, fallback: string): string {
  const body = (err as { error?: unknown })?.error;
  return typeof body === 'string' && body.trim() ? body : fallback;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isOptString = (v: unknown) => v === undefined || v === null || typeof v === 'string';
const isOptCount = (v: unknown) => v === undefined || v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

/** An import file's list: `{ "<key>": [...] }`, a JSON array, or a single object; or an error message. */
function parseList(text: string, key: string): unknown[] | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return 'The file is not valid JSON.';
  }
  const wrapped = isObject(json) && Array.isArray(json[key]) ? json[key] : json;
  return Array.isArray(wrapped) ? wrapped : [wrapped];
}

/** An import file's provider configs ({ "llm_providers": [...] }, a JSON array, or a single provider), or an error message. */
function parseProviders(text: string): ProviderConfig[] | string {
  const list = parseList(text, 'llm_providers');
  if (typeof list === 'string') return list;
  if (!list.length) return 'The file has no providers.';
  for (const [i, p] of list.entries()) {
    const where = `Provider ${i + 1}`;
    if (!isObject(p)) return `${where} is not an object.`;
    if (typeof p['id'] !== 'string' || !p['id']) return `${where} needs an "id".`;
    if (typeof p['llm'] !== 'string') return `${where} (${p['id']}) needs an "llm".`;
    if (typeof p['enabled'] !== 'boolean') return `${where} (${p['id']}) needs "enabled" (true/false).`;
    if (typeof p['default_model'] !== 'string') return `${where} (${p['id']}) needs a "default_model".`;
    if (!isOptString(p['api_key_env']) || !isOptString(p['base_url_env'])) return `${where} (${p['id']}): "api_key_env" / "base_url_env" must be strings or null.`;
    if (!Array.isArray(p['models'])) return `${where} (${p['id']}) needs a "models" list.`;
    for (const m of p['models'] as unknown[]) {
      const ok = isObject(m) && typeof m['id'] === 'string' && typeof m['enabled'] === 'boolean' && LIMIT_FIELDS.every(c => isOptCount(m[c.key]));
      if (!ok) return `${where} (${p['id']}): every model needs "id", "enabled", and whole-number (or null) token limits.`;
    }
  }
  return list as ProviderConfig[];
}

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;
/** A price amount as the backend's decimal string; numbers are accepted and converted. */
const amount = (v: unknown): string | null | undefined =>
  typeof v === 'number' && v >= 0 ? String(v) : typeof v === 'string' && DECIMAL.test(v.trim()) ? v.trim() : undefined;

/** An import file's model prices ({ "model_prices": [...] }, a JSON array, or a single price), or an error message. */
function parsePrices(text: string): ModelPrice[] | string {
  const list = parseList(text, 'model_prices');
  if (typeof list === 'string') return list;
  if (!list.length) return 'The file has no prices.';
  const prices: ModelPrice[] = [];
  for (const [i, p] of list.entries()) {
    const where = `Price ${i + 1}`;
    if (!isObject(p)) return `${where} is not an object.`;
    const name = typeof p['id'] === 'string' && p['id'] ? p['id'] : null;
    if (!name) return `${where} needs an "id".`;
    for (const k of ['currency', 'provider', 'model'] as const) {
      if (typeof p[k] !== 'string' || !p[k]) return `${where} (${name}) needs a "${k}".`;
    }
    if (p['unit'] !== 'per_million_tokens') return `${where} (${name}): "unit" must be "per_million_tokens".`;
    if (typeof p['effective_from'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p['effective_from'])) return `${where} (${name}): "effective_from" must be a YYYY-MM-DD date.`;
    const input = amount(p['input']);
    const output = amount(p['output']);
    if (!input || !output) return `${where} (${name}) needs non-negative "input" and "output" amounts.`;
    const optional: Partial<Record<PriceKey, string | null>> = {};
    for (const k of ['cached_input', 'cache_write', 'reasoning'] as const) {
      const v = p[k] === undefined || p[k] === null ? null : amount(p[k]);
      if (v === undefined) return `${where} (${name}): "${k}" must be a non-negative amount or null.`;
      optional[k] = v;
    }
    prices.push({
      id: name,
      currency: p['currency'] as string,
      unit: 'per_million_tokens',
      provider: p['provider'] as string,
      model: p['model'] as string,
      effective_from: p['effective_from'],
      input,
      output,
      cached_input: optional.cached_input ?? null,
      cache_write: optional.cache_write ?? null,
      reasoning: optional.reasoning ?? null,
    });
  }
  return prices;
}

/**
 * Admin > Config > Providers (and Platform > Providers): every LLM provider configuration. The
 * middle tree lists providers with their models as children — token limits plus the price in effect
 * (from `/{scope}/model_prices`); selecting either shows details in the right panel (the first
 * provider is selected on load). The route's `data.scope` picks the API and what can change.
 * `admin` (default): enable/disable providers and models. `platform`: the model catalog — add and
 * delete models and set their token limits, plus Import providers / Import prices (JSON files) in the
 * page header. Prices only change by import. A provider change saves the whole provider
 * (PUT /{scope}/providers/{id}).
 */
@Component({
  selector: 'app-config-providers',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, NgTemplateOutlet, RefreshCacheButtonComponent, ThreePanelLayoutComponent, TwangButtonComponent, TwangInputComponent, TwangTreeTableComponent],
  template: `
    <app-three-panel-layout
      [showLeft]="false"
      [rightTitle]="selected()?.provider?.llm ?? 'Details'"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">Providers</span>
          <span class="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">{{ visibleProviders().length }}</span>
          <twang-button
            class="ml-auto"
            variant="default"
            size="sm"
            [icon]="statusView() === 'enabled' ? 'toggle-right' : 'toggle-left'"
            [ariaLabel]="statusView() === 'enabled' ? 'Showing enabled — show disabled' : 'Showing disabled — show enabled'"
            [title]="statusView() === 'enabled' ? 'Showing enabled — click to show disabled' : 'Showing disabled — click to show enabled'"
            (buttonClick)="setStatusView(statusView() === 'enabled' ? 'disabled' : 'enabled')"
          />
          <twang-button
            variant="default"
            size="sm"
            icon="refresh-cw"
            ariaLabel="Refresh providers"
            title="Refresh providers"
            [loading]="loading()"
            [disabled]="loading()"
            (buttonClick)="load()"
          />
        </div>
        <div class="flex min-h-0 flex-1 flex-col">
          @if (error()) {
            <div class="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{{ error() }}</div>
          } @else {
            <twang-tree-table
              [nodes]="nodes()"
              [columns]="columns"
              [loading]="loading()"
              [fillContainerWidth]="true"
              [selectedId]="selectedNodeId()"
              [initialExpandedDepth]="0"
              [scrollPanelMaxHeight]="treeHeight"
              [scrollPanelMinHeight]="treeHeight"
              initialSortKey="name"
              initialSortDir="asc"
              tableMinWidthClass="min-w-[1260px]"
              emptyMessage="No providers configured."
              (nodeSelected)="onNodeSelected($event)"
            />
          }
        </div>
      </div>

      <!-- Right: acts on the tree selection. Provider → enable/disable, add a model. Model → edit, delete.
           Every change saves the whole provider (PUT /{scope}/providers/{id}). -->
      <div right class="flex flex-col gap-4 p-4 text-sm">
        @if (saveError()) {
          <div class="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <lucide-icon name="circle-alert" [size]="14" class="mt-0.5 shrink-0" />
            <span class="min-w-0 flex-1 break-words">{{ saveError() }}</span>
          </div>
        }

        @if (selected(); as s) {
          @if (platformScope && modelForm(); as f) {
            <!-- Selected model (platform): token limits edited in place, price, delete -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 break-all font-mono text-xs font-medium">{{ f.id }}</span>
                @if (f.id === s.provider.default_model) {
                  <span class="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] uppercase text-primary-700">default</span>
                }
                @if (!f.enabled) {
                  <span class="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase text-text-muted">disabled</span>
                }
              </div>
              <ng-container *ngTemplateOutlet="modelFields; context: { $implicit: f, patch: patchModel }" />
              <ng-container *ngTemplateOutlet="priceInfo; context: { $implicit: s }" />
              <div class="flex items-center gap-2 border-t border-border pt-3">
                @if (confirmDelete()) {
                  <span class="flex-1 text-xs text-red-700">Delete this model?</span>
                  <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="confirmDelete.set(false)" />
                  <twang-button variant="destructive" size="sm" icon="trash-2" label="Delete" [loading]="saving()" [disabled]="saving()" (buttonClick)="deleteModel(s.provider, f.id)" />
                } @else {
                  <twang-button
                    variant="default"
                    size="sm"
                    icon="trash-2"
                    ariaLabel="Delete model"
                    [title]="f.id === s.provider.default_model ? 'The default model cannot be deleted' : 'Delete model'"
                    [disabled]="saving() || f.id === s.provider.default_model"
                    (buttonClick)="confirmDelete.set(true)"
                  />
                  <twang-button class="ml-auto" variant="default" size="sm" label="Reset" [disabled]="saving() || !modelDirty()" (buttonClick)="resetModel()" />
                  <twang-button
                    variant="primary"
                    size="sm"
                    label="Save"
                    [loading]="saving()"
                    [disabled]="saving() || !modelDirty() || !draftValid(f)"
                    (buttonClick)="saveModel(s.provider)"
                  />
                }
              </div>
            </section>
          } @else if (s.model; as m) {
            <!-- Selected model (admin): enable/disable, saved straight away; limits and prices are set by the platform -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 break-all font-mono text-xs font-medium">{{ m.id }}</span>
                @if (m.id === s.provider.default_model) {
                  <span class="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] uppercase text-primary-700">default</span>
                }
              </div>
              <twang-button
                class="self-start"
                variant="default"
                size="sm"
                [icon]="m.enabled ? 'toggle-right' : 'toggle-left'"
                [label]="m.enabled ? 'Enabled' : 'Disabled'"
                [title]="m.enabled && m.id === s.provider.default_model ? 'The default model must stay enabled' : m.enabled ? 'Enabled — click to disable this model' : 'Disabled — click to enable this model'"
                [loading]="saving()"
                [disabled]="saving() || (m.enabled && m.id === s.provider.default_model)"
                (buttonClick)="toggleModel(s.provider, m)"
              />
              <section class="flex flex-col gap-2 border-t border-border pt-3">
                <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Limits</span>
                <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
                  @for (c of limitFields; track c.key) {
                    <dt class="text-xs text-text-muted">{{ c.label }}</dt>
                    <dd class="tabular-nums">{{ m[c.key] == null ? '—' : m[c.key]!.toLocaleString() }}</dd>
                  }
                </dl>
              </section>
              <ng-container *ngTemplateOutlet="priceInfo; context: { $implicit: s }" />
            </section>
          } @else {
            <!-- Selected provider: enable/disable (admin), add a model (platform) -->
            <div class="flex items-center gap-2">
              @if (adminScope) {
              <twang-button
                variant="default"
                size="sm"
                [icon]="s.provider.enabled ? 'toggle-right' : 'toggle-left'"
                [label]="s.provider.enabled ? 'Enabled' : 'Disabled'"
                [title]="s.provider.enabled ? 'Enabled — click to disable this provider' : 'Disabled — click to enable this provider'"
                [loading]="saving()"
                [disabled]="saving()"
                (buttonClick)="toggleProvider(s.provider)"
              />
              }
              @if (platformScope && addingTo()?.id !== s.provider.id) {
                <twang-button class="ml-auto" variant="primary" size="sm" icon="plus" label="Add model" [disabled]="saving()" (buttonClick)="startAdd(s.provider)" />
              }
            </div>
            <!-- Same label width as the limit fields, so the two line up. -->
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-4">
              <dt class="text-xs text-text-muted">ID</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.id }}</dd>
              <dt class="text-xs text-text-muted">Status</dt>
              <dd [class.text-red-600]="!s.provider.enabled">{{ s.provider.enabled ? 'Enabled' : 'Disabled' }}</dd>
              <dt class="text-xs text-text-muted">Default model</dt>
              <dd class="break-all">{{ s.provider.default_model || '—' }}</dd>
              <dt class="text-xs text-text-muted">Models</dt>
              <dd>{{ enabledCount(s.provider) }} of {{ s.provider.models.length }} enabled</dd>
              <dt class="text-xs text-text-muted">API key env</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.api_key_env ?? '—' }}</dd>
              <dt class="text-xs text-text-muted">Base URL env</dt>
              <dd class="break-all font-mono text-xs">{{ s.provider.base_url_env ?? '—' }}</dd>
            </dl>

            <!-- New model: added below the provider's details (Add model opens it). -->
            @if (platformScope && addingTo()?.id === s.provider.id) {
              <section class="flex flex-col gap-3 border-t border-border pt-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">New model</span>
                <div class="flex flex-col gap-1.5">
                  <label class="text-xs font-medium text-text-muted">Model id</label>
                  <twang-input placeholder="Model Id/Name" [mono]="true" [ngModel]="newModel().id" (ngModelChange)="patchNewModel({ id: $event.trim() })" />
                  @if (newModelIdError(); as err) {
                    <span class="text-xs text-red-600">{{ err }}</span>
                  }
                </div>
                <ng-container *ngTemplateOutlet="modelFields; context: { $implicit: newModel(), patch: patchNewModel }" />
                <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
                  <twang-button variant="default" size="sm" label="Cancel" [disabled]="saving()" (buttonClick)="cancelAdd()" />
                  <twang-button
                    variant="primary"
                    size="sm"
                    icon="plus"
                    label="Add model"
                    [loading]="saving()"
                    [disabled]="saving() || !newModel().id || !!newModelIdError() || !draftValid(newModel())"
                    (buttonClick)="addModel(s.provider)"
                  />
                </div>
              </section>
            }
          }
        } @else {
          <p class="text-text-muted">Select a provider to see its configuration.</p>
        }
      </div>

      <!-- Token limit inputs (platform), shared by the model editor and the new-model form. -->
      <ng-template #modelFields let-m let-patch="patch">
        <section class="flex flex-col gap-2 border-t border-border pt-3">
          <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Limits</span>
          <div class="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-2">
            @for (c of limitFields; track c.key) {
              <label class="text-xs text-text-muted">{{ c.label }}</label>
              <twang-input
                type="number"
                step="1000"
                min="0"
                placeholder="tokens"
                [class]="limitInvalid(m, c.key) ? '[&_input]:border-red-500' : ''"
                [ngModel]="m[c.key]"
                (ngModelChange)="patch(limitPatch(c.key, $event))"
              />
            }
          </div>
          @if (!draftValid(m)) {
            <span class="text-xs text-red-600">Limits must be whole numbers of tokens, or blank.</span>
          }
        </section>
      </ng-template>

      <!-- A model's price in effect, and every price on file for it (imported, read-only). -->
      <ng-template #priceInfo let-s>
        <section class="flex flex-col gap-2 border-t border-border pt-3">
          <div class="flex items-baseline gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-primary-600">Price</span>
            @if (s.price) {
              <span class="text-[11px] text-text-muted">{{ s.price.currency }} per million tokens · from {{ s.price.effective_from }}</span>
            }
          </div>
          @if (s.price; as p) {
            <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2">
              @for (f of priceFields; track f.key) {
                <dt class="text-xs text-text-muted">{{ f.label }}</dt>
                <dd class="tabular-nums">{{ price(p[f.key]) }}</dd>
              }
            </dl>
          } @else {
            <p class="text-xs text-text-muted">{{ pricesError() ?? 'No price in effect for this model.' }}</p>
          }
          @if (priceHistory(s).length > 1 || (priceHistory(s).length === 1 && !s.price)) {
            <table class="mt-1 w-full text-xs">
              <thead>
                <tr class="text-left text-text-muted">
                  <th class="py-1 font-medium">From</th>
                  <th class="py-1 text-right font-medium">Input</th>
                  <th class="py-1 text-right font-medium">Output</th>
                </tr>
              </thead>
              <tbody>
                @for (h of priceHistory(s); track h.id) {
                  <tr class="border-t border-border" [class.font-semibold]="h.id === s.price?.id">
                    <td class="py-1">{{ h.effective_from }}@if (h.effective_from > todayIso) { <span class="text-text-muted"> (upcoming)</span> }</td>
                    <td class="py-1 text-right tabular-nums">{{ price(h.input) }}</td>
                    <td class="py-1 text-right tabular-nums">{{ price(h.output) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      </ng-template>
    </app-three-panel-layout>

    <!-- Rendered in the admin header (right side) via PageBreadcrumbs.actions. -->
    <ng-template #headerActions>
      @if (adminScope) {
        <app-refresh-cache-button (refreshed)="load()" />
      } @else {
        <input #providersFile type="file" accept=".json,application/json" class="hidden" (change)="importFrom(providersFile, 'providers')" />
        <input #pricesFile type="file" accept=".json,application/json" class="hidden" (change)="importFrom(pricesFile, 'prices')" />
        <div class="flex items-center gap-2">
          <twang-button
            variant="default"
            size="sm"
            icon="upload"
            label="Import prices"
            title="Import model prices from a JSON file: an array of prices ({ &quot;model_prices&quot;: [...] } also works)"
            [loading]="importing() === 'prices'"
            [disabled]="!!importing()"
            (buttonClick)="pricesFile.click()"
          />
          <twang-button
            variant="primary"
            size="sm"
            icon="upload"
            label="Import providers"
            title="Import providers from a JSON file: the providers config ({ &quot;llm_providers&quot;: [...] }), an array, or one provider"
            [loading]="importing() === 'providers'"
            [disabled]="!!importing()"
            (buttonClick)="providersFile.click()"
          />
        </div>
      }
    </ng-template>
  `,
})
export class ConfigProvidersComponent {
  private readonly configService = inject(AdminConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scope: ConfigScope = inject(ActivatedRoute).snapshot.data['scope'] ?? 'admin';
  /** Admin: enable/disable providers and models. */
  protected readonly adminScope = this.scope === 'admin';
  /** Platform: the model catalog — add/delete models, set token limits; Import providers / prices. */
  protected readonly platformScope = this.scope === 'platform';
  protected readonly importing = signal<'providers' | 'prices' | null>(null);

  /** Refresh cache, shown on the right of the admin header while this page is open. */
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');

  protected readonly layoutKey = CONFIG_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  protected readonly providers = signal<ProviderConfig[]>([]);
  /** Every model price on file; `pricesError` when they couldn't be loaded (providers still show). */
  protected readonly prices = signal<ModelPrice[]>([]);
  protected readonly pricesError = signal<string | null>(null);
  private readonly pricesInEffect = computed(() => currentPrices(this.prices()));
  private readonly priceOf = (p: ProviderConfig, m: ModelConfig) => this.pricesInEffect().get(priceKey(p.id, m.id)) ?? null;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Enabled view (default) or Disabled view. */
  protected readonly statusView = signal<StatusView>('enabled');

  /**
   * Providers (and models) for the current view. Enabled: enabled providers with their enabled
   * models — a disabled provider's models never show here. Disabled: disabled providers with all
   * their models (so each can still be enabled/disabled), plus enabled providers' disabled models.
   */
  protected readonly visibleProviders = computed(() => {
    const enabledView = this.statusView() === 'enabled';
    return this.providers()
      .filter(p => (enabledView ? p.enabled : !p.enabled || p.models.some(m => !m.enabled)))
      .map(p => ({ ...p, models: enabledView ? p.models.filter(m => m.enabled) : p.enabled ? p.models.filter(m => !m.enabled) : p.models }));
  });

  protected readonly nodes = computed<TwangTreeTableNode<ProviderRow>[]>(() =>
    this.visibleProviders().map(provider => {
      const children = provider.models.map(model => ({
        id: modelNodeId(provider, model),
        label: model.id,
        depth: 1,
        data: { provider, model, price: this.priceOf(provider, model) },
      }));
      const row = { provider, model: null, price: null };
      // A provider with nothing to show under it is a leaf, not an (empty) group.
      return children.length
        ? { id: providerNodeId(provider), label: provider.llm, depth: 0, summary: row, children }
        : { id: providerNodeId(provider), label: provider.llm, depth: 0, data: row, children: [] };
    }),
  );

  /** Tree row highlighted in the table — a provider or a model. */
  protected readonly selectedNodeId = signal<string | null>(null);

  /** The selected row, re-resolved against fresh data so a refresh shows current values. */
  protected readonly selected = computed<ProviderRow | null>(() => {
    const id = this.selectedNodeId();
    for (const provider of this.providers()) {
      if (providerNodeId(provider) === id) return { provider, model: null, price: null };
      const model = provider.models.find(m => modelNodeId(provider, m) === id);
      if (model) return { provider, model, price: this.priceOf(provider, model) };
    }
    return null;
  });

  protected readonly treeHeight = ADMIN_TABLE_HEIGHT;

  // ── Editing ──
  protected readonly limitFields = LIMIT_FIELDS;
  protected readonly priceFields = PRICE_FIELDS;
  protected readonly todayIso = today();
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);

  /** Edit copy of the selected model; resets whenever the selection (or its saved value) changes. */
  protected readonly modelForm = linkedSignal<ModelDraft | null>(() => {
    const model = this.selected()?.model;
    return model ? toDraft(model) : null;
  });
  /** Changed from the saved model (an invalid limit counts as changed, so Reset is offered). */
  protected readonly modelDirty = computed(() => {
    const form = this.modelForm();
    const saved = this.selected()?.model;
    if (!form || !saved) return false;
    const parsed = fromDraft(form);
    return !parsed || !sameModel(parsed, saved);
  });

  /** Provider a model is being added to (its details show the new-model form below them). */
  protected readonly addingTo = signal<ProviderConfig | null>(null);
  protected readonly newModel = signal<ModelDraft>(blankModel());
  protected readonly newModelIdError = computed(() => {
    const id = this.newModel().id;
    return id && this.addingTo()?.models.some(m => m.id === id) ? 'This provider already has a model with this id.' : null;
  });

  protected readonly limitPatch = (key: LimitKey, v: unknown): Partial<ModelDraft> => ({ [key]: String(v ?? '') });
  protected readonly patchModel = (changes: Partial<ModelDraft>) => this.modelForm.update(f => (f ? { ...f, ...changes } : f));
  protected readonly patchNewModel = (changes: Partial<ModelDraft>) => this.newModel.update(m => ({ ...m, ...changes }));
  protected readonly limitInvalid = (m: ModelDraft, key: LimitKey) => parseLimit(m[key]) === undefined;
  protected readonly draftValid = (m: ModelDraft) => fromDraft(m) !== null;
  protected readonly price = price;
  /** Every price on file for the row's model, newest first. */
  protected readonly priceHistory = (r: ProviderRow) =>
    r.model
      ? this.prices()
          .filter(p => p.provider === r.provider.id && p.model === r.model!.id)
          .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
      : [];
  protected readonly enabledCount = (p: ProviderConfig) => p.models.filter(m => m.enabled).length;

  private readonly priceColumn = (key: PriceKey, header: string, width = '120px'): TwangTreeTableColumn<ProviderRow> => ({
    id: key,
    header,
    align: 'right',
    sortable: true,
    width,
    value: r => (r.price?.[key] == null ? null : Number(r.price[key])),
    format: v => (v == null ? '' : `$${v}`),
  });

  private readonly limitColumn = (key: LimitKey, header: string, width = '120px'): TwangTreeTableColumn<ProviderRow> => ({
    id: key,
    header,
    align: 'right',
    sortable: true,
    width,
    value: r => r.model?.[key] ?? null,
    format: v => (v == null ? '' : tokens(Number(v))),
  });

  protected readonly columns: TwangTreeTableColumn<ProviderRow>[] = [
    {
      id: 'name',
      header: 'Provider / Model',
      align: 'left',
      sortable: true,
      isLabelColumn: true,
      fillRemaining: true,
      minWidth: '240px',
      value: r => r.model?.id ?? r.provider.llm,
      splitCell: r => ({
        primary: r.model?.id ?? r.provider.llm, // provider rows can be leaves when no models are shown
        secondary: [r.model?.id === r.provider.default_model ? 'default' : '', r.model?.enabled === false ? 'disabled' : '']
          .filter(Boolean)
          .join(' · '),
        primaryClass: 'font-mono text-xs',
        secondaryClass: 'text-[10px] uppercase text-text-muted',
      }),
    },
    {
      id: 'status',
      header: 'Status',
      align: 'left',
      sortable: true,
      width: '100px',
      value: r => ((r.model ?? r.provider).enabled ? 'Enabled' : 'Disabled'),
    },
    this.limitColumn('context_window', 'Context'),
    this.limitColumn('max_output_tokens', 'Max output', '150px'),
    this.priceColumn('input', 'Input'),
    this.priceColumn('cached_input', 'Cached', '100px'),
    this.priceColumn('cache_write', 'Write', '100px'),
    this.priceColumn('output', 'Output'),
    {
      id: 'effective_from',
      header: 'Price from',
      align: 'right',
      sortable: true,
      width: '150px',
      value: r => r.price?.effective_from ?? null,
    },
  ];

  constructor() {
    const breadcrumbs = inject(PageBreadcrumbs);
    effect(() => breadcrumbs.actions.set(this.headerActions() ?? null));
    // Only drop our actions (not the crumbs): the next page may already have set its own.
    this.destroyRef.onDestroy(() => {
      if (breadcrumbs.actions() === this.headerActions()) breadcrumbs.actions.set(null);
    });

    this.load();
  }

  /** Switch view; keep the selection if it's still shown, otherwise select the first provider shown. */
  protected setStatusView(view: StatusView): void {
    this.statusView.set(view);
    const ids = new Set(this.nodes().flatMap(n => [n.id, ...(n.children ?? []).map(c => c.id)]));
    if (this.selectedNodeId() && ids.has(this.selectedNodeId()!)) return;
    const first = [...this.visibleProviders()].sort((a, b) => a.llm.localeCompare(b.llm))[0];
    this.selectedNodeId.set(first ? providerNodeId(first) : null);
  }

  protected onNodeSelected(node: TwangTreeTableNode<ProviderRow>): void {
    this.selectedNodeId.set(node.id);
    this.addingTo.set(null);
    this.confirmDelete.set(false);
    this.saveError.set(null);
  }

  /** Admin: flip one model's enabled flag and save straight away. */
  protected toggleModel(provider: ProviderConfig, model: ModelConfig): void {
    this.save(
      { ...provider, models: provider.models.map(m => (m.id === model.id ? { ...m, enabled: !m.enabled } : m)) },
      modelNodeId(provider, model),
    );
  }

  protected toggleProvider(provider: ProviderConfig): void {
    this.save({ ...provider, enabled: !provider.enabled }, providerNodeId(provider));
  }

  protected startAdd(provider: ProviderConfig): void {
    this.newModel.set(blankModel());
    this.saveError.set(null);
    this.addingTo.set(provider);
  }

  protected cancelAdd(): void {
    this.addingTo.set(null);
    this.saveError.set(null);
  }

  protected addModel(provider: ProviderConfig): void {
    const model = fromDraft(this.newModel());
    if (!model) return;
    this.save({ ...provider, models: [...provider.models, model] }, modelNodeId(provider, model));
  }

  protected resetModel(): void {
    const model = this.selected()?.model;
    this.modelForm.set(model ? toDraft(model) : null);
  }

  protected saveModel(provider: ProviderConfig): void {
    const draft = this.modelForm();
    const form = draft && fromDraft(draft);
    if (!form) return;
    this.save({ ...provider, models: provider.models.map(m => (m.id === form.id ? form : m)) }, modelNodeId(provider, form));
  }

  protected deleteModel(provider: ProviderConfig, modelId: string): void {
    this.save({ ...provider, models: provider.models.filter(m => m.id !== modelId) }, providerNodeId(provider));
  }

  /** PUT the whole provider; on success swap it into the list and select `selectId`. */
  private save(next: ProviderConfig, selectId: string): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.configService
      .updateProvider(next, this.scope)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: saved => {
          const updated = saved ?? next; // tolerate an empty (204) response
          this.providers.update(list => list.map(p => (p.id === updated.id ? updated : p)));
          this.addingTo.set(null);
          this.confirmDelete.set(false);
          this.reveal(selectId);
        },
        error: err => {
          console.error('Failed to save provider', err);
          this.saveError.set(errorText(err, 'Failed to save provider.'));
        },
      });
  }

  /**
   * Select a node. The Enabled/Disabled view is left alone: if the change moved the node out of it
   * (e.g. just disabled), it drops out of the tree but stays in the right panel — `selected()`
   * resolves against all providers — so it can be re-enabled straight away.
   */
  private reveal(nodeId: string): void {
    this.selectedNodeId.set(nodeId);
  }

  /** Import the chosen JSON file (`POST /platform/providers/import` or `/platform/model_prices/import`), then reload. */
  protected importFrom(input: HTMLInputElement, kind: 'providers' | 'prices'): void {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires (change)
    if (!file) return;
    this.saveError.set(null);
    file.text().then(text => {
      const parsed = kind === 'providers' ? parseProviders(text) : parsePrices(text);
      if (typeof parsed === 'string') {
        this.saveError.set(`Couldn't import ${file.name}: ${parsed}`);
        return;
      }
      this.importing.set(kind);
      const request = kind === 'providers' ? this.configService.importProviders(parsed as ProviderConfig[]) : this.configService.importModelPrices(parsed as ModelPrice[]);
      request
        .pipe(
          finalize(() => this.importing.set(null)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => this.load(),
          error: err => {
            console.error(`Failed to import ${kind}`, err);
            this.saveError.set(errorText(err, `Failed to import ${kind}.`));
          },
        });
    });
  }

  protected load(): void {
    this.loadPrices();
    this.loading.set(true);
    this.error.set(null);
    this.configService
      .getProviders(this.scope)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: providers => {
          this.providers.set(providers);
          // Keep the current selection if it's still there; otherwise select the first provider
          // in the tree's default order (name A–Z).
          if (this.selected()) return;
          const first = [...this.visibleProviders()].sort((a, b) => a.llm.localeCompare(b.llm))[0];
          this.selectedNodeId.set(first ? providerNodeId(first) : null);
        },
        error: err => {
          console.error('Failed to load providers', err);
          this.error.set('Failed to load providers.');
        },
      });
  }

  private loadPrices(): void {
    this.pricesError.set(null);
    this.configService
      .getModelPrices(this.scope)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: prices => this.prices.set(prices),
        error: err => {
          console.error('Failed to load model prices', err);
          this.pricesError.set("Couldn't load model prices.");
        },
      });
  }
}
