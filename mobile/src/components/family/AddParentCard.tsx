/**
 * "Parent or guardian" -- a platform student with no parent linked asks for
 * one. Mirrors web/src/components/family/AddParentCard.jsx; the rules live in
 * backend/services/parent_link_request_service.py.
 *
 * Until 2026-10-12 only a superadmin could link a parent to an existing
 * student account, and a parent and her 15-year-old looked for this for a day
 * (bounty report, 2026-09-09). The student names an email, the parent accepts
 * from that inbox, and Optio approves. Renders nothing for a school's student
 * (the school links families) or for an account that is not a student.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import api from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';
import { showAlert } from '@/src/utils/alerts';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, UIText, Card, Button, ButtonText } from '@/src/components/ui';

type LinkStatus = {
  state: 'available' | 'has_parent' | 'school' | 'not_student';
  parents: { id: string; name: string }[];
  request: { status: 'invited' | 'accepted'; parent_email: string } | null;
};

export function AddParentCard() {
  const c = useThemeColors();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/parent-link-requests/mine');
      setStatus(res.data?.data ?? null);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = useCallback(async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/parent-link-requests', { parent_email: email.trim() });
      setEmail('');
      await load();
    } catch (err) {
      showAlert('Could not send that', extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  }, [email, load]);

  const cancel = useCallback(async () => {
    setBusy(true);
    try {
      await api.delete('/api/parent-link-requests/mine');
      await load();
    } catch (err) {
      showAlert('Could not cancel that', extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (!status || status.state === 'school' || status.state === 'not_student') return null;
  const request = status.request;

  return (
    <Card variant="outline" size="lg" testID="add-parent-card">
      <VStack space="sm">
        <UIText size="md" className="font-poppins-semibold">Parent or guardian</UIText>

        {status.state === 'has_parent' && (
          <UIText size="sm">
            {status.parents.length
              ? `Linked to your account: ${status.parents.map((p) => p.name).join(', ')}.`
              : 'A parent manages your account.'}
          </UIText>
        )}

        {status.state === 'available' && !request && (
          <>
            <UIText size="sm">Link a parent to your account so they can see your work and help you. Enter their email address.</UIText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="parent@example.com"
              placeholderTextColor={c.iconMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Parent's email address"
              style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, color: c.text, fontFamily: 'Poppins_400Regular' }}
            />
            <Button onPress={send} disabled={busy || !email.trim()}><ButtonText>Send</ButtonText></Button>
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
              Your parent gets an email and accepts it. Then Optio checks and confirms the link, usually within a day.
            </UIText>
          </>
        )}

        {status.state === 'available' && request && (
          <>
            <UIText size="sm">
              {request.status === 'invited'
                ? `We emailed ${request.parent_email}. Ask them to open the email and click the button.`
                : `${request.parent_email} accepted. Optio will confirm the link soon.`}
            </UIText>
            <Button variant="outline" action="secondary" onPress={cancel} disabled={busy}>
              <ButtonText>Cancel and use a different email</ButtonText>
            </Button>
          </>
        )}
      </VStack>
    </Card>
  );
}
