/**
 * Add/drop request — what a family can still do about a schedule once the
 * school year has started and the schedule is read-only.
 *
 * iCreate, 2026-09-01: "have an add/drop button that sends a request to say
 * what changes they want to make to that child's schedule. Then we get the task
 * in the task center and we can make changes." The web Schedule Builder grew
 * the same button; this is the mobile half, and it is the half that matters for
 * iCreate — their families live in the app, and the app has no schedule builder
 * at all, only this read-only schedule.
 *
 * Built out of the schedule rather than a blank "describe your request" box:
 * the office has to act on this, and "can she switch out of the Tuesday art
 * one" cannot be entered into the SIS without a phone call back. Picking real
 * classes produces a request naming the class, the day and the time.
 *
 * The window is the school's own add/drop period (sis_settings.add_drop_deadline,
 * judged server-side in the org's timezone). Outside it there is no button and
 * the POST is refused.
 */
import React, { useState } from 'react';
import {
  View, Modal, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Heading, Button, ButtonText, toast } from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import {
  meetingTime, dayName,
  type ScheduledClass, type ClassMeeting,
} from '@/src/hooks/useClassSchedule';

/** "Tuesday 9:00 AM – 10:30 AM" for the first meeting the class has. */
function whenText(cls: { meetings?: ClassMeeting[] }): string {
  const m = (cls.meetings || []).find((x) => x.day_of_week != null || x.specific_date);
  if (!m) return 'Schedule TBD';
  const day = m.day_of_week != null ? dayName(m.day_of_week) : m.specific_date;
  const time = meetingTime(m);
  return [day, time].filter(Boolean).join(' ');
}

/** "September 8, 2026" from "2026-09-08", parsed as a local date. */
function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

interface CatalogClass extends ScheduledClass {
  is_full?: boolean;
}

