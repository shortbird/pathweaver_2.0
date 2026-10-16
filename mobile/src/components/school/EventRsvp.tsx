/**
 * A family's sign-up on a school event, in the app.
 *
 * The web calendar has had RSVPs since 9cf78e9a (iCreate, 2026-08-28); the app
 * showed the event and no way to answer it. Apogee NoCo's SPARK Friday
 * Excursions (2026-10-16) made that gap the whole job: families sign up WHICH
 * children are coming, see when an excursion is full, and change their sign-up
 * from wherever they are.
 *
 * Same endpoint and same rules as web/src/components/school/EventRsvp.jsx: the
 * backend decides who may be signed up and whether there is room; "Full" turns
 * a new family away and never locks out a family that is already in. A fee is
 * an ordinary family charge on the billing page, as on the web.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { HStack, UIText } from '@/src/components/ui';
import { toast } from '@/src/stores/toastStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { rsvpStatus, spotsLeftText } from '@shared/eventRsvp';
import type { SchoolEvent } from '@/src/hooks/useSchool';

interface Child { id: string; name: string }
interface Reply { attending: boolean; party_size?: number; student_ids?: string[]; invoice_id?: string | null }

export function EventRsvp({ event, organizationId, onChange }: {
  event: SchoolEvent; organizationId?: string; onChange?: () => void;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Reply | null>(event.my_rsvp ?? null);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [spotsLeft, setSpotsLeft] = useState<number | null>(event.rsvp_spots_left ?? null);
  const [picked, setPicked] = useState<string[]>(event.my_rsvp?.attending ? event.my_rsvp.student_ids || [] : []);
  const [party, setParty] = useState(String(event.my_rsvp?.party_size || 1));
  const [busy, setBusy] = useState(false);

  const base = `/api/sis/parent/events/${event.id}/rsvp`;
  const childMode = event.rsvp_mode === 'children';

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(base, { params: { organization_id: organizationId } });
      const rsvp: Reply | null = data?.rsvp || null;
      setMine(rsvp);
      if (data?.children) setChildren(data.children);
      if (data && 'spots_left' in data) setSpotsLeft(data.spots_left);
      if (rsvp) {
        setParty(String(rsvp.party_size || 1));
        setPicked(rsvp.attending ? rsvp.student_ids || [] : []);
      }
    } catch {
      // The row still shows the state the calendar read; the form waits.
    }
  }, [base, organizationId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!event.rsvp_enabled) return null;

  const status = rsvpStatus({ ...event, my_rsvp: mine, rsvp_spots_left: spotsLeft, rsvp_full: spotsLeft === 0 });
  const closed = status?.tone === 'closed';
  const full = spotsLeft === 0 && !mine?.attending;
  const fee = event.rsvp_fee_cents || 0;

  const send = async (attending: boolean) => {
    if (attending && childMode && picked.length === 0) {
      toast.error('Pick at least one child who is coming');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(base, {
        organization_id: organizationId,
        attending,
        party_size: attending ? Number(party) || 1 : 1,
        ...(childMode ? { student_ids: attending ? picked : [] } : {}),
      });
      setMine(data?.rsvp || null);
      setOpen(false);
      onChange?.();
      toast.success(data?.invoice
        ? `Thanks. $${(fee / 100).toFixed(2)} has been added to your billing page.`
        : attending ? 'Thanks. We have you down.' : 'Thanks for letting us know.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not send that');
      if (err?.response?.data?.full) load();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <View className="mt-2" testID={`rsvp-${event.id}`}>
      <HStack className="items-center justify-between gap-2">
        {status ? (
          <UIText size="xs" testID={`rsvp-status-${event.id}`}
            className={status.tone === 'in' ? 'text-green-700 font-poppins-medium'
              : status.tone === 'full' ? 'text-amber-700 font-poppins-medium'
                : 'text-typo-500 dark:text-dark-typo-500'}>
            {status.label}
          </UIText>
        ) : <View />}
        {!closed && !full && !open && (
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button"
            testID={`rsvp-open-${event.id}`} className="active:opacity-60">
            <UIText size="xs" className="text-optio-purple font-poppins-medium">
              {mine ? 'Change' : childMode ? 'Sign up' : 'RSVP'}
            </UIText>
          </Pressable>
        )}
      </HStack>

      {open && (
        <View className="mt-2 rounded-lg border border-surface-200 dark:border-dark-surface-300 p-3">
          {childMode ? (
            <>
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mb-1">Who is coming?</UIText>
              {children === null ? (
                <UIText size="xs" className="text-typo-400">Loading…</UIText>
              ) : children.length === 0 ? (
                <UIText size="xs" className="text-typo-500">
                  We could not find your children at this school. Contact the school to sign up.
                </UIText>
              ) : children.map((child) => {
                const on = picked.includes(child.id);
                return (
                  <Pressable key={child.id} onPress={() => toggle(child.id)}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    accessibilityLabel={child.name} testID={`rsvp-child-${child.id}`}
                    className="flex-row items-center gap-2 py-1.5 active:opacity-60">
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={c.brand} />
                    <UIText size="sm">{child.name}</UIText>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <HStack className="items-center gap-2">
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">How many of you?</UIText>
              <TextInput value={party} onChangeText={setParty} keyboardType="number-pad"
                accessibilityLabel="How many people" testID="rsvp-party"
                className="w-14 rounded border border-surface-200 dark:border-dark-surface-300 px-2 py-1 text-sm text-typo dark:text-dark-typo" />
            </HStack>
          )}
          {spotsLeftText({ rsvp_spots_left: spotsLeft }) && spotsLeft !== 0 ? (
            <UIText size="xs" className="text-typo-400 mt-1">{spotsLeftText({ rsvp_spots_left: spotsLeft })}</UIText>
          ) : null}
          {fee > 0 ? (
            <UIText size="xs" className="text-typo-400 mt-1">
              ${(fee / 100).toFixed(2)} per family will be added to your billing page.
            </UIText>
          ) : null}
          <HStack className="items-center gap-4 mt-3">
            <Pressable onPress={() => send(true)} disabled={busy} accessibilityRole="button"
              testID="rsvp-yes" className="rounded-lg bg-optio-purple px-3 py-1.5 active:opacity-80">
              <UIText size="xs" className="text-white font-poppins-medium">
                {mine?.attending ? 'Update' : childMode ? 'Sign up' : 'We are coming'}
              </UIText>
            </Pressable>
            <Pressable onPress={() => send(false)} disabled={busy} accessibilityRole="button"
              testID="rsvp-no" className="active:opacity-60">
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">Cannot make it</UIText>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" className="active:opacity-60">
              <UIText size="xs" className="text-typo-400">Cancel</UIText>
            </Pressable>
          </HStack>
        </View>
      )}
    </View>
  );
}

export default EventRsvp;
