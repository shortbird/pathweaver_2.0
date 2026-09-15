/**
 * Add a friend -- the vetted pools, and nothing else.
 *
 * There is no search box. A student is reached one of four ways, each of
 * which the platform can vouch for: a classmate (you share an ACTIVE class,
 * and you already see their name in the class chat), a code the other
 * student shows you in person (as a QR to scan, or eight letters to type),
 * or an invite link that carries the same code. A student whose family has
 * not turned Friends on is not in the classmates list and cannot be reached
 * by code either -- the server answers "not valid" exactly as it would for
 * a code that never existed.
 *
 * Arrives with `?code=` from an invite link (deepLinkRouter maps
 * /f/<CODE> here) and pre-fills the code field.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, TextInput, Share, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFriendSuggestions, issueCode, requestFriend, inviteLinkFor, type Suggestion } from '@/src/hooks/useFriends';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { haptic } from '@/src/utils/haptics';

const DESKTOP_BREAKPOINT = 768;
type Segment = 'classmates' | 'code' | 'scan';

const STATE_LABEL: Record<Suggestion['state'], string | null> = {
  none: null,
  outgoing: 'Request sent',
  incoming: 'Wants to be your friend',
  awaiting_approval: 'Waiting on a grown-up',
  active: 'Friends',
};

/** The code inside an invite link, or the raw code if that is what was scanned. */
export function codeFromScan(value: string): string | null {
  const v = (value || '').trim();
  const m = v.match(/\/f\/([A-Z2-9]{8})\b/i);
  if (m) return m[1].toUpperCase();
  if (/^[A-Z2-9]{8}$/i.test(v)) return v.toUpperCase();
  return null;
}

function SuggestionRow({ s, onAsk, busy }: { s: Suggestion; onAsk: (s: Suggestion) => void; busy: boolean }) {
  const initial = (s.peer.display_name?.[0] || '?').toUpperCase();
  const label = STATE_LABEL[s.state];
  return (
    <Card variant="outline" size="sm">
      <HStack className="items-center gap-3">
        <Avatar size="md">
          {s.peer.avatar_url ? <AvatarImage source={{ uri: s.peer.avatar_url }} /> : <AvatarFallbackText>{initial}</AvatarFallbackText>}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>{s.peer.display_name}</UIText>
          {s.class_names.length > 0 && (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{s.class_names.join(' · ')}</UIText>
          )}
        </VStack>
        {label ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{label}</UIText>
        ) : (
          <Button size="sm" onPress={() => onAsk(s)} disabled={busy}><ButtonText>Ask</ButtonText></Button>
        )}
      </HStack>
    </Card>
  );
}

