/**
 * ChildSwitcher - which child a parent is working for, as a row of avatars.
 *
 * ONE picker for the family (stores/familyStore). This was the Family tab's
 * ChildHeader; the Feed's kid pills and the child-messages list were two more
 * hand-rolled copies of the same choice, each with its own state, so a parent
 * picked Romney on Family and got Hope's feed. They all read and write the
 * store now. CaptureSheet keeps its own multi-select (a moment can be for
 * several kids at once) but pre-selects from here.
 *
 * `compact` is the header variant: the selected child's avatar only, tap to
 * expand the row. `allowAll` adds a leading "All" pill for surfaces where
 * every child at once is a legitimate view (the Feed).
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { Avatar, AvatarFallbackText, AvatarImage, UIText } from '@/src/components/ui';
import { useFamilyStore } from '@/src/stores/familyStore';
import type { Child } from '@/src/types/family';

/** Avatar initials for a child, from first/last name, else the display name. */
export function initialsFor(child: Partial<Child> | null | undefined): string {
  const fromName = `${child?.first_name?.[0] || ''}${child?.last_name?.[0] || ''}`.trim();
  if (fromName) return fromName.toUpperCase();
  const dn = (child?.display_name || '').trim();
  if (dn) {
    const parts = dn.split(/\s+/);
    return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
  }
  return '?';
}

/** Best display name for a child — never renders literal "undefined undefined". */
export function nameFor(child: Partial<Child> | null | undefined): string {
  return (
    child?.display_name?.trim() ||
    `${child?.first_name || ''} ${child?.last_name || ''}`.trim() ||
    'Student'
  );
}

export function ChildSwitcher({
  attentionByChildId,
  allowAll = false,
  compact = false,
  onSelect,
}: {
  attentionByChildId?: Record<string, boolean>;
  /** Show an "All" pill; selecting it clears the scope for this surface only
   *  via onSelect(null) and leaves the store's child untouched. */
  allowAll?: boolean;
  compact?: boolean;
  /** Called after the store is updated (or with null for "All"). */
  onSelect?: (id: string | null) => void;
}) {
  const tc = useThemeColors();
  const children = useFamilyStore((s) => s.children) as Child[];
  const selectedId = useFamilyStore((s) => s.selectedChildId);
  const setSelected = useFamilyStore((s) => s.setSelected);
  const [expanded, setExpanded] = useState(false);
  const [allActive, setAllActive] = useState(false);
  const selected = children.find((c) => c.id === selectedId);
  if (!selected) return null;
  // Single-kid families don't need the switcher (unless "All" is a choice).
  if (children.length < 2 && !allowAll) return null;

  const pick = (child: Child) => {
    setAllActive(false);
    setSelected(child.id);
    onSelect?.(child.id);
    if (compact) setExpanded(false);
  };

  if (compact && !expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={`Working with ${nameFor(selected)}. Change child`}
        style={{ alignItems: 'center' }}
      >
        <Avatar size="sm">
          {selected.avatar_url ? (
            <AvatarImage source={{ uri: selected.avatar_url }} />
          ) : (
            <AvatarFallbackText>{initialsFor(selected)}</AvatarFallbackText>
          )}
        </Avatar>
      </Pressable>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 6, gap: 14 }}
      >
        {allowAll && (
          <Pressable
            onPress={() => { setAllActive(true); onSelect?.(null); }}
            accessibilityRole="button"
            accessibilityLabel="All children"
            style={{ alignItems: 'center', width: 64 }}
          >
            <View
              style={{
                padding: 2,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: allActive ? tc.brand : 'transparent',
              }}
            >
              <Avatar size="md">
                <AvatarFallbackText>All</AvatarFallbackText>
              </Avatar>
            </View>
            <UIText
              size="xs"
              style={{
                marginTop: 4,
                color: allActive ? tc.brand : tc.text,
                fontFamily: allActive ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
              }}
            >
              All
            </UIText>
          </Pressable>
        )}
        {children.map((child) => {
          const isSelected = !allActive && child.id === selectedId;
          const needsAttention = attentionByChildId?.[child.id] === true;
          const childInitials = initialsFor(child);
          return (
            <Pressable
              key={child.id}
              onPress={() => pick(child)}
              accessibilityRole="button"
              accessibilityLabel={nameFor(child)}
              style={{ alignItems: 'center', width: 64 }}
            >
              <View
                style={{
                  padding: 2,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: isSelected ? tc.brand : 'transparent',
                }}
              >
                <Avatar size="md">
                  {child.avatar_url ? (
                    <AvatarImage source={{ uri: child.avatar_url }} />
                  ) : (
                    <AvatarFallbackText>{childInitials}</AvatarFallbackText>
                  )}
                </Avatar>
                {needsAttention && (
                  <View
                    style={{
                      position: 'absolute', top: 0, right: 0,
                      width: 12, height: 12, borderRadius: 6,
                      backgroundColor: '#EF597B',
                      borderWidth: 2, borderColor: '#FFFFFF',
                    }}
                  />
                )}
              </View>
              <UIText
                size="xs"
                style={{
                  marginTop: 4,
                  color: isSelected ? tc.brand : tc.text,
                  fontFamily: isSelected ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                }}
                numberOfLines={1}
              >
                {child.first_name || nameFor(child).split(' ')[0]}
              </UIText>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

