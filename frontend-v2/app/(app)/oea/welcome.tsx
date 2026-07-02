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
import { safeOpenURL } from '@/src/utils/linking';
import { toast } from '@/src/stores/toastStore';
import type { OEAEnrollment } from '@/src/components/oea/types';

export default function OEAWelcomeScreen() {
  const { children, loading: childrenLoading } = useMyChildren();
  const [enrollments, setEnrollments] = useState<Record<string, OEAEnrollment>>({});
  const [helpVideoUrl, setHelpVideoUrl] = useState<string | null>(null);
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true);

  const loadEnrollments = useCallback(async () => {
    try {
      const { data } = await oeaAPI.enrollments();
      const byStudent: Record<string, OEAEnrollment> = {};
      for (const e of (data?.enrollments || []) as OEAEnrollment[]) {
        byStudent[e.student_id] = e;
      }
      setEnrollments(byStudent);
      setHelpVideoUrl(data?.help_video_url || null);
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
      title="Welcome to Hearthwood Academy"
      subtitle="Track credits and learning logs toward a Hearthwood Academy diploma."
      loading={childrenLoading || enrollmentsLoading}
      maxWidth="max-w-2xl"
    >
      <VStack space="lg">
        {helpVideoUrl ? (
          <Card variant="outline" size="md">
            <Button
              variant="link"
              size="md"
              onPress={async () => {
                const opened = await safeOpenURL(helpVideoUrl);
                if (!opened) toast.error("Couldn't open the video.");
              }}
            >
              <HStack className="items-center" space="sm">
                <Ionicons name="play-circle" size={26} color="#6D469B" />
                <ButtonText>New here? Watch the getting-started video</ButtonText>
              </HStack>
            </Button>
          </Card>
        ) : (
          /* Placeholder until Hearthwood posts the video (admins set the URL in
             Organization -> Settings on the web). */
          <Card variant="outline" size="md">
            <HStack className="items-center" space="sm">
              <Ionicons name="videocam-outline" size={24} color="#A3A3A3" />
              <View className="flex-1">
                <UIText size="sm" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500">
                  Getting-started video coming soon
                </UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  Hearthwood Academy will post a short walkthrough of the weekly flow here.
                </UIText>
              </View>
            </HStack>
          </Card>
        )}

        <Card variant="elevated" size="md">
          <VStack space="sm">
            <HStack className="items-center" space="sm">
              <Ionicons name="school-outline" size={22} color="#6D469B" />
              <UIText size="md" className="font-poppins-semibold text-typo dark:text-dark-typo">Getting started</UIText>
            </HStack>
            <UIText size="sm" className="text-typo-600">
              Each student works toward 24 credits on one of three diploma pathways.
            </UIText>
            <UIText size="sm" className="text-typo-600">
              1. Choose a diploma pathway for each student below — you can change it anytime.{'\n'}
              2. Enter the courses your student is currently working on.{'\n'}
              3. Add work evidence and learning logs to each course every week.
            </UIText>
          </VStack>
        </Card>

        {children.length === 0 ? (
          <Card variant="outline" size="md">
            <VStack space="md" className="items-center">
              <Ionicons name="person-add-outline" size={28} color="#6D469B" />
              <UIText size="md" className="font-poppins-semibold text-typo dark:text-dark-typo text-center">
                Add your first student
              </UIText>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
                Add a student to your family, then choose their diploma pathway.
              </UIText>
              <Button size="md" onPress={() => router.replace('/(app)/(tabs)/family' as any)}>
                <ButtonText>Go to Family</ButtonText>
              </Button>
            </VStack>
          </Card>
        ) : (
          <VStack space="md">
            <UIText size="sm" className="font-poppins-semibold text-typo-500 dark:text-dark-typo-500">YOUR STUDENTS</UIText>
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
                      <UIText size="md" className="font-poppins-semibold text-typo dark:text-dark-typo">
                        {child.display_name || `${child.first_name} ${child.last_name}`.trim()}
                      </UIText>
                      <UIText size="sm" className={pathwayName ? 'text-typo-600' : 'text-amber-700'}>
                        {pathwayName ? pathwayName : 'Get started by choosing a diploma pathway — you can change it anytime.'}
                      </UIText>
                    </View>
                    {pathwayName ? (
                      <HStack space="sm">
                        <Button
                          size="sm"
                          className="flex-1"
                          onPress={() => router.push({ pathname: '/(app)/oea/credits' as any, params: navParams })}
                        >
                          <ButtonText>Course Tracker</ButtonText>
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
