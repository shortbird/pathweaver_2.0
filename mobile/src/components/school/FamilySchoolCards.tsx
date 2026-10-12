/**
 * What the school keeps for one family, at the top of the school hub's Feed
 * tab: this family's volunteer hours, and the school's Who to contact list.
 * Guardians only; each renders nothing when there is nothing to show.
 *
 * Volunteer hours -- iCreate 2fab910a/9db5bde3: "I know you just added a
 * tracker to track hours and also comments for it... I'm not seeing it from
 * the parent side." The web drew it on the school pages only, and the phone
 * not at all.
 *
 * Who to contact -- ticket c58b7c0b (iCreate, org admin): "On parent
 * dashboards, could we create a section where there is who to contact info?
 * ... e.g. a question about something in the building message Becky; late
 * pick-up; general concern about classes message Sharmaine." The office keeps
 * the list in SIS Settings; it arrives on the school context as
 * `family_contacts` (backend services/sis_family_contacts_service.py).
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFamilyVolunteerHours } from '@/src/hooks/useFamilyVolunteerHours';
import { messagesRouteFor } from '@/src/hooks/useFriends';
import { safeOpenURL } from '@/src/utils/linking';
import type { FamilyContact } from '@/src/hooks/useSchool';

export function formatHours(hours: number | null): string {
  const value = Number(hours || 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

export function VolunteerHoursCard({ organizationId }: { organizationId?: string | null }) {
  const v = useFamilyVolunteerHours(organizationId);
  if (!v.shown) return null;
  const updated = v.updatedAt ? new Date(v.updatedAt).toLocaleDateString() : null;
  return (
    <View testID="family-volunteer-hours"
      className="bg-optio-purple/5 border border-optio-purple/20 rounded-xl px-4 py-3 mb-4">
      <View className="flex-row items-baseline gap-2 flex-wrap">
        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Volunteer hours</UIText>
        <UIText size="sm" className="font-poppins-semibold text-optio-purple">{formatHours(v.hours)}</UIText>
        {updated ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">as of {updated}</UIText>
        ) : null}
      </View>
      {v.note ? (
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1.5" testID="family-volunteer-hours-note">
          {v.note}
        </UIText>
      ) : null}
    </View>
  );
}

export const telUrl = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, '')}`;

function ActionChip({ icon, label, onPress, testID, a11y }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string; a11y: string;
}) {
  const c = useThemeColors();
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={a11y}
      hitSlop={4}
      className="flex-row items-center gap-1.5 border border-surface-200 dark:border-dark-surface-300 rounded-lg px-3 py-1.5 active:opacity-70">
      <Ionicons name={icon} size={14} color={c.brand} />
      <UIText size="xs" className="font-poppins-medium" numberOfLines={1}>{label}</UIText>
    </Pressable>
  );
}

export function WhoToContactCard({ contacts }: { contacts?: FamilyContact[] | null }) {
  if (!contacts?.length) return null;
  return (
    <View testID="who-to-contact" className="mb-4">
      <UIText size="sm" className="font-poppins-semibold mb-2">Who to contact</UIText>
      <View className="bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl">
        {contacts.map((ct, i) => {
          const who = ct.name || ct.topic;
          return (
            <View key={`${ct.topic}-${i}`} testID="who-to-contact-row"
              className={`px-4 py-3 ${i > 0 ? 'border-t border-surface-100 dark:border-dark-surface-300' : ''}`}>
              <UIText size="sm" className="font-poppins-medium">{ct.topic}</UIText>
              {ct.name ? (
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{ct.name}</UIText>
              ) : null}
              <View className="flex-row flex-wrap gap-2 mt-2">
                {ct.phone ? (
                  <ActionChip icon="call-outline" label={ct.phone} a11y={`Call ${who}`}
                    testID={`who-to-contact-call-${i}`} onPress={() => { void safeOpenURL(telUrl(ct.phone!)); }} />
                ) : null}
                {ct.email ? (
                  <ActionChip icon="mail-outline" label={ct.email} a11y={`Email ${who}`}
                    testID={`who-to-contact-email-${i}`} onPress={() => { void safeOpenURL(`mailto:${ct.email}`); }} />
                ) : null}
                {ct.message_user_id ? (
                  <ActionChip icon="chatbubble-outline" label="Message" a11y={`Message ${who}`}
                    testID={`who-to-contact-message-${i}`}
                    onPress={() => router.push(messagesRouteFor(ct.message_user_id!) as Href)} />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
