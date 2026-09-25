export type { LucideIcon as IconComponent } from '@lucide/svelte';
export type { GaugeTone as Tone } from '../core/gauge';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
export type ButtonSize = 'md' | 'lg';

export interface Option<T = string> {
  value: T;
  label: string;
}
