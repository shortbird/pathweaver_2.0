/**
 * LtiEvidenceEditor — multi-format evidence capture for one task inside the
 * Canvas iframe.
 *
 * Before this, the LTI quest flow could only submit a single text block.
 * Optio supports text / link / image / video / file everywhere else; this
 * brings the LTI student flow to parity. The backend
 * POST /api/evidence/documents/<task_id> already accepts an arbitrary
 * blocks[] array — this is purely the missing frontend.
 *
 * Upload path reuses the proven CaptureSheet pattern: media/files go
 * direct-to-Supabase via uploadViaSignedUrl (task upload-init/finalize),
 * never through the backend. Text/link are inline blocks (no upload).
 *
 * File picking: expo-image-picker covers image+video on web AND native.
 * Generic files use a web file input (the Canvas iframe is web; the Canvas
 * mobile app also embeds web). Native-only document picking is out of scope
 * (expo-document-picker isn't a dependency) and the File button is hidden
 * off-web.
 */

import { useState } from 'react';
import { Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import {
  VStack, HStack, UIText, Card, Button, ButtonText, Input, InputField, Badge, BadgeText,
} from '@/src/components/ui';

export interface EvidenceBlockDraft {
  type: 'text' | 'link' | 'image' | 'video' | 'document';
  content: Record<string, unknown>;
  file_url?: string;
  file_name?: string;
}

const SOFT_VIDEO_WARN_BYTES = 100 * 1024 * 1024; // 100MB — warn, don't block

function pickWebFile(): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    document.body.appendChild(input);
    input.click();
    // Cleanup shortly after; the change event has already fired by then.
    setTimeout(() => input.remove(), 1000);
  });
}

export function LtiEvidenceEditor({
  taskId,
  onComplete,
}: {
  taskId: string;
  onComplete: (blocks: EvidenceBlockDraft[]) => Promise<void>;
}) {
  const [blocks, setBlocks] = useState<EvidenceBlockDraft[]>([]);
  const [textDraft, setTextDraft] = useState('');
  const [linkDraft, setLinkDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initPath = `/api/evidence/documents/${taskId}/upload-init`;
  const finalizePath = `/api/evidence/documents/${taskId}/upload-finalize`;

  const add = (b: EvidenceBlockDraft) => setBlocks((prev) => [...prev, b]);
  const removeAt = (i: number) =>
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));

  const addText = () => {
    const t = textDraft.trim();
    if (!t) return;
    add({ type: 'text', content: { text: t } });
    setTextDraft('');
  };

  const addLink = () => {
    const u = linkDraft.trim();
    if (!u) return;
    add({ type: 'link', content: { url: u } });
    setLinkDraft('');
  };

  const addMedia = async () => {
    setErr(null);
    setNotice(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const isVideo = asset.type === 'video';
      if (isVideo && (asset.fileSize ?? 0) > SOFT_VIDEO_WARN_BYTES) {
        setNotice(
          'Large video — this may upload slowly on a school network. Keeping it under ~100MB is smoother.',
        );
      }
      const filename =
        asset.fileName || asset.uri.split('/').pop() || (isVideo ? 'video.mp4' : 'image.jpg');
      const mime = isVideo ? 'video/mp4' : 'image/jpeg';
      setBusy(isVideo ? 'video' : 'image');
      const result = await uploadViaSignedUrl({
        file: { uri: asset.uri, name: filename, type: mime, size: asset.fileSize ?? 0 },
        initPath,
        finalizePath,
        blockType: isVideo ? 'video' : 'image',
      });
      add({
        type: isVideo ? 'video' : 'image',
        content: {},
        file_url: (result.file_url || result.url) as string,
        file_name: (result.file_name || result.filename || filename) as string,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const addFile = async () => {
    setErr(null);
    try {
      const file = await pickWebFile();
      if (!file) return;
      setBusy('file');
      const result = await uploadViaSignedUrl({
        file,
        initPath,
        finalizePath,
        blockType: 'document',
      });
      add({
        type: 'document',
        content: {},
        file_url: (result.file_url || result.url) as string,
        file_name: (result.file_name || result.filename || file.name) as string,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <VStack space="sm" testID="lti-evidence-editor">
      {blocks.length > 0 && (
        <VStack space="xs">
          {blocks.map((b, i) => (
            <HStack
              key={i}
              className="items-center justify-between rounded-md bg-background-50 px-3 py-2"
            >
              <HStack space="xs" className="items-center flex-1">
                <Badge>
                  <BadgeText>{b.type}</BadgeText>
                </Badge>
                {b.type === 'image' && b.file_url ? (
                  <Image
                    source={{ uri: b.file_url }}
                    style={{ width: 32, height: 32, borderRadius: 4 }}
                  />
                ) : (
                  <UIText size="xs" className="text-typo-600 flex-1" numberOfLines={1}>
                    {b.type === 'text'
                      ? String(b.content.text)
                      : b.type === 'link'
                        ? String(b.content.url)
                        : b.file_name || 'attached'}
                  </UIText>
                )}
              </HStack>
              <Button size="xs" variant="link" onPress={() => removeAt(i)}>
                <ButtonText>Remove</ButtonText>
              </Button>
            </HStack>
          ))}
        </VStack>
      )}

      <Input>
        <InputField
          placeholder="Write what you did, learned, or made"
          value={textDraft}
          onChangeText={setTextDraft}
          multiline
          numberOfLines={2}
          testID="lti-evidence-text"
        />
      </Input>
      <HStack space="xs">
        <Button size="xs" variant="outline" onPress={addText} disabled={!textDraft.trim()}>
          <ButtonText>Add text</ButtonText>
        </Button>
        <Button
          size="xs"
          variant="outline"
          onPress={addMedia}
          disabled={busy !== null}
        >
          <ButtonText>{busy === 'image' || busy === 'video' ? 'Uploading…' : 'Add photo/video'}</ButtonText>
        </Button>
        {Platform.OS === 'web' && (
          <Button size="xs" variant="outline" onPress={addFile} disabled={busy !== null}>
            <ButtonText>{busy === 'file' ? 'Uploading…' : 'Add file'}</ButtonText>
          </Button>
        )}
      </HStack>

      <Input>
        <InputField
          placeholder="…or paste a link (https://)"
          value={linkDraft}
          onChangeText={setLinkDraft}
          testID="lti-evidence-link"
        />
      </Input>
      <HStack className="justify-between items-center">
        <Button size="xs" variant="outline" onPress={addLink} disabled={!linkDraft.trim()}>
          <ButtonText>Add link</ButtonText>
        </Button>
        <Button
          action="primary"
          disabled={submitting || blocks.length === 0}
          onPress={async () => {
            setErr(null);
            setSubmitting(true);
            try {
              await onComplete(blocks);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Could not submit evidence');
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <ButtonText>
            {submitting ? 'Submitting…' : `Mark complete (${blocks.length})`}
          </ButtonText>
        </Button>
      </HStack>

      {notice && <UIText size="xs" className="text-warning-600">{notice}</UIText>}
      {err && <UIText size="xs" className="text-error-600">{err}</UIText>}
    </VStack>
  );
}

export default LtiEvidenceEditor;
