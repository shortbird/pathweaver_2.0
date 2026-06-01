/**
 * BugReportSheet - the in-app "Report a bug" form.
 *
 * Rendered globally by BugReportHost. Auto-attaches a diagnostics snapshot
 * (current route, recent API calls, console errors, device/build) plus an
 * optional screenshot captured when the sheet was opened by a shake.
 */

import React, { useState } from 'react';
import { View, TextInput, Image, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, VStack, HStack, Heading, UIText, Button, ButtonText } from '@/src/components/ui';
import { useBugReportStore } from '@/src/stores/bugReportStore';
import { bugReportAPI } from '@/src/services/api';
import { collectDiagnostics } from '@/src/services/diagnostics';
import { captureMessage, captureException } from '@/src/services/sentry';

export function BugReportSheet() {
  const { visible, screenshotUri, close } = useBugReportStore();
  const [message, setMessage] = useState('');
  const [steps, setSteps] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setMessage('');
    setSteps('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    close();
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert('Add a description', 'Tell us what went wrong so we can fix it.');
      return;
    }
    setSubmitting(true);

    const diagnostics = collectDiagnostics();
    // Leave a breadcrumbed Sentry event so the manual report cross-links to
    // the captured app state/breadcrumbs. No-op until Sentry is configured.
    const sentryEventId = captureMessage(`Bug report: ${trimmed.slice(0, 80)}`, {
      route: diagnostics.current_route,
    });

    const payload = {
      ...diagnostics,
      message: trimmed,
      steps: steps.trim() || undefined,
      sentry_event_id: sentryEventId ?? null,
    };
    const screenshot = screenshotUri
      ? { uri: screenshotUri, name: 'screenshot.jpg', type: 'image/jpeg' }
      : null;

    try {
      await bugReportAPI.submit(payload, screenshot);
    } catch (err) {
      // The screenshot multipart is the fragile part (large body, native file URI).
      // If we attached one and it failed, retry once WITHOUT it so the text report
      // and diagnostics still land — those are what matter most.
      if (screenshot) {
        try {
          await bugReportAPI.submit(payload, null);
        } catch (err2) {
          captureException(err2, { stage: 'bug-report-submit-retry' });
          setSubmitting(false);
          Alert.alert('Could not send', 'Something went wrong sending your report. Please try again.');
          return;
        }
      } else {
        captureException(err, { stage: 'bug-report-submit' });
        setSubmitting(false);
        Alert.alert('Could not send', 'Something went wrong sending your report. Please try again.');
        return;
      }
    }

    reset();
    close();
    Alert.alert('Thank you!', 'Your report was sent. We appreciate the help making Optio better.');
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md" className="px-5 pt-4 pb-2">
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-2">
            <Ionicons name="bug-outline" size={20} color="#6D469B" />
            <Heading size="lg">Report a bug</Heading>
          </HStack>
          {!submitting && (
            <Ionicons name="close" size={22} color="#9CA3AF" onPress={handleClose} />
          )}
        </HStack>

        <UIText size="sm" className="text-typo-500">
          What happened? We automatically attach technical details to help us fix it.
        </UIText>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Describe the problem..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!submitting}
          className="bg-surface-50 dark:bg-dark-surface-50 dark:text-dark-typo rounded-xl p-4 text-base min-h-[96px]"
          style={{ fontFamily: 'Poppins_400Regular' }}
        />

        <TextInput
          value={steps}
          onChangeText={setSteps}
          placeholder="Steps to reproduce (optional)"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          editable={!submitting}
          className="bg-surface-50 dark:bg-dark-surface-50 dark:text-dark-typo rounded-xl p-4 text-base min-h-[60px]"
          style={{ fontFamily: 'Poppins_400Regular' }}
        />

        <HStack className="items-center gap-3">
          {screenshotUri ? (
            <Image
              source={{ uri: screenshotUri }}
              style={{ width: 44, height: 44, borderRadius: 8 }}
              resizeMode="cover"
            />
          ) : (
            <View className="w-11 h-11 rounded-lg bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
              <Ionicons name="document-text-outline" size={20} color="#9CA3AF" />
            </View>
          )}
          <UIText size="xs" className="text-typo-400 flex-1">
            {screenshotUri ? 'Screenshot + diagnostics attached' : 'Diagnostics attached'}
          </UIText>
        </HStack>

        <Button size="lg" onPress={handleSubmit} loading={submitting} disabled={submitting} className="w-full">
          <ButtonText>Send report</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
