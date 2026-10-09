import type { PluginTheme } from "@getpaseo/plugin";
import { Platform } from "react-native";

// Paseo's default (GitHub) syntax palettes from @getpaseo/highlight. They are
// copied rather than imported so the client bundle does not pull in the Lezer
// grammars, which only the daemon needs.
const darkSyntax: Record<string, string> = {
  keyword: "#ff7b72",
  comment: "#8b949e",
  string: "#a5d6ff",
  number: "#79c0ff",
  literal: "#79c0ff",
  function: "#d2a8ff",
  definition: "#d2a8ff",
  class: "#ffa657",
  type: "#ff7b72",
  tag: "#7ee787",
  attribute: "#79c0ff",
  property: "#79c0ff",
  variable: "#c9d1d9",
  operator: "#79c0ff",
  punctuation: "#c9d1d9",
  regexp: "#a5d6ff",
  escape: "#79c0ff",
  meta: "#8b949e",
  heading: "#79c0ff",
  link: "#a5d6ff",
};

const lightSyntax: Record<string, string> = {
  keyword: "#cf222e",
  comment: "#6e7781",
  string: "#0a3069",
  number: "#0550ae",
  literal: "#0550ae",
  function: "#8250df",
  definition: "#8250df",
  class: "#953800",
  type: "#cf222e",
  tag: "#116329",
  attribute: "#0550ae",
  property: "#0550ae",
  variable: "#24292f",
  operator: "#0550ae",
  punctuation: "#24292f",
  regexp: "#0a3069",
  escape: "#0550ae",
  meta: "#6e7781",
  heading: "#0550ae",
  link: "#0a3069",
};

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
});

export const CODE_FONT_SIZE = 12;
export const CODE_LINE_HEIGHT = Math.round(CODE_FONT_SIZE * 1.5);

function isDark(color: string): boolean {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})/i)?.[1];
  if (!hex) return true;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

export interface DiffPalette {
  surface: string;
  raised: string;
  border: string;
  foreground: string;
  foregroundMuted: string;
  addition: string;
  deletion: string;
  accent: string;
  accentForeground: string;
  syntax: Record<string, string>;
}

// Same token mapping as Paseo's createDiffPalette. Tinted line backgrounds are
// drawn as an overlay with opacity so any theme color format works.
export function createDiffPalette(theme: PluginTheme): DiffPalette {
  return {
    surface: theme.colors.surface0,
    raised: theme.colors.surface1,
    border: theme.colors.border,
    foreground: theme.colors.foreground,
    foregroundMuted: theme.colors.foregroundMuted,
    addition: theme.colors.statusSuccess,
    deletion: theme.colors.statusDanger,
    accent: theme.colors.accent,
    accentForeground: theme.colors.accentForeground,
    syntax: isDark(theme.colors.surface0) ? darkSyntax : lightSyntax,
  };
}

export const ADDITION_TINT_OPACITY = 0.15;
export const DELETION_TINT_OPACITY = 0.1;
