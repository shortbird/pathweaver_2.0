/**
 * MessageParts - shared building blocks for the messaging overhaul, used by
 * both ChatWindow (DMs) and GroupChatWindow:
 *
 *  - ReactionPills      emoji+count pills under a bubble (tap toggles)
 *  - ReplyQuote         quoted reply_to block rendered above bubble content
 *  - MessageAttachments image thumbnails + tappable file chips inside a bubble
 *  - ComposerBanner     "Replying to…" / "Editing message" bar above the composer
 *  - PendingAttachmentChips  queued uploads shown above the composer
 *  - usePendingAttachments   photo/video picker + upload queue state
 *
 * NOTE: only photos/videos can be ATTACHED from mobile (expo-image-picker; no
 * document picker dependency) — but any attachment type can be viewed.
 */

import React, { useCallback, useState } from 'react';
import { View, Pressable, Image, Linking, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { UIText, toast } from '@/src/components/ui';
import { showAlert } from '@/src/utils/alerts';
import { describeMediaError } from '@/src/utils/mediaErrors';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { uploadMessageAttachment, type MessageAttachment } from '@/src/services/api';
import { MediaModal } from '@/src/components/feed/MediaModal';
import type { MessageReaction, MessageSentFrom, ReplyPreview } from '@/src/hooks/useMessages';

/** The only reactions the backend accepts (ALLOWED_REACTIONS). */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

/**
 * Minimum breathing room under the composer on mobile. The safe-area inset
 * covers the gesture bar when the keyboard is closed, but it collapses (or
 * shrinks) once the soft keyboard is up — leaving the input hugging the top
 * keyboard row. This floor keeps a visible gap in that state.
 */
export const COMPOSER_MIN_BOTTOM_PAD = 16;

/**
 * Gap held between the soft keyboard and the composer bar on Android, added
 * outside the bar (see useKeyboardPadding). The padding inside the bar can end
 * up beneath the IME, so this is what actually guarantees the buffer.
 */
export const COMPOSER_KEYBOARD_GAP = 12;

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_MB = 25;

export function formatBytes(size?: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Reactions row (under the bubble) ──────────────────────────────────────────

export function ReactionPills({
  reactions,
  isMine,
  onToggle,
}: {
  reactions?: MessageReaction[];
  /** Aligns the row with the bubble (right for own messages). */
  isMine: boolean;
  onToggle: (emoji: string) => void;
}) {
  const c = useThemeColors();
  if (!reactions || reactions.length === 0) return null;
  return (
    <View
      className={`flex-row flex-wrap ${isMine ? 'justify-end' : 'justify-start'}`}
      style={{ gap: 4, marginTop: 3 }}
    >
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggle(r.emoji)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} ${r.count}${r.reacted ? ', you reacted' : ''}`}
          className="flex-row items-center"
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 12,
            backgroundColor: r.reacted ? c.brandSurface : c.surfaceMuted,
            borderWidth: 1,
            borderColor: r.reacted ? c.brand : c.border,
            gap: 3,
          }}
        >
          <UIText size="xs" style={{ fontSize: 13 }}>{r.emoji}</UIText>
          <UIText
            size="xs"
            style={{ fontSize: 11, color: r.reacted ? c.brand : c.textMuted }}
          >
            {r.count}
          </UIText>
        </Pressable>
      ))}
    </View>
  );
}

// ── Quoted reply block (inside the bubble, above the content) ─────────────────

/** Footer label for a message's origin, superadmin only. */
const SENT_FROM_LABELS: Record<MessageSentFrom, string> = {
  mobile: 'Mobile',
  web: 'Web',
  sis: 'SIS',
  email: 'Email',
};

/**
 * "Kate for iCreate" above the text of a school message a staff member wrote
 * with their name shown -- a teacher answering a thread the office handed them
 * with a task (iCreate, 2026-09-23, d93b24d2). The server sets `sender_label`;
 * everything else renders nothing here.
 */
export function SenderLabel({ label, isMine }: { label?: string | null; isMine: boolean }) {
  const c = useThemeColors();
  if (!label) return null;
  return (
    <UIText
      size="xs"
      style={{ color: isMine ? 'rgba(255,255,255,0.85)' : c.brand, fontWeight: '600', marginBottom: 2 }}
    >
      {label}
    </UIText>
  );
}

/**
 * How many members have read past a group message: their last_read_at is at
 * or after it. Not the reader, and not the message's sender. The group's read
 * receipt (iCreate, 2026-09-23, 9b46c748), the same rule as the web.
 */
export function seenByCount(
  members: { user_id?: string; user?: { id?: string }; id?: string; last_read_at?: string | null }[],
  msg: { sender_id: string; created_at: string },
  viewerId?: string
): number {
  const at = new Date(msg.created_at).getTime();
  return members.filter((m) => {
    const id = m.user_id || m.user?.id || m.id;
    return !!id && id !== viewerId && id !== msg.sender_id && !!m.last_read_at
      && new Date(m.last_read_at).getTime() >= at;
  }).length;
}

/** The small grey receipt line under our last message: "Seen 2:14 PM", "Seen by 3". */
export function ReceiptLine({ text }: { text?: string | null }) {
  const c = useThemeColors();
  if (!text) return null;
  return (
    <UIText size="xs" style={{ color: c.textFaint, fontSize: 11, textAlign: 'right', marginTop: 2 }}>
      {text}
    </UIText>
  );
}

/**
 * "Mobile" / "Web" in a bubble's footer: which surface the message was sent
 * from. The backend only puts `sent_from` on the row for a superadmin viewer,
 * so this renders for nobody else; the `visible` guard is belt and braces for
 * a payload that arrived some other way.
 */
export function SentFromTag({
  sentFrom,
  isMine,
  visible,
}: {
  sentFrom?: MessageSentFrom | null;
  isMine: boolean;
  visible: boolean;
}) {
  const c = useThemeColors();
  const label = sentFrom ? SENT_FROM_LABELS[sentFrom] ?? null : null;
  if (!visible || !label) return null;
  return (
    <View
      accessibilityLabel={`Sent from ${label}`}
      style={{
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 1,
        backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : c.surfaceMuted,
      }}
    >
      <UIText
        size="xs"
        className="font-poppins-semibold"
        style={{
          fontSize: 10,
          letterSpacing: 0.4,
          color: isMine ? 'rgba(255,255,255,0.85)' : c.textMuted,
        }}
      >
        {label.toUpperCase()}
      </UIText>
    </View>
  );
}

export function ReplyQuote({ replyTo, isMine }: { replyTo?: ReplyPreview | null; isMine: boolean }) {
  const c = useThemeColors();
  if (!replyTo) return null;
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: isMine ? 'rgba(255,255,255,0.5)' : c.brand,
        backgroundColor: isMine ? 'rgba(255,255,255,0.12)' : c.surfaceMuted,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        marginBottom: 6,
      }}
    >
      <UIText
        size="xs"
        style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.85)' : c.brand }}
        className="font-poppins-semibold"
        numberOfLines={1}
      >
        {replyTo.sender_name || 'Someone'}
      </UIText>
      <UIText
        size="xs"
        style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.7)' : c.textMuted }}
        numberOfLines={2}
      >
        {replyTo.content || ''}
      </UIText>
    </View>
  );
}

// ── Attachments (inside the bubble) ───────────────────────────────────────────

const FILE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  video: 'videocam',
  audio: 'musical-notes',
  file: 'document-text',
};

export function MessageAttachments({
  attachments,
  isMine,
}: {
  attachments?: MessageAttachment[];
  isMine: boolean;
}) {
  const c = useThemeColors();
  // Photos and videos open in the app's full-screen viewer (pinch-to-zoom, tap
  // to dismiss). Handing them to Linking instead sent the OS to the browser,
  // where the only offer was a download — "I would really like to be able to
  // click on pictures sent from teachers and see them better without having to
  // download them" (bug report 2026-08-31).
  const [preview, setPreview] = useState<{ type: 'image' | 'video'; uri: string; name?: string } | null>(null);

  if (!attachments || attachments.length === 0) return null;

  // A row read from the server carries a signed `url`. The sender's own
  // optimistic bubble carries what the upload returned: `url` is the
  // private-bucket pointer (what gets stored) and `display_url` the signed
  // twin. Rendering the pointer showed a blank image box until the saved row
  // arrived -- "it appears blank for a bit right before it posts".
  const uriOf = (a: MessageAttachment) => a.display_url || a.url;

  const open = (a: MessageAttachment) => {
    if (a.type === 'image' || a.type === 'video') {
      setPreview({ type: a.type, uri: uriOf(a), name: a.name });
      return;
    }
    Linking.openURL(uriOf(a)).catch(() => toast.error('Could not open the attachment'));
  };

  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      {preview && (
        <MediaModal
          visible
          onClose={() => setPreview(null)}
          type={preview.type}
          uri={preview.uri}
          title={preview.name}
        />
      )}
      {attachments.map((a, i) =>
        a.type === 'image' ? (
          <Pressable
            key={`${a.url}-${i}`}
            onPress={() => open(a)}
            accessibilityRole="imagebutton"
            accessibilityLabel={a.name || 'Image attachment'}
          >
            <Image
              source={{ uri: uriOf(a) }}
              style={{ width: 200, height: 150, borderRadius: 12, backgroundColor: c.surfaceMuted }}
              resizeMode="cover"
            />
          </Pressable>
        ) : (
          <Pressable
            key={`${a.url}-${i}`}
            onPress={() => open(a)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${a.name || 'attachment'}`}
            className="flex-row items-center"
            style={{
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : c.surfaceMuted,
            }}
          >
            <Ionicons
              name={FILE_ICONS[a.type] || 'document-text'}
              size={18}
              color={isMine ? '#fff' : c.brand}
            />
            <View style={{ flexShrink: 1 }}>
              <UIText
                size="xs"
                numberOfLines={1}
                style={{ color: isMine ? '#fff' : c.text }}
                className="font-poppins-medium"
              >
                {a.name || 'Attachment'}
              </UIText>
              {a.size ? (
                <UIText size="xs" style={{ color: isMine ? 'rgba(255,255,255,0.7)' : c.textMuted }}>
                  {formatBytes(a.size)}
                </UIText>
              ) : null}
            </View>
          </Pressable>
        ),
      )}
    </View>
  );
}

