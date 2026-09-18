/**
 * The Documents tab: the school's document library (guidebooks, agreements,
 * waivers). Its own screen until the hub grew tabs (2026-09-18); the list is
 * unchanged, and the hub only shows the tab when the school has posted any.
 */

import React from 'react';
import { ScrollView } from 'react-native';
import type { useSchoolResources } from '@/src/hooks/useSchoolResources';
import { ResourceList } from './SchoolResources';

export function DocumentsTab({ resources }: {
  resources: ReturnType<typeof useSchoolResources>['resources'];
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-5 pb-12 max-w-3xl w-full md:mx-auto"
      showsVerticalScrollIndicator={false}
      testID="school-tab-documents"
    >
      <ResourceList resources={resources} />
    </ScrollView>
  );
}

export default DocumentsTab;
