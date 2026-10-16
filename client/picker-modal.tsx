import { FlatList, Icon, Modal } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { surfaceColor } from "./hover";
import type { DiffPalette } from "./palette";

export function PickerModal<T>(props: {
  open: boolean;
  title: string;
  icon: string;
  items: readonly T[];
  selectedKey: string | null;
  palette: DiffPalette;
  keyOf(item: T): string;
  labelOf(item: T): string;
  renderItem(item: T): ReactNode;
  onOpenChange(open: boolean): void;
  onSelect(key: string): void;
}) {
  const { palette } = props;
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} title={props.title}>
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: palette.surface }}
        contentContainerStyle={{ padding: 0, gap: 0 }}
      >
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={props.items}
          keyExtractor={props.keyOf}
          renderItem={({ item }: { item: T }) => {
            const key = props.keyOf(item);
            const selected = key === props.selectedKey;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.labelOf(item)}
                onPress={() => {
                  props.onSelect(key);
                  props.onOpenChange(false);
                }}
                style={(state) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: surfaceColor(state, palette, selected),
                })}
              >
                <Icon
                  name={selected ? "Check" : props.icon}
                  size={16}
                  color={selected ? palette.accent : palette.foregroundMuted}
                />
                {props.renderItem(item)}
              </Pressable>
            );
          }}
        />
      </Modal.Content>
    </Modal>
  );
}
