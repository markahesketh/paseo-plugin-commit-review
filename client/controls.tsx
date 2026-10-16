import { Pressable, Text, View } from "react-native";
import { surfaceColor } from "./hover";
import type { DiffPalette } from "./palette";

export function Notice({ text, palette }: { text: string; palette: DiffPalette }) {
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ color: palette.foregroundMuted, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function SmallButton(props: {
  label: string;
  variant: "primary" | "secondary";
  disabled?: boolean;
  palette: DiffPalette;
  onPress(): void;
}) {
  const { palette } = props;
  const primary = props.variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => ({
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: primary ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: primary ? palette.accent : surfaceColor(state, palette),
        opacity: props.disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ color: primary ? palette.accentForeground : palette.foreground, fontSize: 13 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}
