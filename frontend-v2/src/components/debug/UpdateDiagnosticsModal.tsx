/**
 * On-demand OTA diagnostics. Opened by tapping the build/OTA line in the Profile
 * footer. Shows the live expo-updates state, the native update log
 * (readLogEntriesAsync — records every check / download / apply / rollback with a
 * reason), and a Share button so a tester can export it. Also a manual
 * "Check & download" to force the update cycle and watch it in real time.
 *
 * This is the human-driven counterpart to the passive isEmergencyLaunch reporter
 * in sentry.ts — together they answer "why didn't the OTA stick?".
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, ScrollView, Pressable, Share, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { UIText, Heading, Button, ButtonText } from '@/src/components/ui';

function constantsBlock(): string {
  const c: any = Updates;
  const lines = [
    `isEnabled:          ${c.isEnabled}`,
    `isEmbeddedLaunch:   ${c.isEmbeddedLaunch}`,
    `isEmergencyLaunch:  ${c.isEmergencyLaunch}`,
    `emergencyReason:    ${c.emergencyLaunchReason ?? '—'}`,
    `updateId:           ${c.updateId ?? '(embedded)'}`,
    `channel:            ${c.channel ?? '—'}`,
    `runtimeVersion:     ${c.runtimeVersion ?? '—'}`,
    `createdAt:          ${c.createdAt ? c.createdAt.toISOString?.() ?? String(c.createdAt) : '—'}`,
    `checkAutomatically: ${c.checkAutomatically ?? '—'}`,
  ];
  return lines.join('\n');
}

export function UpdateDiagnosticsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const updates = Updates.useUpdates();
  const [log, setLog] = useState<string>('(loading…)');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const entries = await Updates.readLogEntriesAsync(86_400_000);
      setLog(
        (entries || []).length
          ? entries.map((e: any) => `${e.timestamp}  ${e.level}/${e.code}\n  ${e.message}`).join('\n\n')
          : '(no native update log entries in the last 24h)',
      );
    } catch (e: any) {
      setLog(`readLogEntriesAsync failed: ${e?.message || e}`);
    }
  }, []);

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  const liveState = [
    `isChecking:        ${updates.isChecking}`,
    `isDownloading:     ${updates.isDownloading}`,
    `isUpdateAvailable: ${updates.isUpdateAvailable}`,
    `isUpdatePending:   ${updates.isUpdatePending}`,
    `restartCount:      ${updates.restartCount}`,
    `checkError:        ${updates.checkError?.message ?? '—'}`,
    `downloadError:     ${updates.downloadError?.message ?? '—'}`,
    `availableUpdateId: ${updates.availableUpdate?.updateId ?? '—'}`,
  ].join('\n');

  const fullText = `=== expo-updates constants ===\n${constantsBlock()}\n\n=== useUpdates() live ===\n${liveState}\n\n=== native update log (24h) ===\n${log}`;

  const checkNow = async () => {
    setBusy(true);
    try {
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) await Updates.fetchUpdateAsync();
    } catch { /* surfaced in liveState errors */ }
    await refresh();
    setBusy(false);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%', padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Heading size="md">OTA Diagnostics</Heading>
            <Pressable onPress={onClose} hitSlop={10}><UIText style={{ fontSize: 20 }}>✕</UIText></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            <UIText style={{ fontFamily: 'Courier', fontSize: 11, color: '#111' }}>{fullText}</UIText>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button size="sm" variant="outline" onPress={checkNow} disabled={busy} style={{ flex: 1 }}>
              <ButtonText>{busy ? 'Checking…' : 'Check & download'}</ButtonText>
            </Button>
            <Button size="sm" onPress={() => Share.share({ message: fullText })} style={{ flex: 1 }}>
              <ButtonText>Share log</ButtonText>
            </Button>
          </View>
          {busy ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
        </View>
      </View>
    </Modal>
  );
}
