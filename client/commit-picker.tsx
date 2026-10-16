import { Text, View } from "react-native";
import type { CommitSummary } from "../shared/review";
import { MONO_FONT, type DiffPalette } from "./palette";
import { PickerModal } from "./picker-modal";

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
    <PickerModal
      open={props.open}
      title="Select commit"
      icon="GitCommitHorizontal"
      items={props.commits}
      selectedKey={props.selectedSha}
      palette={palette}
      keyOf={(commit) => commit.sha}
      labelOf={(commit) => `Review commit ${commit.shortSha}: ${commit.subject}`}
      renderItem={(commit) => (
        <CommitSummaryLine commit={commit} palette={palette} commentCount={props.commentCounts.get(commit.sha)} />
      )}
      onOpenChange={props.onOpenChange}
      onSelect={props.onSelect}
    />
  );
}
