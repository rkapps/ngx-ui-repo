import { Component, computed, input } from '@angular/core';
import {
    Award,
    Globe,
    Heart,
    House,
    Info,
    LucideAngularModule,
    LucideIconData,
    MapPin,
    MessageCircle,
    Monitor,
    Newspaper,
    Search,
    ShoppingCart,
    Smartphone,
    Star,
    ThumbsDown,
    ThumbsUp,
    TrendingDown,
    TrendingUp,
    Users,
    Zap,
} from 'lucide-angular';
import { ConsumerBuzzSection, SentimentItem, Signal } from '../message-renderer.types';

// Semi-circle arc: centre (50,44), radius 38
// Arc length = π × 38 ≈ 119.4
const RADIUS = 38;
const CX = 50;
const CY = 44;
const ARC_PATH = `M ${CX - RADIUS},${CY} A ${RADIUS},${RADIUS} 0 0 1 ${CX + RADIUS},${CY}`;
const ARC_LENGTH = Math.PI * RADIUS;

/**
 * Icon names the LLM may use in consumer_buzz sections.
 * Keys are kebab-case names (incl. common aliases); values are lucide icon data.
 */
export const CONSUMER_BUZZ_ICONS: Record<string, LucideIconData> = {
    // reviews / ratings
    'star':           Star,
    'award':          Award,
    'heart':          Heart,
    'thumbs-up':      ThumbsUp,
    'thumbs-down':    ThumbsDown,
    // social / comms
    'message-circle': MessageCircle,
    'brand-twitter':  MessageCircle,
    'brand-reddit':   MessageCircle,
    'users':          Users,
    // channels
    'smartphone':     Smartphone,
    'device-mobile':  Smartphone,
    'monitor':        Monitor,
    'device-desktop': Monitor,
    'globe':          Globe,
    'search':         Search,
    'newspaper':      Newspaper,
    'shopping-cart':  ShoppingCart,
    // location
    'home':           House,
    'house':          House,
    'map-pin':        MapPin,
    // signals
    'trending-up':    TrendingUp,
    'trending-down':  TrendingDown,
    'zap':            Zap,
    'info':           Info,
};

/** Kebab-case names the LLM can reference — export for use in system prompts. */
export const CONSUMER_BUZZ_ICON_NAMES = Object.keys(CONSUMER_BUZZ_ICONS);

@Component({
    selector: 'app-consumer-buzz-section',
    standalone: true,
    imports: [LucideAngularModule],
    template: `
        <div class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            @if (section().title) {
                <div class="px-2 md:px-6 pt-2">
                    <div class="pb-2 border-b-2 border-primary-500">
                        <h3 class="text-lg font-bold text-gray-800">{{ section().title }}</h3>
                    </div>
                </div>
            }
            <div class="px-2 py-2 md:px-6 md:py-5 space-y-5">
                @if (sentimentItems().length) {
                    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 1.5rem 1rem;">
                        @for (item of sentimentItems(); track $index) {
                            <div class="flex flex-col items-center gap-1.5">
                                <!-- Semi-circle dial -->
                                <div class="relative w-full max-w-[90px] mx-auto">
                                    <svg [attr.viewBox]="viewBox" width="100%" style="overflow:visible">
                                        <!-- Track -->
                                        <path [attr.d]="arcPath"
                                              fill="none" stroke="#f3f4f6"
                                              stroke-width="5" stroke-linecap="round" />
                                        <!-- Progress arc -->
                                        <path [attr.d]="arcPath"
                                              fill="none"
                                              [attr.stroke]="dialColor(item.signal)"
                                              stroke-width="5" stroke-linecap="round"
                                              [attr.stroke-dasharray]="arcLength"
                                              [attr.stroke-dashoffset]="arcOffset(item)" />
                                        <!-- Rating centred inside the arch, wrapped onto multiple lines if it's a phrase -->
                                        <text [attr.x]="cx" text-anchor="middle">
                                            @for (line of ratingLines(item.rating); track $index; let li = $index) {
                                                <tspan [attr.x]="cx"
                                                       [attr.y]="ratingLineY(item.rating, li)"
                                                       [attr.font-size]="ratingFontSize(item.rating)" font-weight="700"
                                                       [attr.fill]="dialColor(item.signal)">{{ line }}</tspan>
                                            }
                                        </text>
                                    </svg>
                                </div>
                                <!-- Source + theme -->
                                <div class="flex items-center gap-1">
                                    @if (iconData(item.icon); as img) {
                                        <lucide-icon [img]="img" [size]="13" class="shrink-0 text-gray-500" />
                                    }
                                    <p class="text-xs font-semibold text-gray-700">{{ item.source }}</p>
                                </div>
                                @if (item.theme) {
                                    <p class="text-xs leading-tight text-gray-500 text-center">{{ item.theme }}</p>
                                }
                            </div>
                        }
                    </div>
                }

                @if (section().related_searches?.length) {
                    <div>
                        <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Related searches</p>
                        <div class="flex flex-wrap gap-1.5">
                            @for (term of section().related_searches; track term) {
                                <span class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                                    {{ term }}
                                </span>
                            }
                        </div>
                    </div>
                }
            </div>
        </div>
    `,
})
export class ConsumerBuzzSectionComponent {
    section = input.required<ConsumerBuzzSection>();

