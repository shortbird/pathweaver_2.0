/**
 * OEA diploma pathway selection (PRD 4.2).
 *
 * Reached per-student from the OEA welcome/onboarding screen. Shows the three
 * pathways as a comparison and saves the parent's choice. Selecting a pathway
 * is immediate and reversible (the parent may change it any time, no approval).
 *
 * Params: studentId (required), studentName (optional, for the title).
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollPageLayout } from '@/src/components/layouts/ScrollPageLayout';
import { VStack, UIText, Button, ButtonText } from '@/src/components/ui';
import { PathwayCard } from '@/src/components/oea/PathwayCard';
import type { Pathway, PathwayKey } from '@/src/components/oea/types';
import { oeaAPI } from '@/src/services/api';
import { extractApiError } from '@/src/services/apiError';

export default function SelectPathwayScreen() {
  const { studentId, studentName } = useLocalSearchParams<{ studentId?: string; studentName?: string }>();

  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [selectedKey, setSelectedKey] = useState<PathwayKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pathwaysRes, enrollmentRes] = await Promise.all([
          oeaAPI.pathways(),
          studentId ? oeaAPI.studentEnrollment(studentId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setPathways(pathwaysRes.data?.pathways || []);
        const current = enrollmentRes?.data?.enrollment?.pathway_key as PathwayKey | undefined;
        if (current) setSelectedKey(current);
      } catch (err) {
        if (!cancelled) setError(extractApiError(err, 'Could not load pathways.').message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  const handleSelect = async (key: PathwayKey) => {
    if (!studentId || saving) return;
    setSelectedKey(key);
    setSaving(true);
    setError(null);
    try {
      await oeaAPI.selectPathway(studentId, key);
      if (router.canGoBack()) router.back();
      else router.replace('/(app)/oea/welcome' as any);
    } catch (err) {
      setError(extractApiError(err, 'Could not save your pathway choice.').message);
      setSaving(false);
    }
  };

  const title = studentName ? `Choose ${studentName}'s pathway` : 'Choose a diploma pathway';

  return (
    <ScrollPageLayout
      title={title}
      subtitle="All three pathways require 24 credits. You can change this anytime."
      loading={loading}
    >
      <VStack space="lg">
        {error && (
          <View className="bg-red-50 p-3 rounded-lg">
            <UIText size="sm" className="text-red-600">{error}</UIText>
          </View>
        )}

        {!studentId && (
          <View className="bg-amber-50 border border-amber-300 p-3 rounded-lg">
            <UIText size="sm" className="text-amber-800">
              No student selected. Go back and pick a student first.
            </UIText>
          </View>
        )}

        {pathways.map((p) => (
          <PathwayCard
            key={p.key}
            pathway={p}
            selected={selectedKey === p.key}
            saving={saving}
            onSelect={handleSelect}
          />
        ))}

        <Button variant="link" size="sm" onPress={() => router.back()} disabled={saving}>
          <ButtonText>Back</ButtonText>
        </Button>
      </VStack>
    </ScrollPageLayout>
  );
}
