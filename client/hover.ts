import type { PressableStateCallbackType } from "react-native";
import type { DiffPalette } from "./palette";

// React Native Web adds `hovered` to Pressable state; native platforms omit it.
export function isHovered(state: PressableStateCallbackType): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}

export function surfaceColor(state: PressableStateCallbackType, palette: DiffPalette, raised = false): string {
  return raised || isHovered(state) ? palette.raised : palette.surface;
}
