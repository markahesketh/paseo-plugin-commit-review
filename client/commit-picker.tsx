import { FlatList, Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { isHovered } from "./hover";
import { Pressable, Text, View } from "react-native";
import type { CommitSummary } from "../shared/review";
import { MONO_FONT, type DiffPalette } from "./palette";

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, "y"],
    [60 * 60 * 24 * 30, "mo"],
    [60 * 60 * 24, "d"],
    [60 * 60, "h"],
    [60, "m"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
  }
  return "just now";
}

export function CommitSummaryLine(props: {
  commit: CommitSummary;
  palette: DiffPalette;
  commentCount?: number;
}) {
  const { commit, palette } = props;
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text numberOfLines={1} style={{ color: palette.foreground, fontSize: 13 }}>
        {commit.subject}
      </Text>
      <Text numberOfLines={1} style={{ color: palette.foregroundMuted, fontSize: 12 }}>
        <Text style={{ fontFamily: MONO_FONT }}>{commit.shortSha}</Text>
        {` · ${commit.authorName} · ${relativeTime(commit.authorDate)} · `}
        <Text style={{ color: palette.addition }}>{`+${commit.additions}`}</Text>
        {" "}
        <Text style={{ color: palette.deletion }}>{`-${commit.deletions}`}</Text>
        {props.commentCount ? ` · ${props.commentCount} comment${props.commentCount === 1 ? "" : "s"}` : ""}
      </Text>
    </View>
  );
}

export function CommitPicker(props: {
  open: boolean;
  commits: readonly CommitSummary[];
  selectedSha: string | null;
  commentCounts: ReadonlyMap<string, number>;
  palette: DiffPalette;
  onOpenChange(open: boolean): void;
  onSelect(sha: string): void;
}) {
  const { palette } = props;
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} title="Select commit">
      <Modal.Content
        scrollable={false}
        style={{ backgroundColor: palette.surface }}
        contentContainerStyle={{ padding: 0, gap: 0 }}
      >
        <FlatList
          style={{ flex: 1, minHeight: 0 }}
          data={props.commits as CommitSummary[]}
          keyExtractor={(commit: CommitSummary) => commit.sha}
          renderItem={({ item }: { item: CommitSummary }) => {
            const selected = item.sha === props.selectedSha;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Review commit ${item.shortSha}: ${item.subject}`}
                onPress={() => {
                  props.onSelect(item.sha);
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
                  name={selected ? "Check" : "GitCommitHorizontal"}
                  size={16}
                  color={selected ? palette.accent : palette.foregroundMuted}
                />
                <CommitSummaryLine
                  commit={item}
                  palette={palette}
                  commentCount={props.commentCounts.get(item.sha)}
                />
              </Pressable>
            );
          }}
        />
      </Modal.Content>
    </Modal>
  );
}