export default function AddDropRequest({
  studentId,
  studentName,
  organizationId,
  enrolled,
  deadline,
  pending = false,
  onSubmitted,
}: {
  studentId: string;
  studentName?: string;
  organizationId: string;
  enrolled: ScheduledClass[];
  deadline?: string | null;
  /** The family already has an unresolved request in for this child. */
  pending?: boolean;
  onSubmitted?: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [catalog, setCatalog] = useState<CatalogClass[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [drops, setDrops] = useState<string[]>([]);
  const [adds, setAdds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const alreadyIn = pending || sent;

  const openModal = async () => {
    setOpen(true);
    if (catalog.length) return;
    setLoadingCatalog(true);
    try {
      const { data } = await api.get('/api/sis/parent/classes',
        { params: { organization_id: organizationId } });
      setCatalog(data?.classes || []);
    } catch {
      // Dropping still works with no catalog; adding falls back to the note.
      setCatalog([]);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const close = () => {
    setOpen(false);
    setDrops([]);
    setAdds([]);
    setSearch('');
    setNote('');
  };

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const enrolledIds = new Set(enrolled.map((x) => x.id));
  const addable = catalog
    .filter((x) => !enrolledIds.has(x.id))
    .filter((x) => !search.trim()
      || (x.name || '').toLowerCase().includes(search.trim().toLowerCase()));
  const dropList = enrolled.filter((x) => drops.includes(x.id));
  const addList = catalog.filter((x) => adds.includes(x.id));
  const nothingPicked = !dropList.length && !addList.length;

  const send = async () => {
    if (nothingPicked || submitting) return;
    const lines = [
      ...dropList.map((x) => `Drop: ${x.name} (${whenText(x)})`),
      ...addList.map((x) => `Add: ${x.name} (${whenText(x)})`),
    ];
    if (note.trim()) lines.push('', note.trim());
    setSubmitting(true);
    try {
      await api.post('/api/sis/parent/forms', {
        organization_id: organizationId,
        form_type: 'schedule_change',
        title: `Add/drop — ${studentName || 'student'}`,
        body: lines.join('\n'),
        student_user_id: studentId,
      });
      toast.success('Request sent — the office will follow up');
      setSent(true);
      close();
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Could not send the request');
    } finally {
      setSubmitting(false);
    }
  };

  const PickRow = ({
    label, sub, selected, tone, onPress,
  }: {
    label: string; sub: string; selected: boolean; tone: 'drop' | 'add'; onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className={`flex-row items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
        selected
          ? tone === 'drop'
            ? 'border-optio-pink bg-optio-pink/10'
            : 'border-optio-purple bg-optio-purple/10'
          : 'border-surface-200 dark:border-dark-surface-300'
      }`}
    >
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={20}
        color={selected ? (tone === 'drop' ? c.brandPink : c.brand) : c.icon}
      />
      <View className="flex-1">
        <UIText size="sm" className="font-poppins-semibold">{label}</UIText>
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-400">{sub}</UIText>
      </View>
    </Pressable>
  );

  return (
    <View className="mt-3">
      {alreadyIn ? (
        <VStack space="xs" className="rounded-xl bg-optio-purple/10 px-3.5 py-3">
          <UIText size="sm" className="font-poppins-semibold">Your add/drop request is in</UIText>
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-400">
            The office will make the change and follow up.
          </UIText>
          <Pressable onPress={openModal} accessibilityRole="button">
            <UIText size="xs" className="text-optio-purple font-poppins-semibold mt-0.5">
              Send another request
            </UIText>
          </Pressable>
        </VStack>
      ) : (
        <VStack space="xs">
          <Button size="md" onPress={openModal} accessibilityLabel="Request an add/drop">
            <ButtonText>Request an add/drop</ButtonText>
          </Button>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">
            {deadline
              ? `The office makes the change. Add/drop closes after ${fmtDate(deadline)}.`
              : 'Tell the office what to add or drop and they will make the change.'}
          </UIText>
        </VStack>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <Pressable style={{ flex: 0.1 }} onPress={close} />
            <View
              className="bg-white dark:bg-dark-surface-100 rounded-t-2xl flex-1"
              style={{ paddingBottom: insets.bottom || 16, maxHeight: '90%' }}
            >
              <View className="items-center py-2">
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>

              <View className="px-5 pb-3 border-b border-surface-200 dark:border-dark-surface-300">
                <HStack className="items-center justify-between">
                  <VStack className="flex-1 pr-3">
                    <Heading size="md">Request an add/drop</Heading>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                      {studentName ? `${studentName.split(' ')[0]} · ` : ''}
                      The office makes the change and follows up
                      {deadline ? `. Closes after ${fmtDate(deadline)}` : ''}
                    </UIText>
                  </VStack>
                  <Pressable
                    onPress={close}
                    accessibilityLabel="Close"
                    className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
                  >
                    <Ionicons name="close" size={16} color={c.icon} />
                  </Pressable>
                </HStack>
              </View>

              <ScrollView
                className="flex-1 px-5"
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <VStack space="lg">
                  <VStack space="sm">
                    <UIText size="xs" className="uppercase font-poppins-semibold text-typo-400 dark:text-dark-typo-400">
                      Classes to drop
                    </UIText>
                    {enrolled.length === 0 ? (
                      <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
                        No classes are scheduled yet.
                      </UIText>
                    ) : enrolled.map((cls) => (
                      <PickRow
                        key={cls.id}
                        label={cls.name}
                        sub={whenText(cls)}
                        tone="drop"
                        selected={drops.includes(cls.id)}
                        onPress={() => toggle(drops, setDrops, cls.id)}
                      />
                    ))}
                  </VStack>

                  <VStack space="sm">
                    <UIText size="xs" className="uppercase font-poppins-semibold text-typo-400 dark:text-dark-typo-400">
                      Classes to add
                    </UIText>
                    {loadingCatalog ? (
                      <ActivityIndicator color={c.brand} />
                    ) : catalog.length === 0 ? (
                      <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">
                        No open classes to pick from — say what you want below and the office will
                        sort it out.
                      </UIText>
                    ) : (
                      <>
                        <TextInput
                          value={search}
                          onChangeText={setSearch}
                          placeholder="Search classes"
                          placeholderTextColor={c.icon}
                          accessibilityLabel="Search classes"
                          className="rounded-xl border border-surface-200 dark:border-dark-surface-300 px-3.5 py-2.5"
                          style={{ color: c.text }}
                        />
                        {addable.slice(0, 40).map((cls) => (
                          <PickRow
                            key={cls.id}
                            label={cls.name}
                            sub={`${whenText(cls)}${cls.is_full ? ' · Full — waitlist' : ''}`}
                            tone="add"
                            selected={adds.includes(cls.id)}
                            onPress={() => toggle(adds, setAdds, cls.id)}
                          />
                        ))}
                        {addable.length > 40 && (
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                            Showing the first 40 — search to narrow the list.
                          </UIText>
                        )}
                      </>
                    )}
                  </VStack>

                  <VStack space="sm">
                    <UIText size="xs" className="uppercase font-poppins-semibold text-typo-400 dark:text-dark-typo-400">
                      Anything else the office should know?
                    </UIText>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder="Optional — timing, a preferred teacher, why the change."
                      placeholderTextColor={c.icon}
                      accessibilityLabel="Anything else the office should know?"
                      multiline
                      numberOfLines={4}
                      className="rounded-xl border border-surface-200 dark:border-dark-surface-300 px-3.5 py-2.5"
                      style={{ color: c.text, minHeight: 88, textAlignVertical: 'top' }}
                    />
                  </VStack>
                </VStack>
              </ScrollView>

              <View className="px-5 pt-3 border-t border-surface-200 dark:border-dark-surface-300">
                <Button
                  size="lg"
                  onPress={send}
                  isDisabled={nothingPicked || submitting}
                  accessibilityLabel="Send request"
                >
                  <ButtonText>{submitting ? 'Sending…' : 'Send request'}</ButtonText>
                </Button>
                {nothingPicked && (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center mt-2">
                    Pick at least one class to add or drop.
                  </UIText>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
