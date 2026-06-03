/**
 * Manage Observers sheet — single consolidated surface for everything
 * observer-related: invite link, share/QR/email, existing observers (with
 * per-kid access toggles + remove), and pending invites (with revoke).
 *
 * Replaces the prior split where the Family dashboard owned the observers
 * list/remove UI and the sheet owned the invite link. Family dashboard now
 * shows just a one-line summary tile that opens this sheet.
 *
 * Backend reuse: the existing /api/observers/family-* endpoints already
 * support all five actions; this component just wires them up in one place.
 *
 * File name kept as `InviteObserverSheet.tsx` for back-compat with existing
 * imports — the export name is unchanged.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, TextInput, Alert, Share, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import api from '@/src/services/api';
import { useMyChildren } from '@/src/hooks/useParent';
import { haptic } from '@/src/utils/haptics';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText, BottomSheet, Divider, Skeleton,
  Avatar, AvatarImage, AvatarFallbackText,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface InviteObserverSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface PendingInvite {
  id: string;
  shareable_link: string;
  expires_at: string;
  children: { id: string; name: string }[];
}

interface ObserverChildAccess {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  enabled: boolean;
  link_id: string | null;
}

interface Observer {
  // 'accepted' observers have an observer_id and per-kid toggles; 'pending'
  // ones are invitations that haven't been accepted yet — keyed/removed by
  // invitation_id via the invitation-revoke endpoint.
  status: 'accepted' | 'pending';
  observer_id: string | null;
  observer_name: string | null;
  observer_email: string | null;
  avatar_url: string | null;
  children: ObserverChildAccess[];
  invitation_id?: string | null;
  expires_at?: string | null;
}

// Extract the invitation_code segment from a shareable link of the form
// `<frontend>/observer/accept/<code>`. Used to call the server-side email
// endpoint without having to round-trip the invitation id separately.
function extractInvitationCode(link: string | null): string | null {
  if (!link) return null;
  const match = link.match(/\/observer\/accept\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

export function InviteObserverSheet({ visible, onClose }: InviteObserverSheetProps) {
  const c = useThemeColors();
  const { children, loading: childrenLoading } = useMyChildren();

  // ── Family link state ──
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [shareLinkLoading, setShareLinkLoading] = useState(false);

  // ── Observers + pending invites state ──
  const [observers, setObservers] = useState<Observer[]>([]);
  const [observersLoading, setObserversLoading] = useState(false);

  // Resolve the "active family link." Picks the existing pending invite that
  // covers every kid (preferring family-wide over partial). Returns the
  // chosen invite's id so callers can revoke it before regenerating.
  const loadActiveLink = useCallback(async (): Promise<string | null> => {
    if (children.length === 0) return null;
    try {
      const { data } = await api.get('/api/observers/family-pending-invites');
      const invites: PendingInvite[] = data?.invites || [];
      const knownIds = new Set(children.map((c: any) => c.id));
      const familyWide = invites.find((inv) => {
        const ids = (inv.children || []).map((c) => c.id);
        return ids.length === knownIds.size && ids.every((id) => knownIds.has(id));
      });
      const chosen = familyWide || invites[0];
      if (chosen) {
        setLink(chosen.shareable_link);
        setExpiresAt(chosen.expires_at);
        return chosen.id;
      }
    } catch {
      // Empty list / error → caller will generate a fresh link.
    }
    return null;
  }, [children]);

  // Only show the loading skeleton on the very first fetch; later refreshes
  // (e.g. reopening the sheet) update the list in place so it doesn't flash.
  const observersLoadedOnceRef = useRef(false);
  const refreshObservers = useCallback(async () => {
    if (!observersLoadedOnceRef.current) setObserversLoading(true);
    try {
      const { data } = await api.get('/api/observers/family-observers');
      setObservers(data?.observers || []);
      observersLoadedOnceRef.current = true;
    } catch {
      setObservers([]);
    } finally {
      setObserversLoading(false);
    }
  }, []);

  // Track the active pending invite's id so "Generate a new link" can revoke
  // the prior one before creating a fresh one — keeps the "one family link"
  // mental model honest (no stale URLs piling up server-side).
  const [activeInviteId, setActiveInviteId] = useState<string | null>(null);

  const generateLink = useCallback(async () => {
    if (children.length === 0) return;
    setLoading(true);
    try {
      // Revoke the prior active invite first so the previous URL stops working
      // — otherwise we'd accumulate stale pending rows.
      if (activeInviteId) {
        try {
          await api.delete(`/api/observers/family-pending-invites/${activeInviteId}`);
        } catch {
          // Non-fatal: TTL will eventually kill it server-side.
        }
      }
      const { data } = await api.post('/api/observers/family-invite', {
        student_ids: children.map((c: any) => c.id),
      });
      const newLink = data?.shareable_link;
      if (!newLink) throw new Error('No link returned');
      setLink(newLink);
      setExpiresAt(data?.expires_at || null);
      setActiveInviteId(data?.invitation_id || null);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create invitation link';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, [children, activeInviteId]);

  // On open, run the load exactly once — after children finish loading. Without
  // the ref + childrenLoading guards this effect re-fired on every children /
  // callback identity change, and each refreshObservers() toggled the loading
  // skeleton, making the observer list flash in/out and the sheet bounce.
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      didLoadRef.current = false; // reset so the next open reloads
      return;
    }
    if (childrenLoading || didLoadRef.current) return;
    didLoadRef.current = true;

    let cancelled = false;
    (async () => {
      const [existingId] = await Promise.all([
        loadActiveLink(),
        refreshObservers(),
      ]);
      if (cancelled) return;
      setActiveInviteId(existingId);
      if (!existingId) {
        await generateLink();
      }
    })();
    return () => { cancelled = true; };
    // loadActiveLink/refreshObservers/generateLink intentionally omitted: the ref
    // guard makes this a once-per-open load, so their identity churn must not
    // re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, childrenLoading]);

  const handleClose = () => {
    setEmailInput('');
    setEmailSentTo(null);
    setQrVisible(false);
    onClose();
  };

  const shareLink = async () => {
    // In-flight guard: a double-tap must trigger exactly one share sheet.
    // Mirrors the email path's `emailSending` guard.
    if (!link || shareLinkLoading) return;
    setShareLinkLoading(true);
    try {
      const names = children.map((c: any) => c.first_name || c.display_name).filter(Boolean).join(' & ') || 'this family';
      // iOS shares `message` and `url` as separate items, so embedding the link
      // in the message AND passing `url` makes it appear twice. iOS: keep the
      // link in `url` only. Android ignores `url`, so embed it in the message.
      const intro = `Follow ${names}'s learning journey on Optio:`;
      await Share.share(
        Platform.OS === 'ios'
          ? { message: intro, url: link }
          : { message: `${intro} ${link}` }
      );
    } finally {
      setShareLinkLoading(false);
    }
  };

  const sendEmail = async () => {
    const email = emailInput.trim();
    if (!email) return;
    const code = extractInvitationCode(link);
    if (!code) {
      Alert.alert('No link yet', 'Wait for the family link to finish generating, then try again.');
      return;
    }
    setEmailSending(true);
    try {
      await api.post('/api/observers/family-invite/email', {
        email,
        invitation_code: code,
      });
      haptic.success();
      setEmailSentTo(email);
      setEmailInput('');
    } catch (err: any) {
      haptic.error();
      const msg = err?.response?.data?.error || 'We couldn’t send that invitation. Double-check the email and try again.';
      Alert.alert('Could not send invitation', msg);
    } finally {
      setEmailSending(false);
    }
  };

  const toggleObserverKid = async (observerId: string, kid: ObserverChildAccess) => {
    haptic.light();
    const nextEnabled = !kid.enabled;
    // Optimistic update
    setObservers((prev) => prev.map((obs) =>
      obs.observer_id === observerId
        ? { ...obs, children: obs.children.map((c) => c.student_id === kid.student_id ? { ...c, enabled: nextEnabled } : c) }
        : obs
    ));
    try {
      await api.post(`/api/observers/family-observers/${observerId}/toggle-child`, {
        student_id: kid.student_id,
        enabled: nextEnabled,
      });
    } catch (err: any) {
      // Revert on failure
      setObservers((prev) => prev.map((obs) =>
        obs.observer_id === observerId
          ? { ...obs, children: obs.children.map((c) => c.student_id === kid.student_id ? { ...c, enabled: !nextEnabled } : c) }
          : obs
      ));
      const msg = err?.response?.data?.error || 'Failed to update access';
      Alert.alert('Error', msg);
    }
  };

  const removeObserver = (observer: Observer) => {
    const isPending = observer.status === 'pending';
    const name = observer.observer_name || observer.observer_email || (isPending ? 'this pending invite' : 'this observer');
    Alert.alert(
      isPending ? 'Revoke invitation' : 'Remove observer',
      isPending ? `Revoke ${name}? The link will stop working.` : `Remove ${name} from all kids?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPending ? 'Revoke' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isPending) {
                // Pending invite isn't an accepted observer link — revoke it via
                // the invitation endpoint, not the accepted-observer delete.
                await api.delete(`/api/observers/family-pending-invites/${observer.invitation_id}`);
                setObservers((prev) => prev.filter((o) => o.invitation_id !== observer.invitation_id));
                // If we just revoked the active family link, refresh it so the
                // link section regenerates rather than pointing at a dead URL.
                if (observer.invitation_id === activeInviteId) {
                  setLink(null);
                  setActiveInviteId(null);
                  await generateLink();
                }
              } else {
                await api.delete(`/api/observers/family-observers/${observer.observer_id}`);
                setObservers((prev) => prev.filter((o) => o.observer_id !== observer.observer_id));
              }
            } catch {
              Alert.alert('Error', isPending ? 'Failed to revoke invitation' : 'Failed to remove observer');
            }
          },
        },
      ]
    );
  };

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : null;

  const multiKidFamily = children.length > 1;

  // The active family-link invite is already represented by the "Your family
  // link" section above. Don't also list it as a deletable pending row --
  // revoking it there just triggers a regenerate, which looks to the user like
  // "deleting it added a new pending invitation." Other pending invites (e.g. a
  // prior link) still show and are genuinely revocable.
  const visibleObservers = observers.filter(
    (o) => !(o.status === 'pending' && o.invitation_id === activeInviteId)
  );

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <VStack space="md">
        <HStack className="items-center justify-between">
          <Heading size="lg">Manage observers</Heading>
          <Pressable
            onPress={handleClose}
            className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        {/* Privacy preview */}
        <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 12, padding: 14 }}>
          <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider">
            What observers will see
          </UIText>
          <VStack space="xs" className="mt-2">
            <HStack className="items-center gap-2">
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <UIText size="xs" className="text-typo-600">Completed quests &amp; learning moments</UIText>
            </HStack>
            <HStack className="items-center gap-2">
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <UIText size="xs" className="text-typo-600">XP totals and pillar progress</UIText>
            </HStack>
            <HStack className="items-center gap-2">
              <Ionicons name="close-circle" size={14} color={c.iconMuted} />
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Personal info, private journal entries</UIText>
            </HStack>
          </VStack>
        </View>

        {/* Family link */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 font-poppins-semibold uppercase tracking-wider">
            Your family link
          </UIText>
          {loading || !link ? (
            <Skeleton className="h-12 rounded-xl" />
          ) : (
            <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 12, padding: 12 }}>
              <UIText size="xs" className="text-typo-700 dark:text-dark-typo-700" numberOfLines={2}>{link}</UIText>
              {daysLeft !== null && (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1">
                  Active for {daysLeft} more day{daysLeft === 1 ? '' : 's'}
                </UIText>
              )}
            </View>
          )}
          <HStack className="gap-2">
            <Button size="md" onPress={shareLink} loading={shareLinkLoading} disabled={!link || shareLinkLoading} className="flex-1">
              <HStack className="items-center gap-2">
                <Ionicons name="share-outline" size={16} color="#FFFFFF" />
                <ButtonText>Share</ButtonText>
              </HStack>
            </Button>
            <Button size="md" variant="outline" onPress={() => setQrVisible(true)} disabled={!link} className="flex-1">
              <HStack className="items-center gap-2">
                <Ionicons name="qr-code-outline" size={16} color="#6D469B" />
                <ButtonText>QR code</ButtonText>
              </HStack>
            </Button>
          </HStack>
          <Pressable onPress={generateLink} disabled={loading} hitSlop={6} className="self-start pt-1">
            <UIText size="xs" className="text-optio-purple font-poppins-medium">
              {loading ? 'Generating…' : 'Generate a new link'}
            </UIText>
          </Pressable>
        </VStack>

        {/* Email option */}
        <VStack space="xs">
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 font-poppins-semibold uppercase tracking-wider">
            Send via email
          </UIText>
          <HStack className="gap-2 items-center">
            <TextInput
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="email@example.com"
              placeholderTextColor={c.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-3 text-sm font-poppins text-typo dark:text-dark-typo border border-surface-200 dark:border-dark-surface-300"
            />
            <Button
              size="md"
              onPress={sendEmail}
              loading={emailSending}
              disabled={!link || !emailInput.trim() || emailSending}
            >
              <ButtonText>Send</ButtonText>
            </Button>
          </HStack>
          {emailSentTo ? (
            <UIText size="xs" className="text-emerald-700">
              Sent an Optio invitation to {emailSentTo}.
            </UIText>
          ) : (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
              We’ll send them an invitation with your family link.
            </UIText>
          )}
        </VStack>

        <Divider />

        {/* Active observers */}
        <VStack space="sm">
          <HStack className="items-center justify-between">
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 font-poppins-semibold uppercase tracking-wider">
              {multiKidFamily
                ? 'Following your family'
                : `Following ${children[0]?.first_name || children[0]?.display_name?.split(' ')[0] || 'your student'}`}
            </UIText>
            {visibleObservers.length > 0 && (
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {visibleObservers.length} observer{visibleObservers.length === 1 ? '' : 's'}
              </UIText>
            )}
          </HStack>
          {observersLoading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : visibleObservers.length === 0 ? (
            <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 12, padding: 12 }}>
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">
                {multiKidFamily
                  ? 'No one’s following yet. Share the link above with grandparents, mentors, or family friends.'
                  : `No one’s following yet. Share the link above with grandparents, mentors, or family friends so they can follow ${children[0]?.first_name || 'your student'}.`}
              </UIText>
            </View>
          ) : (
            <VStack space="sm">
              {visibleObservers.map((obs) => {
                const isPending = obs.status === 'pending';
                const name = obs.observer_name || obs.observer_email || (isPending ? 'Pending invitation' : 'Observer');
                const initials = (name?.[0] || '?').toUpperCase();
                // Covered kids' first names — shown as a subtitle for pending
                // invites in place of the (not-yet-applicable) toggle chips.
                const pendingKids = obs.children.map((k) => k.student_name?.split(' ')[0]).filter(Boolean).join(', ');
                return (
                  <View
                    key={obs.observer_id || obs.invitation_id}
                    style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12 }}
                  >
                    <HStack className="items-center gap-3">
                      <Avatar size="sm">
                        {obs.avatar_url ? <AvatarImage source={{ uri: obs.avatar_url }} /> : <AvatarFallbackText>{initials}</AvatarFallbackText>}
                      </Avatar>
                      <VStack className="flex-1 min-w-0">
                        <HStack className="items-center gap-2">
                          <UIText size="sm" className="font-poppins-semibold flex-shrink" numberOfLines={1}>{name}</UIText>
                          {isPending && (
                            <View style={{ backgroundColor: c.surfaceMuted, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                              <UIText size="xs" className="text-optio-purple font-poppins-semibold">Pending</UIText>
                            </View>
                          )}
                        </HStack>
                        {isPending ? (
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
                            {multiKidFamily && pendingKids ? `Invited to follow ${pendingKids}` : 'Waiting to be accepted'}
                          </UIText>
                        ) : (
                          obs.observer_email && obs.observer_email !== name && (
                            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{obs.observer_email}</UIText>
                          )
                        )}
                      </VStack>
                      <Pressable
                        onPress={() => removeObserver(obs)}
                        accessibilityLabel={isPending ? `Revoke invitation for ${name}` : `Remove ${name}`}
                        hitSlop={8}
                        style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="trash-outline" size={16} color={c.iconMuted} />
                      </Pressable>
                    </HStack>
                    {/* Per-kid toggle chips — accepted observers only; a pending
                        invite has no link rows to toggle yet. */}
                    {!isPending && multiKidFamily && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 10 }}>
                        {obs.children.map((kid) => (
                          <Pressable
                            key={kid.student_id}
                            onPress={() => toggleObserverKid(obs.observer_id, kid)}
                            accessibilityLabel={`${kid.enabled ? 'Disable' : 'Enable'} access to ${kid.student_name}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: kid.enabled ? '#6D469B' : c.surfaceMuted,
                              borderWidth: kid.enabled ? 0 : 1,
                              borderColor: c.border,
                            }}
                          >
                            {kid.enabled && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                            <UIText
                              size="xs"
                              style={{
                                color: kid.enabled ? '#FFFFFF' : c.textMuted,
                                fontFamily: kid.enabled ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                              }}
                            >
                              {kid.student_name?.split(' ')[0] || 'Kid'}
                            </UIText>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
            </VStack>
          )}
        </VStack>
      </VStack>

      {/* QR overlay */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onPress={() => setQrVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: c.card, borderRadius: 20, padding: 24, alignItems: 'center' }}
          >
            <Heading size="md" className="mb-1">Scan to follow</Heading>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mb-4">Have them scan with their phone camera</UIText>
            {link && (
              <QRCode value={link} size={240} color="#1F1B2D" backgroundColor="#FFFFFF" />
            )}
            <Pressable onPress={() => setQrVisible(false)} className="mt-5">
              <UIText size="sm" className="text-optio-purple font-poppins-semibold">Done</UIText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </BottomSheet>
  );
}