export default function AddFriendScreen() {
  const c = useThemeColors();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const params = useLocalSearchParams<{ code?: string }>();
  const [segment, setSegment] = useState<Segment>(params.code ? 'code' : 'classmates');
  const [code, setCode] = useState((params.code || '').toUpperCase());
  const [myCode, setMyCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const { data, loading, error, refetch } = useFriendSuggestions(null, segment === 'classmates');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => { if (params.code) setCode(String(params.code).toUpperCase()); }, [params.code]);

  const askByCode = useCallback(async (value: string, source?: 'link') => {
    setBusy(true);
    try {
      await requestFriend({ code: value, source });
      haptic.success();
      showAlert('Request sent', 'They will see it the next time they open Optio.');
      setCode('');
      router.replace('/(app)/friends' as any);
    } catch (err) {
      haptic.error();
      showAlert('Could not send that request', extractApiError(err).message);
    } finally {
      setBusy(false);
      setScanned(false);
    }
  }, []);

  const askClassmate = useCallback(async (s: Suggestion) => {
    setBusy(true);
    try {
      await requestFriend({ peerId: s.peer.id, source: s.class_names.length ? 'classmates' : 'school' });
      haptic.success();
      setAsked((prev) => new Set(prev).add(s.peer.id));
      await refetch();
    } catch (err) {
      haptic.error();
      showAlert('Could not send that request', extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  }, [refetch]);

  const getCode = useCallback(async () => {
    setBusy(true);
    try {
      setMyCode(await issueCode());
    } catch (err) {
      showAlert('Could not create a code', extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const shareLink = useCallback(async () => {
    if (!myCode) return;
    const link = inviteLinkFor(myCode.code);
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(link);
        showAlert('Link copied', 'Send it to a friend. It works for a week.');
      } else {
        await Share.share(Platform.OS === 'ios'
          ? { url: link, message: 'Be my friend on Optio' }
          : { message: `Be my friend on Optio: ${link}` });
      }
    } catch {
      // the share sheet was dismissed
    }
  }, [myCode]);

  const onScanned = useCallback(({ data: value }: { data: string }) => {
    if (scanned || busy) return;
    const found = codeFromScan(value);
    if (!found) return;
    setScanned(true);
    haptic.light();
    askByCode(found);
  }, [scanned, busy, askByCode]);

  const suggestions = useMemo(() => ({
    classmates: data.classmates.map((s) => asked.has(s.peer.id) && s.state === 'none' ? { ...s, state: 'outgoing' as const } : s),
    school: data.school.map((s) => asked.has(s.peer.id) && s.state === 'none' ? { ...s, state: 'outgoing' as const } : s),
  }), [data, asked]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <Heading size="md" className="flex-1">Add a friend</Heading>
      </HStack>

      <View className={`px-4 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="bg-surface-100 rounded-xl p-1 dark:bg-dark-surface-200">
          {([['classmates', 'Classmates'], ['code', 'Code'], ['scan', 'Scan']] as [Segment, string][]).map(([key, label]) => {
            const active = segment === key;
            return (
              <Pressable key={key} onPress={() => setSegment(key)} className={`flex-1 py-2.5 rounded-lg items-center ${active ? 'bg-white dark:bg-dark-surface-100' : ''}`} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <UIText size="sm" className={active ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>{label}</UIText>
              </Pressable>
            );
          })}
        </HStack>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
          {segment === 'classmates' && (
            loading ? (
              <View className="items-center py-10"><ActivityIndicator color={c.brand} /></View>
            ) : error ? (
              <Card variant="filled" size="lg"><UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{error}</UIText></Card>
            ) : (
              <VStack space="lg">
                <VStack space="sm">
                  <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">In your classes</UIText>
                  {suggestions.classmates.length === 0 ? (
                    <Card variant="filled" size="lg" className="items-center py-8">
                      <Ionicons name="school-outline" size={32} color={c.iconMuted} />
                      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 text-center">
                        No classmates to add right now. Use a code instead.
                      </UIText>
                    </Card>
                  ) : suggestions.classmates.map((s) => <SuggestionRow key={s.peer.id} s={s} onAsk={askClassmate} busy={busy} />)}
                </VStack>
                {suggestions.school.length > 0 && (
                  <VStack space="sm">
                    <UIText size="xs" className="font-poppins-semibold uppercase tracking-wider text-typo-500 dark:text-dark-typo-500">At your school</UIText>
                    {suggestions.school.map((s) => <SuggestionRow key={s.peer.id} s={s} onAsk={askClassmate} busy={busy} />)}
                  </VStack>
                )}
              </VStack>
            )
          )}

          {segment === 'code' && (
            <VStack space="lg">
              <Card variant="outline" size="lg">
                <VStack space="sm" className="items-center">
                  <UIText size="md" className="font-poppins-semibold">Your code</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">Show this to a friend in person, or send them the link. It works for a week.</UIText>
                  {myCode ? (
                    <>
                      <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                        <QRCode value={inviteLinkFor(myCode.code)} size={180} color="#1F1B2D" backgroundColor="#FFFFFF" />
                      </View>
                      <UIText size="lg" className="font-poppins-bold text-optio-purple tracking-widest" style={{ fontSize: 28, lineHeight: 36 }} accessibilityLabel={`Your code is ${myCode.code.split('').join(' ')}`}>{myCode.code}</UIText>
                      <HStack className="gap-2">
                        <Button size="sm" variant="outline" onPress={shareLink}><ButtonText>Share link</ButtonText></Button>
                        <Button size="sm" variant="outline" action="secondary" onPress={getCode} disabled={busy}><ButtonText>New code</ButtonText></Button>
                      </HStack>
                    </>
                  ) : (
                    <Button onPress={getCode} disabled={busy}><ButtonText>Get my code</ButtonText></Button>
                  )}
                </VStack>
              </Card>

              <Card variant="outline" size="lg">
                <VStack space="sm">
                  <UIText size="md" className="font-poppins-semibold">Enter their code</UIText>
                  <TextInput
                    value={code}
                    onChangeText={(v) => setCode(v.toUpperCase())}
                    placeholder="ABCD2345"
                    placeholderTextColor={c.iconMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                    accessibilityLabel="Enter their code"
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, color: c.text, fontFamily: 'Poppins_600SemiBold', fontSize: 20, letterSpacing: 4, textAlign: 'center' }}
                  />
                  <Button onPress={() => askByCode(code, params.code ? 'link' : undefined)} disabled={busy || code.trim().length !== 8}>
                    <ButtonText>Send request</ButtonText>
                  </Button>
                </VStack>
              </Card>
            </VStack>
          )}

          {segment === 'scan' && (
            Platform.OS === 'web' ? (
              <Card variant="filled" size="lg"><UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Scanning works in the app. Type the code instead.</UIText></Card>
            ) : !permission?.granted ? (
              <Card variant="outline" size="lg">
                <VStack space="sm" className="items-center">
                  <Ionicons name="qr-code-outline" size={36} color={c.iconMuted} />
                  <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">Point your camera at a friend's code.</UIText>
                  <Button onPress={requestPermission}><ButtonText>Allow camera</ButtonText></Button>
                </VStack>
              </Card>
            ) : (
              <View style={{ borderRadius: 16, overflow: 'hidden', aspectRatio: 1, backgroundColor: '#000' }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanned ? undefined : onScanned}
                />
                {busy && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
