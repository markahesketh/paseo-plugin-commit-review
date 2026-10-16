import { Text } from "react-native";
import { agentLabel, type WorkspaceAgent } from "./agents";
import type { DiffPalette } from "./palette";
import { PickerModal } from "./picker-modal";

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
    <PickerModal
      open={props.open}
      title="Send review to"
      icon="Bot"
      items={props.agents}
      selectedKey={props.selectedId}
      palette={palette}
      keyOf={(agent) => agent.id}
      labelOf={(agent) => `Send review to ${agentLabel(agent)}`}
      renderItem={(agent) => (
        <>
          <Text numberOfLines={1} style={{ flex: 1, color: palette.foreground, fontSize: 13 }}>
            {agentLabel(agent)}
          </Text>
          <Text style={{ color: palette.foregroundMuted, fontSize: 12 }}>{agent.status}</Text>
        </>
      )}
      onOpenChange={props.onOpenChange}
      onSelect={props.onSelect}
    />
  );
}
