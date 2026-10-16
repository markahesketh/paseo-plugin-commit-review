import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { isHovered } from "./hover";
import { memo, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import type { DiffFile, DiffLine, ReviewComment } from "../shared/review";
import type { LineTarget } from "./rows";
import {
  ADDITION_TINT_OPACITY,
  CODE_FONT_SIZE,
  CODE_LINE_HEIGHT,
  DELETION_TINT_OPACITY,
  MONO_FONT,
  type DiffPalette,
} from "./palette";

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
        backgroundColor: isHovered(state) ? palette.raised : palette.surface,
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

export function Notice({ text, palette }: { text: string; palette: DiffPalette }) {
  return (
    <View style={{ padding: 12 }}>
      <Text style={{ color: palette.foregroundMuted, fontSize: 13 }}>{text}</Text>
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

export const LineRow = memo(function LineRow(props: {
  line: DiffLine;
  target: LineTarget;
  selected: boolean;
  gutter: number;
  palette: DiffPalette;
  onPress(target: LineTarget): void;
}) {
  const { line, palette } = props;
  const lineNumber = line.type === "remove" ? line.oldLineNumber : line.newLineNumber;
  const tint = line.type === "add" ? palette.addition : line.type === "remove" ? palette.deletion : null;
  const numberColor =
    line.type === "add" ? palette.addition : line.type === "remove" ? palette.deletion : palette.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Comment on line ${lineNumber ?? ""}`}
      onPress={() => props.onPress(props.target)}
      style={{ flexDirection: "row" }}
    >
      {(state) => (
        <>
          {tint ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: tint,
                opacity: line.type === "add" ? ADDITION_TINT_OPACITY : DELETION_TINT_OPACITY,
              }}
            />
          ) : null}
          {props.selected || isHovered(state) ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: palette.accent,
                opacity: props.selected ? 0.16 : 0.08,
              }}
            />
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
                color: numberColor,
                fontFamily: MONO_FONT,
                fontSize: CODE_FONT_SIZE,
                lineHeight: CODE_LINE_HEIGHT,
              }}
            >
              {lineNumber ?? ""}
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

function SmallButton(props: {
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
        backgroundColor: primary ? palette.accent : isHovered(state) ? palette.raised : palette.surface,
        opacity: props.disabled ? 0.5 : 1,
      })}
    >
      <Text style={{ color: primary ? palette.accentForeground : palette.foreground, fontSize: 13 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export { SmallButton };

export function CommentEditor(props: {
  initialBody: string;
  submitLabel: string;
  palette: DiffPalette;
  inset: number;
  onChangeBody?(body: string): void;
  onCancel(): void;
  onSubmit(body: string): void;
}) {
  const { palette } = props;
  const [body, setBody] = useState(props.initialBody);
  const changeBody = (text: string) => {
    setBody(text);
    props.onChangeBody?.(text);
  };
  const empty = body.trim().length === 0;
  const submit = () => {
    if (!empty) props.onSubmit(body.trim());
  };
  // Enter submits and Shift+Enter adds a new line. Soft keyboards have no
  // Shift+Enter, so native platforms submit through the return key instead.
  const onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const { key, shiftKey, isComposing, keyCode } = event.nativeEvent as TextInputKeyPressEventData & {
      shiftKey?: boolean;
      isComposing?: boolean;
      keyCode?: number;
    };
    // Enter that confirms an IME composition belongs to the IME. Safari reports
    // that Enter with keyCode 229 and isComposing false.
    if (isComposing || keyCode === 229) return;
    if (key === "Escape") {
      event.preventDefault();
      props.onCancel();
    } else if (key === "Enter" && !shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <View
      style={{
        marginLeft: props.inset,
        marginRight: 12,
        marginVertical: 6,
        padding: 10,
        gap: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.raised,
      }}
    >
      <TextInput
        autoFocus
        multiline
        value={body}
        onChangeText={changeBody}
        {...(Platform.OS === "web"
          ? { onKeyPress }
          : { submitBehavior: "submit" as const, returnKeyType: "send" as const, onSubmitEditing: submit })}
        placeholder="Leave a comment"
        placeholderTextColor={palette.foregroundMuted}
        accessibilityLabel="Review comment"
        style={{
          minHeight: 64,
          padding: 8,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
          color: palette.foreground,
          fontSize: 13,
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <SmallButton label="Cancel" variant="secondary" palette={palette} onPress={props.onCancel} />
        <SmallButton
          label={props.submitLabel}
          variant="primary"
          disabled={empty}
          palette={palette}
          onPress={submit}
        />
      </View>
    </View>
  );
}

export function CommentCard(props: {
  comment: ReviewComment;
  palette: DiffPalette;
  inset: number;
  onUpdate(id: string, body: string): void;
  onRemove(id: string): void;
}) {
  const { comment, palette } = props;
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CommentEditor
        initialBody={comment.body}
        submitLabel="Save"
        palette={palette}
        inset={props.inset}
        onCancel={() => setEditing(false)}
        onSubmit={(body) => {
          props.onUpdate(comment.id, body);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <View
      style={{
        marginLeft: props.inset,
        marginRight: 12,
        marginVertical: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        gap: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.raised,
      }}
    >
      <Text selectable style={{ flex: 1, color: palette.foreground, fontSize: 13, lineHeight: 19 }}>
        {comment.body}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit comment"
        hitSlop={8}
        onPress={() => setEditing(true)}
      >
        <Icon name="Pencil" size={14} color={palette.foregroundMuted} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete comment"
        hitSlop={8}
        onPress={() => props.onRemove(comment.id)}
      >
        <Icon name="Trash2" size={14} color={palette.foregroundMuted} />
      </Pressable>
    </View>
  );
}
