import { FlatList, Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";
import { agentLabel, type WorkspaceAgent } from "./agents";
import { isHovered } from "./hover";
import type { DiffPalette } from "./palette";

export function AgentPicker(props: {
  open: boolean;
  agents: readonly WorkspaceAgent[];
  selectedId: string | null;
  palette: DiffPalette;
  onOpenChange(open: boolean): void;
  onSelect(agentId: string): void;
}) {
  const { palette } = props;
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} title="Send review to">
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: palette.surface }}
        contentContainerStyle={{ padding: 0, gap: 0 }}
      >
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={props.agents as WorkspaceAgent[]}
          keyExtractor={(agent: WorkspaceAgent) => agent.id}
          renderItem={({ item }: { item: WorkspaceAgent }) => {
            const selected = item.id === props.selectedId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Send review to ${agentLabel(item)}`}
                onPress={() => {
                  props.onSelect(item.id);
                  props.onOpenChange(false);
                }}
                style={(state) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: isHovered(state) || selected ? palette.raised : palette.surface,
                })}
              >
                <Icon
                  name={selected ? "Check" : "Bot"}
                  size={16}
                  color={selected ? palette.accent : palette.foregroundMuted}
                />
                <Text numberOfLines={1} style={{ flex: 1, color: palette.foreground, fontSize: 13 }}>
                  {agentLabel(item)}
                </Text>
                <Text style={{ color: palette.foregroundMuted, fontSize: 12 }}>{item.status}</Text>
              </Pressable>
            );
          }}
        />
      </Modal.Content>
    </Modal>
  );
}
