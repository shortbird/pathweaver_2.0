/**
 * The school's documents on the mobile school page — guidebooks, agreements,
 * waivers, learning-day guides.
 *
 * Exists because the orientation quest sends families here by name and the
 * section did not exist on mobile (iCreate, 2026-08-18). Rendered as a
 * SchoolSection so it carries the same header, toggle and closed-on-arrival
 * default as everything else on the page.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UIText, VStack, HStack } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { safeOpenURL } from '@/src/utils/linking';
import { SchoolSection } from './SchoolSection';
import { useSchoolResources, groupByCategory, type SchoolResource } from '@/src/hooks/useSchoolResources';

/** A stored document versus a link out — worth distinguishing, because one
 *  opens a PDF and the other leaves the app. */
function iconFor(url?: string | null): keyof typeof Ionicons.glyphMap {
  if (!url) return 'document-outline';
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.pdf')) return 'document-text-outline';
  if (/\.(doc|docx|xls|xlsx|ppt|pptx)$/.test(clean)) return 'document-attach-outline';
  if (/^https?:\/\//.test(url) && !clean.includes('/storage/')) return 'open-outline';
  return 'document-outline';
}

function ResourceRow({ resource }: { resource: SchoolResource }) {
  const c = useThemeColors();
  const url = resource.url;

  return (
    <Pressable
      onPress={() => url && safeOpenURL(url)}
      disabled={!url}
      accessibilityRole="button"
      accessibilityLabel={resource.title}
      className={`flex-row items-center gap-3 bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl px-3.5 py-3 ${url ? 'active:opacity-70' : 'opacity-60'}`}
    >
      <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
        <Ionicons name={iconFor(url)} size={18} color="#6D469B" />
      </View>
      <VStack className="flex-1 min-w-0">
        <UIText size="sm" className="font-poppins-semibold">{resource.title}</UIText>
        {resource.description ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={2}>
            {resource.description}
          </UIText>
        ) : null}
        {/* A row the school has not attached a file to yet should say so
            rather than looking like a dead button. */}
        {!url ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Not uploaded yet</UIText>
        ) : null}
      </VStack>
      {url ? <Ionicons name="chevron-forward" size={16} color={c.iconMuted} /> : null}
    </Pressable>
  );
}

export default function SchoolResources({ organizationId }: { organizationId?: string | null }) {
  const { resources, loading } = useSchoolResources(organizationId);

  // A school with no documents gets no empty heading.
  if (loading || resources.length === 0) return null;

  const groups = groupByCategory(resources);

  return (
    <View testID="school-resources">
      <SchoolSection title="Documents" icon="folder-open-outline" count={resources.length}>
        <VStack space="md">
          {groups.map((g) => (
            <VStack key={g.category ?? '__none__'} space="xs">
              {g.category ? (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase">
                  {g.category}
                </UIText>
              ) : null}
              {g.items.map((r) => <ResourceRow key={r.id} resource={r} />)}
            </VStack>
          ))}
        </VStack>
      </SchoolSection>
    </View>
  );
}
