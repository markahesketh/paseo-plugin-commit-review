import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import type { ReviewComment } from "../shared/review";
import { SmallButton } from "./controls";
import type { DiffPalette } from "./palette";

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
