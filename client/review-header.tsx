import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { CommitSummary, ReviewComment } from "../shared/review";
import { CommitPicker, CommitSummaryLine } from "./commit-picker";
import { surfaceColor } from "./hover";
import type { DiffPalette } from "./palette";

export function ReviewHeader(props: {
  commit: CommitSummary | null;
  commits: readonly CommitSummary[];
  comments: readonly ReviewComment[];
  palette: DiffPalette;
  padding: number;
  onSelect(sha: string): void;
  onRefresh(): void;
}) {
  const { commit, palette } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const commentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of props.comments) counts.set(comment.sha, (counts.get(comment.sha) ?? 0) + 1);
    return counts;
  }, [props.comments]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: props.padding,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Select commit"
        disabled={props.commits.length === 0}
        onPress={() => setPickerOpen(true)}
        style={(state) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          borderRadius: 6,
          backgroundColor: surfaceColor(state, palette),
        })}
      >
        <Icon name="GitCommitHorizontal" size={16} color={palette.foregroundMuted} />
        {commit ? (
          <CommitSummaryLine commit={commit} palette={palette} />
        ) : (
          <Text style={{ flex: 1, color: palette.foregroundMuted, fontSize: 13 }}>No commit selected</Text>
        )}
        <Icon name="ChevronsUpDown" size={14} color={palette.foregroundMuted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh commits" hitSlop={8} onPress={props.onRefresh}>
        <Icon name="RefreshCw" size={15} color={palette.foregroundMuted} />
      </Pressable>
      <CommitPicker
        open={pickerOpen}
        commits={props.commits}
        selectedSha={commit?.sha ?? null}
        commentCounts={commentCounts}
        palette={palette}
        onOpenChange={setPickerOpen}
        onSelect={props.onSelect}
      />
    </View>
  );
}
