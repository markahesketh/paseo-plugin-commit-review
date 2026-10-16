import { Icon } from "@getpaseo/plugin/client/react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { DiffFile, DiffLine } from "../shared/review";
import { isHovered, surfaceColor } from "./hover";
import {
  ADDITION_TINT_OPACITY,
  CODE_FONT_SIZE,
  CODE_LINE_HEIGHT,
  DELETION_TINT_OPACITY,
  MONO_FONT,
  type DiffPalette,
} from "./palette";
import type { LineTarget } from "./rows";

const GUTTER_PADDING = 8;
const CODE_PADDING = 8;
const DIGIT_WIDTH = CODE_FONT_SIZE * 0.62;

export function gutterWidth(files: readonly DiffFile[]): number {
  let max = 1;
  for (const file of files) {
    if (file.status !== "ok") continue;
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        max = Math.max(max, line.oldLineNumber ?? 0, line.newLineNumber ?? 0);
      }
    }
  }
  return Math.ceil(String(max).length * DIGIT_WIDTH) + GUTTER_PADDING * 2;
}

const CHANGE_LABEL: Record<DiffFile["change"], string> = {
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
};

export const FileHeader = memo(function FileHeader(props: {
  file: DiffFile;
  fileKey: string;
  collapsed: boolean;
  commentCount: number;
  palette: DiffPalette;
  onToggle(fileKey: string): void;
}) {
  const { file, palette } = props;
  const slash = file.path.lastIndexOf("/");
  const name = file.path.slice(slash + 1);
  const directory = slash > 0 ? file.path.slice(0, slash) : "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.collapsed ? "Expand" : "Collapse"} ${file.path}, ${CHANGE_LABEL[file.change]}`}
      onPress={() => props.onToggle(props.fileKey)}
      style={(state) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderBottomWidth: props.collapsed ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: surfaceColor(state, palette),
      })}
    >
      <Icon
        name={props.collapsed ? "ChevronRight" : "ChevronDown"}
        size={14}
        color={palette.foregroundMuted}
      />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: palette.foreground, fontSize: 13 }}>
        <Text style={{ fontWeight: "600" }}>{name}</Text>
        {directory ? <Text style={{ color: palette.foregroundMuted }}>{`  ${directory}`}</Text> : null}
      </Text>
      {file.oldPath ? (
        <Text numberOfLines={1} style={{ flexShrink: 2, color: palette.foregroundMuted, fontSize: 12 }}>
          {`← ${file.oldPath}`}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      {props.commentCount > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="MessageSquare" size={12} color={palette.foregroundMuted} />
          <Text style={{ color: palette.foregroundMuted, fontSize: 12 }}>{props.commentCount}</Text>
        </View>
      ) : null}
      <Text style={{ color: palette.addition, fontSize: 12, fontFamily: MONO_FONT }}>{`+${file.additions}`}</Text>
      <Text style={{ color: palette.deletion, fontSize: 12, fontFamily: MONO_FONT }}>{`-${file.deletions}`}</Text>
    </Pressable>
  );
});

export function HunkHeader({ header, palette }: { header: string; palette: DiffPalette }) {
  return (
    <View style={{ paddingHorizontal: CODE_PADDING, paddingVertical: 4, backgroundColor: palette.raised }}>
      <Text
        numberOfLines={1}
        style={{
          color: palette.foregroundMuted,
          fontFamily: MONO_FONT,
          fontSize: CODE_FONT_SIZE,
          lineHeight: CODE_LINE_HEIGHT,
        }}
      >
        {header}
      </Text>
    </View>
  );
}

function CodeText({ line, palette }: { line: DiffLine; palette: DiffPalette }) {
  if (!line.tokens) return <>{line.content}</>;
  return (
    <>
      {line.tokens.map((token, index) => (
        <Text
          key={index}
          style={token.style ? { color: palette.syntax[token.style] ?? palette.foreground } : undefined}
        >
          {token.text}
        </Text>
      ))}
    </>
  );
}

const ADD_ICON_BOX = 22;

// Same affordance as Paseo's inline review: a plus in an accent square that
// straddles the right edge of the line-number gutter.
function AddCommentIcon({ palette }: { palette: DiffPalette }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: -10,
        top: Math.floor((CODE_LINE_HEIGHT - ADD_ICON_BOX) / 2),
        width: ADD_ICON_BOX,
        height: ADD_ICON_BOX,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.accent,
        zIndex: 10,
        elevation: 10,
      }}
    >
      <Icon name="Plus" size={16} color={palette.accentForeground} />
    </View>
  );
}

function Overlay({ color, opacity }: { color: string; opacity: number }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity }]} />;
}

function lineTint(line: DiffLine, palette: DiffPalette): { color: string; opacity: number } | null {
  switch (line.type) {
    case "add":
      return { color: palette.addition, opacity: ADDITION_TINT_OPACITY };
    case "remove":
      return { color: palette.deletion, opacity: DELETION_TINT_OPACITY };
    case "context":
      return null;
  }
}

export const LineRow = memo(function LineRow(props: {
  line: DiffLine;
  target: LineTarget;
  selected: boolean;
  gutter: number;
  palette: DiffPalette;
  onPress(target: LineTarget): void;
}) {
  const { line, palette } = props;
  const tint = lineTint(line, palette);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Comment on line ${props.target.lineNumber}`}
      onPress={() => props.onPress(props.target)}
      style={{ flexDirection: "row" }}
    >
      {(state) => (
        <>
          {tint ? <Overlay {...tint} /> : null}
          {props.selected || isHovered(state) ? (
            <Overlay color={palette.accent} opacity={props.selected ? 0.16 : 0.08} />
          ) : null}
          <View
            style={{
              width: props.gutter,
              alignItems: "flex-end",
              paddingHorizontal: GUTTER_PADDING,
              overflow: "visible",
              zIndex: 1,
            }}
          >
            <Text
              style={{
                color: tint?.color ?? palette.foregroundMuted,
                fontFamily: MONO_FONT,
                fontSize: CODE_FONT_SIZE,
                lineHeight: CODE_LINE_HEIGHT,
              }}
            >
              {props.target.lineNumber}
            </Text>
            {isHovered(state) ? <AddCommentIcon palette={palette} /> : null}
          </View>
          <Text
            style={{
              flex: 1,
              paddingRight: CODE_PADDING,
              color: palette.foreground,
              fontFamily: MONO_FONT,
              fontSize: CODE_FONT_SIZE,
              lineHeight: CODE_LINE_HEIGHT,
            }}
          >
            <CodeText line={line} palette={palette} />
          </Text>
        </>
      )}
    </Pressable>
  );
});
