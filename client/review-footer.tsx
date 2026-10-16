import { usePaseo } from "@getpaseo/plugin/client";
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { buildReviewAttachments } from "../shared/attachment";
import type { ReviewComment } from "../shared/review";
import { AgentPicker } from "./agent-picker";
import { agentLabel, useWorkspaceAgents } from "./agents";
import { countComments } from "./comments";
import { SmallButton } from "./controls";
import { surfaceColor } from "./hover";
import type { DiffPalette } from "./palette";
import { errorText } from "./queries";
import { preferAgent, usePreferredAgent } from "./target-agent";

export function ReviewFooter(props: {
  workspaceId: string;
  cwd: string;
  sendable: readonly ReviewComment[];
  stale: readonly ReviewComment[];
  palette: DiffPalette;
  padding: number;
  onRemove(ids: string[]): Promise<unknown>;
}) {
  const { workspaceId, palette, sendable, stale } = props;
  const paseo = usePaseo();
  const toast = useToast();
  const agents = useWorkspaceAgents(workspaceId);
  const preferredAgentId = usePreferredAgent(workspaceId);
  const agentList = agents.data ?? [];
  const targetAgent = agentList.find((agent) => agent.id === preferredAgentId) ?? agentList[0] ?? null;
  const [message, setMessage] = useState("");
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  const send = useMutation({
    mutationFn: async () => {
      // Steer like the composer does: the daemon adds the review to a running
      // turn when the provider can, and otherwise starts a new turn.
      if (!targetAgent) throw new Error("No agent in this workspace");
      await paseo.agents.ref(targetAgent.id).send(message.trim(), {
        attachments: buildReviewAttachments({ cwd: props.cwd, comments: sendable }),
        activeTurnBehavior: "steer",
      });
      await props.onRemove(sendable.map((comment) => comment.id));
    },
    onSuccess: () => {
      setMessage("");
      toast.show("Review sent", { variant: "success" });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  if (sendable.length === 0 && stale.length === 0) return null;
  return (
    <View
      style={{
        gap: 8,
        padding: props.padding,
        borderTopWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    >
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Add a message (optional)"
        placeholderTextColor={palette.foregroundMuted}
        accessibilityLabel="Review message"
        style={{
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.raised,
          color: palette.foreground,
          fontSize: 13,
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: palette.foregroundMuted, fontSize: 12 }}>
          {countComments(sendable.length)}
          {stale.length > 0 ? ` · ${stale.length} on commits no longer in history` : ""}
        </Text>
        {stale.length > 0 ? (
          <SmallButton
            label="Discard"
            variant="secondary"
            palette={palette}
            onPress={() => void props.onRemove(stale.map((comment) => comment.id))}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select the agent to send the review to"
          onPress={() => {
            void agents.refetch();
            setAgentPickerOpen(true);
          }}
          style={(state) => ({
            flexShrink: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: surfaceColor(state, palette),
          })}
        >
          <Icon name="Bot" size={14} color={palette.foregroundMuted} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.foreground, fontSize: 13 }}>
            {targetAgent ? agentLabel(targetAgent) : "No agent"}
          </Text>
          <Icon name="ChevronDown" size={14} color={palette.foregroundMuted} />
        </Pressable>
        <SmallButton
          label={send.isPending ? "Sending…" : "Send"}
          variant="primary"
          disabled={send.isPending || sendable.length === 0 || targetAgent === null}
          palette={palette}
          onPress={() => send.mutate()}
        />
      </View>
      <AgentPicker
        open={agentPickerOpen}
        agents={agentList}
        selectedId={targetAgent?.id ?? null}
        palette={palette}
        onOpenChange={setAgentPickerOpen}
        onSelect={(agentId) => preferAgent(workspaceId, agentId)}
      />
    </View>
  );
}
