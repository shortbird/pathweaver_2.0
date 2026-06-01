/**
 * OEA Diploma Plan welcome / onboarding (PRD 4.1 -> 4.2).
 *
 * Where OEA parents land right after signup. Explains the program, lists the
 * parent's students with their chosen pathway (or a prompt to choose one), and
 * routes to per-student pathway selection. With no students yet, it points the
 * parent to the Family tab to add their first child (existing AddKidSheet flow).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ScrollPageLayout } from '@/src/components/layouts/ScrollPageLayout';
import { VStack, HStack, UIText, Button, ButtonText, Card } from '@/src/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren } from '@/src/hooks/useParent';
import { oeaAPI } from '@/src/services/api';
import type { OEAEnrollment } from '@/src/components/oea/types';

export default function OEAWelcomeScreen() {
  const { children, loading: childrenLoading } = useMyChildren();
  const [enrollments, setEnrollments] = useState<Record<string, OEAEnrollment>>({});
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);

  const loadEnrollments = useCallback(async () => {
    try {
      const { data } = await oeaAPI.enrollments();
      const byStudent: Record<string, OEAEnrollment> = {};
      for (const e of (data?.enrollments || []) as OEAEnrollment[]) {
        byStudent[e.student_id] = e;
      }
      setEnrollments(byStudent);
    } catch {
      // Non-critical — treat as no enrollments yet.
    } finally {
      setEnrollmentsLoading(false);
    }
  }, []);

  useEffect(() => { loadEnrollments(); }, [loadEnrollments]);
  // Refresh when returning from the pathway picker so the choice shows immediately.
  useFocusEffect(useCallback(() => { loadEnrollments(); }, [loadEnrollments]));

  return (
    <ScrollPageLayout
      title="Welcome to OpenEd Academy"
      subtitle="Track credits and learning logs toward an OpenEd Academy diploma."
      loading={childrenLoading || enrollmentsLoading}
      maxWidth="max-w-2xl"
    >
      <VStack space="lg">
        <Card variant="elevated" size="md">
          <VStack space="sm">
            <HStack className="items-center" space="sm">
              <Ionicons name="school-outline" size={22} color="#6D469B" />
              <UIText size="md" className="font-poppins-semibold text-typo">How it works</UIText>
            </HStack>
            <UIText size="sm" className="text-typo-600">
              Each student works toward 24 credits on one of three diploma pathways.
              Choose a pathway for each student below — you can change it anytime.
            </UIText>
          </VStack>
        </Card>

        {children.length === 0 ? (
          <Card variant="outline" size="md">
            <VStack space="md" className="items-center">
              <Ionicons name="person-add-outline" size={28} color="#6D469B" />
              <UIText size="md" className="font-poppins-semibold text-typo text-center">
                Add your first student
              </UIText>
              <UIText size="sm" className="text-typo-500 text-center">
                Add a student to your family, then choose their diploma pathway.
              </UIText>
              <Button size="md" onPress={() => router.replace('/(app)/(tabs)/family' as any)}>
                <ButtonText>Go to Family</ButtonText>
              </Button>
            </VStack>
          </Card>
        ) : (
          <VStack space="md">
            <UIText size="sm" className="font-poppins-semibold text-typo-500">YOUR STUDENTS</UIText>
            {children.map((child) => {
              const enrollment = enrollments[child.id];
              const pathwayName = enrollment?.pathway?.name;
              const navParams = {
                studentId: child.id,
                studentName: child.first_name || child.display_name || '',
              };
              return (
                <Card key={child.id} variant="outline" size="md">
                  <VStack space="sm">
                    <View>
                      <UIText size="md" className="font-poppins-semibold text-typo">
                        {child.display_name || `${child.first_name} ${child.last_name}`.trim()}
                      </UIText>
                      <UIText size="sm" className={pathwayName ? 'text-typo-600' : 'text-amber-700'}>
                        {pathwayName ? pathwayName : 'No pathway chosen yet'}
                      </UIText>
                    </View>
                    {pathwayName ? (
                      <HStack space="sm">
                        <Button
                          size="sm"
                          className="flex-1"
                          onPress={() => router.push({ pathname: '/(app)/oea/credits' as any, params: navParams })}
                        >
                          <ButtonText>Credits</ButtonText>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onPress={() => router.push({ pathname: '/(app)/oea/select-pathway' as any, params: navParams })}
                        >
                          <ButtonText>Change pathway</ButtonText>
                        </Button>
                      </HStack>
                    ) : (
                      <Button
                        size="sm"
                        onPress={() => router.push({ pathname: '/(app)/oea/select-pathway' as any, params: navParams })}
                      >
                        <ButtonText>Choose pathway</ButtonText>
                      </Button>
                    )}
                  </VStack>
                </Card>
              );
            })}
          </VStack>
        )}

        <Button variant="link" size="sm" onPress={() => router.replace('/(app)/(tabs)/family' as any)}>
          <ButtonText>Continue to my family dashboard</ButtonText>
        </Button>
      </VStack>
    </ScrollPageLayout>
  );
}
