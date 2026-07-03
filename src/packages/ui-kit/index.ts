// #UiKit — theme tokens (generated from marketing/tokens.json), brand
// constants, and the toast auto-fade duration model.
import tokens from '../../../marketing/tokens.json';

export const BRAND = {
  ink: tokens.brand.ink,
  accent: tokens.brand.accent,
  line: tokens.brand.line,
} as const;

export type Theme = Record<string, string>;
export const lightTheme: Theme = tokens.themes.light as Theme;
export const darkTheme: Theme = tokens.themes.dark as Theme;

// A toast fades on its own after roughly the time it takes to read it.
export const TOAST_MIN_MS = 3000;
export const TOAST_MAX_MS = 12000;
export const TOAST_MS_PER_CHAR = 80;

export function toastDuration(message: string): number {
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, message.length * TOAST_MS_PER_CHAR));
}