    protected readonly sentimentItems = computed(() => {
        const s = this.section().sentiment;
        return Array.isArray(s) ? s : [];
    });

    readonly arcPath = ARC_PATH;
    readonly arcLength = ARC_LENGTH;
    readonly viewBox = `0 0 100 ${CY}`;
    readonly cx = CX;
    readonly ratingY = CY - 12;

    iconData(name: string | undefined): LucideIconData | null {
        if (!name) return null;
        return CONSUMER_BUZZ_ICONS[name] ?? null;
    }

    // Word/phrase ratings ("Somewhat-Bearish") wrap onto one line per word so the font
    // only needs to shrink to fit the longest single word, not the whole phrase.
    ratingLines(rating: string): string[] {
        if (!isNaN(parseFloat(rating))) return [rating ?? ''];
        return (rating ?? '').replace(/-/g, ' ').split(' ').filter(Boolean);
    }

    ratingFontSize(rating: string): number {
        const lines = this.ratingLines(rating);
        const maxLen = Math.max(...lines.map(l => l.length), 1);
        let base: number;
        if (maxLen <= 4) base = 21;
        else if (maxLen <= 7) base = 17;
        else if (maxLen <= 10) base = 14;
        else base = 12;
        // Wrapped (multi-line) ratings need to run a bit smaller so the top line
        // clears the arc, which curves inward as it approaches its apex.
        return lines.length > 1 ? Math.round(base * 0.8) : base;
    }

    ratingLineY(rating: string, lineIndex: number): number {
        const lines = this.ratingLines(rating);
        const fontSize = this.ratingFontSize(rating);
        const lineHeight = fontSize * (lines.length > 1 ? 1 : 1.05);
        // Nudge multi-line blocks down toward the wider part of the arc.
        const centerY = lines.length > 1 ? this.ratingY + 4 : this.ratingY;
        const startY = centerY - (lineHeight * (lines.length - 1)) / 2;
        return startY + lineHeight * lineIndex;
    }

    // Word-based ratings ("Bullish", "Somewhat-Bearish") have no numeric denominator to
    // compute a fill percentage from, so map known phrases onto a fixed 0-100 scale.
    private readonly wordRatingScale: [RegExp, number][] = [
        [/^(very|strongly) bullish$/, 95],
        [/^(somewhat|slightly) bullish$/, 70],
        [/^bullish$/, 88],
        [/^(neutral|mixed)$/, 50],
        [/^(somewhat|slightly) bearish$/, 30],
        [/^(very|strongly) bearish$/, 5],
        [/^bearish$/, 12],
    ];

    private wordRatingPct(rating: string): number | null {
        const norm = (rating ?? '').trim().toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ');
        const match = this.wordRatingScale.find(([re]) => re.test(norm));
        return match ? match[1] : null;
    }

    arcOffset(item: SentimentItem): number {
        const r = parseFloat(item.rating);
        if (!isNaN(r)) {
            if (!item.max_rating) return 0;
            const m = parseFloat(item.max_rating);
            if (isNaN(m) || m === 0) return ARC_LENGTH;
            return ARC_LENGTH * (1 - Math.min(1, Math.max(0, r / m)));
        }
        const wordPct = this.wordRatingPct(item.rating);
        if (wordPct !== null) return ARC_LENGTH * (1 - wordPct / 100);
        // Unrecognized word rating — fall back to the signal field.
        const signalPct = item.signal === 'up' ? 75 : item.signal === 'down' ? 25 : 50;
        return ARC_LENGTH * (1 - signalPct / 100);
    }

    dialColor(signal?: Signal): string {
        if (signal === 'up') return '#10b981';
        if (signal === 'down') return '#dc2626';
        return '#9ca3af';
    }
}
