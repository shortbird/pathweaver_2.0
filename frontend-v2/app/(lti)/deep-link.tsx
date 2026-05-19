/**
 * Deep Linking 2.0 teacher form.
 *
 * Reached after /lti/launch resolved an LtiDeepLinkingRequest and the
 * iframe exchanged its auth code. The teacher provides a title and an
 * optional description; we POST it to the backend, which creates a blank
 * "personalize-your-own" Optio quest and signs an LtiDeepLinkingResponse
 * JWT. We then auto-submit that JWT to Canvas's deep_link_return_url via
 * a hidden form — Canvas creates the assignment and closes the modal.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { api } from '@/src/services/api';
import { LtiShell } from '@/src/components/lti/LtiShell';
import {
  VStack, HStack, UIText, Heading, Card, Input, InputField,
  Button, ButtonText,
} from '@/src/components/ui';

type DeepLinkContext = {
  deep_link_return_url: string;
  accept_types: string[];
  context_id: string | null;
};

export default function DeepLink() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [context, setContext] = useState<DeepLinkContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Fetch deep-link context (deep_link_return_url + accept_types) from the
  // backend stash. Keyed by the same one-time code we got at launch.
  useEffect(() => {
    if (!params.code) {
      setContextError('Missing launch code.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/lti/deep-link/context', {
          params: { code: params.code },
        });
        if (!cancelled) setContext(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setContextError(
            e instanceof Error ? e.message : 'Could not load deep link context',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  async function onSubmit() {
    setSubmitError(null);
    if (!params.code) {
      setSubmitError('Missing launch code.');
      return;
    }
    if (!title.trim()) {
      setSubmitError('Give the assignment a title.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/lti/deep-link/submit', {
        code: params.code,
        title: title.trim(),
        description: description.trim(),
      });

      if (Platform.OS !== 'web') {
        // Deep linking only happens on the web iframe; native should never
        // reach this branch.
        setSubmitError('Deep linking is only supported on the web.');
        setSubmitting(false);
        return;
      }

      // Auto-submit a real HTML form so the browser navigates to Canvas's
      // deep_link_return_url with the JWT in a POST body. Canvas reads the
      // JWT, creates the assignment, and closes the modal.
      const doc = window.document;
      const form = doc.createElement('form');
      form.method = 'POST';
      form.action = data.deep_link_return_url;
      form.style.display = 'none';

      const jwtInput = doc.createElement('input');
      jwtInput.type = 'hidden';
      jwtInput.name = 'JWT';
      jwtInput.value = data.jwt;
      form.appendChild(jwtInput);

      doc.body.appendChild(form);
      formRef.current = form;
      form.submit();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to create assignment');
      setSubmitting(false);
    }
  }

  if (contextError) return <LtiShell error={contextError} />;
  if (!context) return <LtiShell loading />;

  return (
    <LtiShell>
      <Card variant="elevated" size="lg" className="w-full">
        <VStack space="lg">
          <VStack space="xs">
            <Heading size="lg">Add an Optio assignment</Heading>
            <UIText size="sm" className="text-typo-500">
              Give it a title and a short prompt. Each student will see an AI
              wizard inside Canvas that helps them invent their own approach.
            </UIText>
          </VStack>

          <VStack space="sm">
            <UIText size="sm" className="font-poppins-medium text-typo-700">
              Title
            </UIText>
            <Input>
              <InputField
                placeholder="e.g. Design a sustainable city block"
                value={title}
                onChangeText={setTitle}
              />
            </Input>
          </VStack>

          <VStack space="sm">
            <UIText size="sm" className="font-poppins-medium text-typo-700">
              Description (optional)
            </UIText>
            <Input>
              <InputField
                placeholder="What you want students to grapple with..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />
            </Input>
          </VStack>

          {submitError && (
            <UIText size="sm" className="text-error-600">
              {submitError}
            </UIText>
          )}

          <HStack className="justify-end" space="sm">
            <Button onPress={onSubmit} disabled={submitting} action="primary">
              <ButtonText>
                {submitting ? 'Creating…' : 'Add to Canvas'}
              </ButtonText>
            </Button>
          </HStack>
        </VStack>
      </Card>
    </LtiShell>
  );
}
