/**
 * The feedback thread on a task: a teacher's notes and the student's replies.
 *
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it. A banner or pop-up
 * attached to the quest itself would make sure they see it." Until then the
 * app had no thread at all -- only the web showed it, inside a completed
 * task. This is a minimal port of web/src/components/credit/
 * CreditFeedbackThread.jsx: the same two endpoints, the same reply box.
 *
 * `markRead` is set only for the student who owns the work while a note is
 * unread (`task.unread_feedback` from GET /api/quests/<id>). Once the thread
 * has loaded it POSTs /messages/read, which clears the quest banner and the
 * bell together, then calls `onRead` so the screen can refetch.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, ActivityIndicator } from 'react-native';
import api from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import { VStack, HStack, UIText, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export interface FeedbackMessage {
  id: string;
  author_name: string;
  body: string;
  is_mine: boolean;
  created_at?: string;
}

export function TaskFeedbackThread({ completionId, markRead = false, onRead }: {
  completionId: string;
  markRead?: boolean;
  onRead?: (completionId: string) => void;
}) {
  const c = useThemeColors();
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/credit/${completionId}/messages`);
      if (data?.success) setMessages(data.messages || []);
    } catch {
      // Silent: the thread is supplementary, as on the web.
    } finally {
      setLoading(false);
    }
  }, [completionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!markRead || loading) return;
    api.post(`/api/credit/${completionId}/messages/read`, {})
      .then(() => onRead?.(completionId))
      .catch(() => {});
    // onRead is a fresh closure each render; marking read once per load is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markRead, loading, completionId]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setSendError(null);
    try {
      const { data } = await api.post(`/api/credit/${completionId}/messages`, { body: text });
      if (data?.success) {
        setBody('');
        await load();
      } else {
        setSendError(data?.error || 'Your reply was not sent. Try again.');
      }
    } catch (err) {
      setSendError(extractApiError(err, 'Your reply was not sent. Try again.').message);
    } finally {
      setSending(false);
    }
  };

  return (
    <VStack testID="task-feedback-thread" space="sm" className="pt-3 border-t border-surface-200 dark:border-dark-surface-300">
      <UIText size="sm" className="font-poppins-semibold text-typo dark:text-dark-typo">
        Feedback conversation
      </UIText>
      {loading ? (
        <ActivityIndicator size="small" color={c.brand} />
      ) : messages.length === 0 ? (
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
          No messages yet. Ask a question or leave a note.
        </UIText>
      ) : (
        <VStack space="xs">
          {messages.map((m) => (
            <View key={m.id} className={`flex-row ${m.is_mine ? 'justify-end' : 'justify-start'}`}>
              <View
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  m.is_mine ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'
                }`}
              >
                <UIText size="xs" className={m.is_mine ? 'text-white/70' : 'text-typo-500 dark:text-dark-typo-500'}>
                  {m.author_name}
                </UIText>
                <UIText size="sm" className={m.is_mine ? 'text-white' : 'text-typo dark:text-dark-typo'}>
                  {m.body}
                </UIText>
              </View>
            </View>
          ))}
        </VStack>
      )}
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Write a reply"
        placeholderTextColor={c.textFaint}
        multiline
        accessibilityLabel="Write a reply"
        className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-3 text-base font-poppins text-typo dark:text-dark-typo min-h-[64px]"
      />
      {sendError && (
        <UIText size="xs" className="text-red-600">{sendError}</UIText>
      )}
      <HStack className="justify-end">
        <Button size="sm" onPress={send} loading={sending} disabled={sending || !body.trim()}>
          <ButtonText>Send</ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
}
