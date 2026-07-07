// #UiKit — theme tokens (generated from marketing/tokens.json), brand
// constants, and the toast auto-fade duration model.
import tokens from '../../../marketing/tokens.json';

export const brand = tokens.brand;

export const typography = tokens.typography;
export const space = tokens.space;

export type Theme = Record<string, string>;
export const lightTheme: Theme = tokens.themes.light as Theme;
export const darkTheme: Theme = tokens.themes.dark as Theme;

// A toast fades on its own after roughly the time it takes to read it.
export const TOAST_FLOOR_MS = 3000;
export const TOAST_CEILING_MS = 12000;
export const TYPING_MS_PER_CHAR = 80;

export function toastDurationMs(message: string): number {
  return Math.min(TOAST_CEILING_MS, Math.max(TOAST_FLOOR_MS, message.length * TYPING_MS_PER_CHAR));
}
