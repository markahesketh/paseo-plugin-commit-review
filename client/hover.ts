import type { PressableStateCallbackType } from "react-native";

// React Native Web adds `hovered` to Pressable state; native platforms omit it.
export function isHovered(state: PressableStateCallbackType): boolean {
  return (state as { hovered?: boolean }).hovered === true;
}
