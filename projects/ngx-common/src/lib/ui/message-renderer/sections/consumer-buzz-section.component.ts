import { Component, input } from '@angular/core';
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
import { ConsumerBuzzSection, Signal } from '../message-renderer.types';

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
                @if (section().sentiment.length) {
                    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 1.5rem 2rem;">
                        @for (item of section().sentiment; track $index) {
                            <div class="flex flex-col items-center gap-1.5">
                                <!-- Semi-circle dial -->
                                <div class="relative w-full">
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
                                              [attr.stroke-dashoffset]="arcOffset(item.rating, item.max_rating)" />
                                        <!-- Rating centred inside the arch -->
                                        <text [attr.x]="cx" text-anchor="middle">
                                            <tspan [attr.y]="ratingY"
                                                   font-size="17" font-weight="700"
                                                   [attr.fill]="dialColor(item.signal)">{{ item.rating }}</tspan>
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

    readonly arcPath = ARC_PATH;
    readonly arcLength = ARC_LENGTH;
    readonly viewBox = `0 0 100 ${CY}`;
    readonly cx = CX;
    readonly ratingY = CY - 12;

    iconData(name: string | undefined): LucideIconData | null {
        if (!name) return null;
        return CONSUMER_BUZZ_ICONS[name] ?? null;
    }

    arcOffset(rating: string, maxRating?: string): number {
        if (!maxRating) return 0;
        const r = parseFloat(rating);
        const m = parseFloat(maxRating);
        if (isNaN(r) || isNaN(m) || m === 0) return ARC_LENGTH;
        return ARC_LENGTH * (1 - Math.min(1, r / m));
    }

    dialColor(signal?: Signal): string {
        if (signal === 'up') return '#10b981';
        if (signal === 'down') return '#dc2626';
        return '#9ca3af';
    }
}
