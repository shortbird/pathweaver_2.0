/**
 * Overview Screen - Read-only student progress from the web platform.
 *
 * Shows Total XP, Spendable XP, pillar breakdown, active quests/projects,
 * level info, and engagement rhythm. Uses existing dashboard API.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { tokens, PillarKey } from '../theme/tokens';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';

interface DashboardStats {
  total_xp: number;
  level: {
    level: number;
    title: string;
    next_threshold: number;
    progress: number;
  };
  completed_quests_count: number;
  completed_tasks_count: number;
}

interface SkillXpEntry {
  category: string;
  display_name: string;
  xp: number;
}

interface ActiveQuest {
  id: string;
  quest_id: string;
  completed_tasks: number;
  quests: {
    id: string;
    title: string;
    description: string;
    task_count: number;
  };
}

interface EnrolledCourse {
  id: string;
  title: string;
  progress: {
    completed_quests: number;
    total_quests: number;
    percentage: number;
  };
}

interface EngagementData {
  rhythm: {
    state: string;
    state_display: string;
    message: string;
  };
  summary: {
    active_days_last_week: number;
    active_days_last_month: number;
  };
}

interface DashboardData {
  stats: DashboardStats;
  skill_xp_data: SkillXpEntry[];
  active_quests: ActiveQuest[];
  enrolled_courses: EnrolledCourse[];
}

export function OverviewScreen() {
  const { user } = useAuthStore();
  const { colors } = useThemeStore();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [spendableXp, setSpendableXp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [dashRes, engRes, balRes] = await Promise.allSettled([
        api.get('/api/users/dashboard'),
        api.get('/api/users/me/engagement'),
        api.get('/api/yeti/my-pet/balance'),
      ]);

      if (dashRes.status === 'fulfilled') {
        setDashboard(dashRes.value.data);
      }
      if (engRes.status === 'fulfilled') {
        setEngagement(engRes.value.data.engagement);
      }
      if (balRes.status === 'fulfilled') {
        setSpendableXp(balRes.value.data.spendable_xp);
      }
    } catch {
      // Partial load ok
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const stats = dashboard?.stats;
  const skillXp = dashboard?.skill_xp_data || [];
  const maxXp = Math.max(...skillXp.map((s) => s.xp), 1);

  return (
    <GlassBackground style={{flex: 1}}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={[styles.screenTitle, { color: colors.text }]}>My Progress</Text>

      {/* XP & Level Card */}
      <SurfaceCard style={styles.card}>
        <View style={styles.xpRow}>
          <View style={styles.xpBlock}>
            <Text style={[styles.xpValue, { color: colors.primary }]}>{stats?.total_xp ?? user?.total_xp ?? 0}</Text>
            <Text style={[styles.xpLabel, { color: colors.textSecondary }]}>Total XP</Text>
          </View>
          {spendableXp !== null && (
            <View style={styles.xpBlock}>
              <Text style={[styles.xpValue, { color: colors.accent }]}>
                {spendableXp}
              </Text>
              <Text style={[styles.xpLabel, { color: colors.textSecondary }]}>Spendable XP</Text>
            </View>
          )}
        </View>

        {stats?.level && (
          <View style={styles.levelSection}>
            <View style={styles.levelHeader}>
              <Text style={[styles.levelTitle, { color: colors.text }]}>
                Level {stats.level.level} - {stats.level.title}
              </Text>
              <Text style={[styles.levelProgress, { color: colors.textSecondary }]}>
                {Math.round(stats.level.progress)}%
              </Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(stats.level.progress, 100)}%`, backgroundColor: colors.primary },
                ]}
              />
            </View>
            {stats.level.next_threshold > 0 && (
              <Text style={[styles.nextLevel, { color: colors.textMuted }]}>
                {stats.level.next_threshold - (stats?.total_xp ?? 0)} XP to next level
              </Text>
            )}
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{stats?.completed_tasks_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Tasks Done</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{stats?.completed_quests_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Quests Done</Text>
          </View>
        </View>
      </SurfaceCard>

      {/* Pillar Breakdown */}
      {skillXp.length > 0 && (
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pillar Breakdown</Text>
          {skillXp.map((entry) => (
            <View key={entry.category} style={styles.pillarRow}>
              <View style={styles.pillarLabelCol}>
                <View
                  style={[
                    styles.pillarDot,
                    {
                      backgroundColor:
                        colors.pillars[entry.category as PillarKey] ||
                        colors.textMuted,
                    },
                  ]}
                />
                <Text style={[styles.pillarName, { color: colors.text }]}>{entry.display_name}</Text>
              </View>
              <View style={[styles.pillarBarBg, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.pillarBarFill,
                    {
                      width: `${Math.round((entry.xp / maxXp) * 100)}%`,
                      backgroundColor:
                        colors.pillars[entry.category as PillarKey] ||
                        colors.textMuted,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.pillarXp, { color: colors.textSecondary }]}>{entry.xp}</Text>
            </View>
          ))}
        </SurfaceCard>
      )}

      {/* Engagement Rhythm */}
      {engagement?.rhythm && (
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Engagement</Text>
          <Text style={[styles.rhythmState, { color: colors.primary }]}>{engagement.rhythm.state_display}</Text>
          <Text style={[styles.rhythmMessage, { color: colors.textSecondary }]}>{engagement.rhythm.message}</Text>
          <View style={styles.engagementStats}>
            <View style={styles.engagementStat}>
              <Text style={[styles.engagementNumber, { color: colors.text }]}>
                {engagement.summary.active_days_last_week}
              </Text>
              <Text style={[styles.engagementLabel, { color: colors.textSecondary }]}>days this week</Text>
            </View>
            <View style={styles.engagementStat}>
              <Text style={[styles.engagementNumber, { color: colors.text }]}>
                {engagement.summary.active_days_last_month}
              </Text>
              <Text style={[styles.engagementLabel, { color: colors.textSecondary }]}>days this month</Text>
            </View>
          </View>
        </SurfaceCard>
      )}

      {/* Active Quests / Projects */}
      {(dashboard?.active_quests?.length ?? 0) > 0 && (
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Quests</Text>
          {dashboard!.active_quests.map((aq) => {
            const totalTasks = aq.quests?.task_count ?? 0;
            const completed = aq.completed_tasks ?? 0;
            const pct = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

            return (
              <View key={aq.id} style={styles.questRow}>
                <View style={styles.questInfo}>
                  <Text style={[styles.questTitle, { color: colors.text }]} numberOfLines={1}>
                    {aq.quests?.title}
                  </Text>
                  <Text style={[styles.questProgress, { color: colors.textSecondary }]}>
                    {completed}/{totalTasks} tasks ({pct}%)
                  </Text>
                </View>
                <View style={[styles.questBarBg, { backgroundColor: colors.border }]}>
                  <View style={[styles.questBarFill, { width: `${pct}%`, backgroundColor: colors.success }]} />
                </View>
              </View>
            );
          })}
        </SurfaceCard>
      )}

      {/* Enrolled Courses (Projects) */}
      {(dashboard?.enrolled_courses?.length ?? 0) > 0 && (
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Courses</Text>
          {dashboard!.enrolled_courses.map((course) => (
            <View key={course.id} style={styles.questRow}>
              <View style={styles.questInfo}>
                <Text style={[styles.questTitle, { color: colors.text }]} numberOfLines={1}>
                  {course.title}
                </Text>
                <Text style={[styles.questProgress, { color: colors.textSecondary }]}>
                  {course.progress.completed_quests}/{course.progress.total_quests} projects (
                  {Math.round(course.progress.percentage)}%)
                </Text>
              </View>
              <View style={[styles.questBarBg, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.questBarFill,
                    { width: `${Math.min(course.progress.percentage, 100)}%`, backgroundColor: colors.success },
                  ]}
                />
              </View>
            </View>
          ))}
        </SurfaceCard>
      )}
    </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    // backgroundColor handled by GlassBackground
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    marginBottom: tokens.spacing.md,
  },
  card: {
    marginBottom: tokens.spacing.md,
  },

  // XP & Level
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: tokens.spacing.md,
  },
  xpBlock: {
    alignItems: 'center',
  },
  xpValue: {
    fontSize: tokens.typography.sizes.xxl,
    fontWeight: tokens.typography.weights.bold,
  },
  xpLabel: {
    fontSize: tokens.typography.sizes.xs,
  },
  levelSection: {
    marginBottom: tokens.spacing.md,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xs,
  },
  levelTitle: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
  },
  levelProgress: {
    fontSize: tokens.typography.sizes.sm,
  },
  progressBarBg: {
    height: 8,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  nextLevel: {
    fontSize: tokens.typography.sizes.xs,
    marginTop: tokens.spacing.xs,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
  },
  statLabel: {
    fontSize: tokens.typography.sizes.xs,
  },

  // Pillar breakdown
  sectionTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semiBold,
    marginBottom: tokens.spacing.md,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  pillarLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 110,
    gap: tokens.spacing.sm,
  },
  pillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillarName: {
    fontSize: tokens.typography.sizes.sm,
  },
  pillarBarBg: {
    flex: 1,
    height: 8,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  pillarBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  pillarXp: {
    width: 40,
    textAlign: 'right',
    fontSize: tokens.typography.sizes.sm,
  },

  // Engagement
  rhythmState: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.bold,
    marginBottom: tokens.spacing.xs,
  },
  rhythmMessage: {
    fontSize: tokens.typography.sizes.sm,
    marginBottom: tokens.spacing.md,
    lineHeight: 20,
  },
  engagementStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  engagementStat: {
    alignItems: 'center',
  },
  engagementNumber: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
  },
  engagementLabel: {
    fontSize: tokens.typography.sizes.xs,
  },

  // Quests & Courses
  questRow: {
    marginBottom: tokens.spacing.md,
  },
  questInfo: {
    marginBottom: tokens.spacing.xs,
  },
  questTitle: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
  },
  questProgress: {
    fontSize: tokens.typography.sizes.xs,
  },
  questBarBg: {
    height: 6,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  questBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
});