// ── Composer banner (reply / edit context above the input) ────────────────────

export function ComposerBanner({
  icon,
  title,
  snippet,
  onCancel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  snippet?: string;
  onCancel: () => void;
}) {
  const c = useThemeColors();
  return (
    <View
      className="flex-row items-center border-t border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100"
      style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
    >
      <Ionicons name={icon} size={16} color={c.brand} />
      <View className="flex-1">
        <UIText size="xs" className="font-poppins-semibold" style={{ color: c.brand }} numberOfLines={1}>
          {title}
        </UIText>
        {snippet ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
            {snippet}
          </UIText>
        ) : null}
      </View>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
        <Ionicons name="close" size={18} color={c.icon} />
      </Pressable>
    </View>
  );
}

// ── Pending attachment queue (picker + uploads) ───────────────────────────────

export interface PendingAttachment {
  key: string;
  name: string;
  uploading: boolean;
  /** Set once the upload succeeds; included in the next send. */
  attachment?: MessageAttachment;
}

export function usePendingAttachments() {
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const pickAttachments = useCallback(async () => {
    // Wired straight to onPress, so a native picker throw was an unhandled
    // rejection with no feedback at all (Sentry OPTIO-MOBILE-Q).
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: MAX_ATTACHMENTS,
      });
    } catch (err) {
      const copy = describeMediaError(err, {
        title: 'Something went wrong',
        message: 'Could not open your photos. Please try again.',
      });
      if (copy) showAlert(copy.title, copy.message);
      return;
    }
    if (result.canceled || !result.assets?.length) return;

    for (const asset of result.assets) {
      if (asset.fileSize && asset.fileSize > MAX_ATTACHMENT_MB * 1024 * 1024) {
        toast.error(`Files must be under ${MAX_ATTACHMENT_MB}MB`);
        continue;
      }
      const isVideo = asset.type === 'video';
      const fallbackExt = isVideo ? 'mp4' : 'jpg';
      const uriName = asset.uri.split('/').pop() || '';
      const name = asset.fileName
        || (uriName.includes('.') ? uriName : `${isVideo ? 'video' : 'photo'}.${fallbackExt}`);
      const type = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setPending((prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
        return [...prev, { key, name, uploading: true }];
      });

      try {
        const attachment = await uploadMessageAttachment({ uri: asset.uri, name, type });
        setPending((prev) => prev.map((p) => (p.key === key ? { ...p, uploading: false, attachment } : p)));
      } catch (e: any) {
        setPending((prev) => prev.filter((p) => p.key !== key));
        toast.error(e?.response?.data?.error || 'Failed to upload the attachment');
      }
    }
  }, []);

  const removeAttachment = useCallback((key: string) => {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const clearAttachments = useCallback(() => setPending([]), []);

  const readyAttachments = pending
    .filter((p) => p.attachment)
    .map((p) => p.attachment!) as MessageAttachment[];
  const uploading = pending.some((p) => p.uploading);

  return { pending, pickAttachments, removeAttachment, clearAttachments, readyAttachments, uploading };
}

export function PendingAttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (key: string) => void;
}) {
  const c = useThemeColors();
  if (items.length === 0) return null;
  return (
    <View
      className="flex-row flex-wrap bg-white dark:bg-dark-surface-100"
      style={{ paddingHorizontal: 12, paddingTop: 8, gap: 6 }}
    >
      {items.map((p) => (
        <View
          key={p.key}
          className="flex-row items-center"
          style={{
            gap: 6,
            paddingLeft: 10,
            paddingRight: 6,
            paddingVertical: 5,
            borderRadius: 14,
            backgroundColor: c.surfaceMuted,
            borderWidth: 1,
            borderColor: c.border,
            maxWidth: 200,
          }}
        >
          {p.uploading ? (
            <ActivityIndicator size="small" color={c.brand} />
          ) : (
            <Ionicons name="attach" size={14} color={c.brand} />
          )}
          <UIText size="xs" numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.name}
          </UIText>
          <Pressable
            onPress={() => onRemove(p.key)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${p.name}`}
          >
            <Ionicons name="close-circle" size={16} color={c.iconMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
