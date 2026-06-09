/** `routerLink` target: path string or URL segments. */
export type TwangNavTabLink = string | readonly unknown[];

export interface TwangNavTabItem {
  label: string;
  /** Material Symbols ligature; omit for label-only tabs. */
  icon?: string;
  link: TwangNavTabLink;
  /** `RouterLinkActive` exact match (default `false`). */
  exact?: boolean;
}

export type TwangNavTabsVariant = 'pill' | 'segment' | 'underline';
export type TwangNavTabsSize = 'xs' | 'sm' | 'md' | 'lg';
export type TwangNavTabsAlign = 'start' | 'center' | 'end';
