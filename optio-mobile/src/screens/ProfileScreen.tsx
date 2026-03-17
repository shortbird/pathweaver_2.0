/**
 * Profile Screen - User profile with XP stats, profile editing, observer management,
 * theme toggle, and sign out.
 *
 * Pulls from the same /api/users/profile endpoint as the web platform.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon, Line, Circle as SvgCircle } from 'react-native-svg';
import { tokens, PillarKey } from '../theme/tokens';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';

interface Observer {
  id: string;
  observer_id: string;
  relationship: string;
  observer: {
    display_name: string;
    email: string;
  };
}

interface ProfileData {
  user: {
    id: string;
    email: string;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    created_at: string | null;
    deletion_status: string | null;
    deletion_scheduled_for: string | null;
  };
  total_xp: number;
  skill_breakdown: Record<string, number>;
  completed_quests: number;
}

const PILLAR_LABELS: Record<string, string> = {
  stem: 'STEM',
  art: 'Art',
  communication: 'Communication',
  civics: 'Civics',
  wellness: 'Wellness',
};

const PILLAR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  stem: 'flask-outline',
  art: 'color-palette-outline',
  communication: 'chatbubbles-outline',
  civics: 'globe-outline',
  wellness: 'fitness-outline',
};

// ── Radar Chart ──────────────────────────────────────────────

const RADAR_PILLARS_DEF = [
  { key: 'stem', label: 'STEM', icon: 'flask-outline' as keyof typeof Ionicons.glyphMap, color: tokens.colors.pillars.stem },
  { key: 'art', label: 'Art', icon: 'color-palette-outline' as keyof typeof Ionicons.glyphMap, color: tokens.colors.pillars.art },
  { key: 'communication', label: 'Comm', icon: 'chatbubbles-outline' as keyof typeof Ionicons.glyphMap, color: tokens.colors.pillars.communication },
  { key: 'civics', label: 'Civics', icon: 'globe-outline' as keyof typeof Ionicons.glyphMap, color: tokens.colors.pillars.civics },
  { key: 'wellness', label: 'Wellness', icon: 'fitness-outline' as keyof typeof Ionicons.glyphMap, color: tokens.colors.pillars.wellness },
];

const RADAR_SVG_SIZE = 160;
const RADAR_CX = RADAR_SVG_SIZE / 2;
const RADAR_CY = RADAR_SVG_SIZE / 2;
const RADAR_R = 55;
const ICON_OFFSET = RADAR_R + 24;
const RADAR_VIEW_SIZE = RADAR_SVG_SIZE + 48;

function radarPoint(i: number, r: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * i) / RADAR_PILLARS_DEF.length - Math.PI / 2;
  return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle) };
}

function PillarRadarChart({ skillBreakdown }: { skillBreakdown: Record<string, number> }) {
  const maxXp = Math.max(...Object.values(skillBreakdown), 1);
  const gridLevels = [0.33, 0.66, 1.0];
  const iconPositions = RADAR_PILLARS_DEF.map((_, i) => radarPoint(i, ICON_OFFSET));

  return (
    <View style={radarStyles.wrapper}>
      <View style={radarStyles.svgWrapper}>
        <Svg width={RADAR_SVG_SIZE} height={RADAR_SVG_SIZE}>
          {/* Grid rings */}
          {gridLevels.map((level) => {
            const pts = RADAR_PILLARS_DEF.map((_, i) => {
              const p = radarPoint(i, RADAR_R * level);
              return `${p.x},${p.y}`;
            }).join(' ');
            return (
              <Polygon
                key={level}
                points={pts}
                fill="none"
                stroke={tokens.colors.textMuted}
                strokeWidth={0.5}
                opacity={0.5}
              />
            );
          })}

          {/* Axis lines */}
          {RADAR_PILLARS_DEF.map((p, i) => {
            const pt = radarPoint(i, RADAR_R);
            return (
              <Line
                key={i}
                x1={RADAR_CX}
                y1={RADAR_CY}
                x2={pt.x}
                y2={pt.y}
                stroke={p.color}
                strokeWidth={0.5}
                opacity={0.4}
              />
            );
          })}

          {/* Data polygon */}
          <Polygon
            points={RADAR_PILLARS_DEF.map((p, i) => {
              const value = Math.max((skillBreakdown[p.key] || 0) / maxXp, 0.05);
              const pt = radarPoint(i, RADAR_R * value);
              return `${pt.x},${pt.y}`;
            }).join(' ')}
            fill={tokens.colors.primary + '25'}
            stroke={tokens.colors.primary}
            strokeWidth={2}
          />

          {/* Data dots */}
          {RADAR_PILLARS_DEF.map((p, i) => {
            const value = Math.max((skillBreakdown[p.key] || 0) / maxXp, 0.05);
            const pt = radarPoint(i, RADAR_R * value);
            return <SvgCircle key={p.key} cx={pt.x} cy={pt.y} r={4} fill={p.color} />;
          })}
        </Svg>

        {/* Icon overlays around the chart */}
        {RADAR_PILLARS_DEF.map((p, i) => {
          const pos = iconPositions[i];
          const offset = (RADAR_VIEW_SIZE - RADAR_SVG_SIZE) / 2;
          return (
            <View
              key={p.key}
              style={[
                radarStyles.iconWrap,
                { left: pos.x + offset - 12, top: pos.y + offset - 12 },
              ]}
            >
              <Ionicons name={p.icon} size={18} color={p.color} />
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={radarStyles.legend}>
        <View style={radarStyles.legendRow}>
          {RADAR_PILLARS_DEF.slice(0, 3).map((p) => (
            <View key={p.key} style={radarStyles.legendItem}>
              <Ionicons name={p.icon} size={14} color={p.color} />
              <Text style={[radarStyles.legendText, { color: p.color }]}>
                {p.label} {(skillBreakdown[p.key] || 0).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
        <View style={radarStyles.legendRow}>
          {RADAR_PILLARS_DEF.slice(3).map((p) => (
            <View key={p.key} style={radarStyles.legendItem}>
              <Ionicons name={p.icon} size={14} color={p.color} />
              <Text style={[radarStyles.legendText, { color: p.color }]}>
                {p.label} {(skillBreakdown[p.key] || 0).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const radarStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  svgWrapper: {
    width: RADAR_VIEW_SIZE,
    height: RADAR_VIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.semiBold,
  },
});

export function ProfileScreen() {
  const { user, logout, loadUser } = useAuthStore();
  const { mode, colors, toggle } = useThemeStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [observers, setObservers] = useState<Observer[]>([]);
  const [loadingObservers, setLoadingObservers] = useState(true);
  const [momentsCaptured, setMomentsCaptured] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  // Observer invite
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const response = await api.get('/api/users/profile');
      setProfile(response.data);
    } catch {
      // Profile endpoint may fail for some roles, fall back to authStore data
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const loadMomentsCount = useCallback(async () => {
    try {
      const response = await api.get('/api/learning-events', { params: { limit: 100, offset: 0 } });
      setMomentsCaptured((response.data.events || []).length);
    } catch {
      // Not critical
    }
  }, []);

  const loadObservers = useCallback(async () => {
    try {
      const response = await api.get('/api/observers/my-observers');
      setObservers(response.data.observers || []);
    } catch {
      // May not have observers
    } finally {
      setLoadingObservers(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadObservers();
    loadMomentsCount();
  }, [loadProfile, loadObservers, loadMomentsCount]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([loadProfile(), loadObservers(), loadMomentsCount()]);
    setRefreshing(false);
  };

  const startEditing = () => {
    const p = profile?.user;
    setEditFirstName(p?.first_name || '');
    setEditLastName(p?.last_name || '');
    setEditDisplayName(user?.display_name || '');
    setEditBio(p?.bio || '');
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/api/users/profile', {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        display_name: editDisplayName.trim(),
        bio: editBio.trim(),
      });
      setEditing(false);
      // Refresh both profile data and auth store user
      await Promise.allSettled([loadProfile(), loadUser()]);
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    try {
      await api.post('/api/observers/invite', {
        observer_email: inviteEmail.trim(),
        observer_name: inviteName.trim(),
        relationship: 'other',
      });
      Alert.alert('Invited!', `Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      setInviteName('');
      setShowInvite(false);
      loadObservers();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveObserver = (obs: Observer) => {
    Alert.alert(
      'Remove Observer',
      `Remove ${obs.observer.display_name} from your observers?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/observers/${obs.id}/remove`);
              loadObservers();
            } catch {
              Alert.alert('Error', 'Failed to remove observer');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const isStudent = user?.role === 'student' || user?.org_role === 'student';

  // Derived profile values
  const avatarUrl = profile?.user?.avatar_url || user?.avatar_url;
  const displayName = user?.display_name || 'User';
  const totalXp = profile?.total_xp ?? user?.total_xp ?? 0;
  const skillBreakdown = profile?.skill_breakdown || {};
  const bio = profile?.user?.bio;
  const memberSince = profile?.user?.created_at || user?.created_at;
  const initials = (user?.first_name?.[0] || displayName[0] || '?').toUpperCase();

  return (
    <GlassBackground style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[styles.screenTitle, { color: colors.text }]}>Profile</Text>

        {/* User Info Card */}
        <SurfaceCard style={styles.card}>
          {!editing ? (
            <>
              <View style={styles.avatarRow}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  </View>
                )}
                <View style={styles.userInfo}>
                  <Text style={[styles.userName, { color: colors.text }]}>{displayName}</Text>
                  <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                    {user?.email}
                  </Text>
                  <Text style={[styles.userRole, { color: colors.textMuted }]}>
                    {user?.org_role || user?.role}
                    {user?.organization_id ? ' (org)' : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={startEditing} style={styles.editButton}>
                  <Ionicons name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {bio ? (
                <Text style={[styles.bioText, { color: colors.textSecondary }]}>{bio}</Text>
              ) : null}

              {memberSince ? (
                <Text style={[styles.memberSince, { color: colors.textMuted }]}>
                  Member since{' '}
                  {new Date(memberSince).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            // Edit mode
            <View style={styles.editForm}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: tokens.spacing.sm }]}>
                Edit Profile
              </Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                placeholder="Display name"
                placeholderTextColor={colors.textMuted}
                value={editDisplayName}
                onChangeText={setEditDisplayName}
              />
              <View style={styles.nameRow}>
                <TextInput
                  style={[styles.input, styles.nameInput, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="First name"
                  placeholderTextColor={colors.textMuted}
                  value={editFirstName}
                  onChangeText={setEditFirstName}
                />
                <TextInput
                  style={[styles.input, styles.nameInput, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="Last name"
                  placeholderTextColor={colors.textMuted}
                  value={editLastName}
                  onChangeText={setEditLastName}
                />
              </View>
              <TextInput
                style={[styles.input, styles.bioInput, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                placeholder="Bio / Learning vision"
                placeholderTextColor={colors.textMuted}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  onPress={() => setEditing(false)}
                  style={[styles.cancelButton, { borderColor: colors.glass.border }]}
                >
                  <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SurfaceCard>

        {/* XP Stats Card */}
        {!loadingProfile && (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Progress</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{totalXp.toLocaleString()}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total XP</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{momentsCaptured}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Moments</Text>
              </View>
            </View>

            {/* Pillar radar chart */}
            <PillarRadarChart skillBreakdown={skillBreakdown} />
          </SurfaceCard>
        )}

        {loadingProfile && (
          <SurfaceCard style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </SurfaceCard>
        )}

        {/* Appearance */}
        <SurfaceCard style={styles.card}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <View style={styles.themeRow}>
            <View style={styles.themeLabel}>
              <Ionicons
                name={mode === 'dark' ? 'moon' : 'sunny'}
                size={20}
                color={colors.primary}
                style={{ marginRight: tokens.spacing.sm }}
              />
              <Text style={[styles.themeText, { color: colors.text }]}>
                {mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <Switch
              value={mode === 'dark'}
              onValueChange={toggle}
              trackColor={{ false: 'rgba(0,0,0,0.1)', true: colors.primary + '60' }}
              thumbColor={mode === 'dark' ? colors.primary : '#f4f3f4'}
            />
          </View>
        </SurfaceCard>

        {/* Observers Section (students only) */}
        {isStudent && (
          <SurfaceCard style={styles.card}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>My Observers</Text>
              <TouchableOpacity onPress={() => setShowInvite(!showInvite)}>
                <Text style={[styles.inviteLink, { color: colors.primary }]}>
                  {showInvite ? 'Cancel' : '+ Invite'}
                </Text>
              </TouchableOpacity>
            </View>

            {showInvite && (
              <View style={styles.inviteForm}>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="Observer name"
                  placeholderTextColor={colors.textMuted}
                  value={inviteName}
                  onChangeText={setInviteName}
                />
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg }]}
                  placeholder="Observer email"
                  placeholderTextColor={colors.textMuted}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.sendButton, inviting && styles.buttonDisabled]}
                  onPress={handleInvite}
                  disabled={inviting}
                >
                  {inviting ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send Invitation</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {loadingObservers ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: tokens.spacing.md }} />
            ) : observers.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No observers yet. Invite someone to follow your learning!
              </Text>
            ) : (
              observers.map((obs) => (
                <View key={obs.id} style={[styles.observerRow, { borderTopColor: colors.border }]}>
                  <View>
                    <Text style={[styles.observerName, { color: colors.text }]}>
                      {obs.observer.display_name}
                    </Text>
                    <Text style={[styles.observerRelation, { color: colors.textMuted }]}>
                      {obs.relationship}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveObserver(obs)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </SurfaceCard>
        )}

        {/* Actions */}
        <SurfaceCard style={styles.card}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons
              name="log-out-outline"
              size={20}
              color={tokens.colors.error}
              style={{ marginRight: tokens.spacing.sm }}
            />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </SurfaceCard>
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  screenTitle: {
    fontSize: tokens.typography.sizes.xl,
    fontFamily: tokens.typography.fonts.bold,
    marginBottom: tokens.spacing.md,
  },
  card: {
    marginBottom: tokens.spacing.md,
  },

  // Avatar & user info
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarInitials: {
    fontSize: tokens.typography.sizes.xl,
    fontFamily: tokens.typography.fonts.bold,
    color: '#FFF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.bold,
  },
  userEmail: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },
  userRole: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  editButton: {
    padding: tokens.spacing.sm,
  },
  bioText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    marginTop: tokens.spacing.md,
    lineHeight: 20,
  },
  memberSince: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginTop: tokens.spacing.sm,
  },

  // Edit form
  editForm: {
    gap: tokens.spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  nameInput: {
    flex: 1,
  },
  bioInput: {
    minHeight: 80,
  },
  editActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.xs,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  saveButton: {
    flex: 1,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // XP Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.md,
  },
  statBlock: {
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  statValue: {
    fontSize: tokens.typography.sizes.xxl,
    fontFamily: tokens.typography.fonts.bold,
  },
  statLabel: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },


  // Theme
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: tokens.spacing.sm,
  },
  themeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeText: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
  },
  sectionTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  inviteLink: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },

  // Observer invite
  inviteForm: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  input: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
  },
  sendButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },

  // Observers list
  emptyText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingVertical: tokens.spacing.md,
  },
  observerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
    borderTopWidth: 1,
  },
  observerName: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },
  observerRelation: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    textTransform: 'capitalize',
  },
  removeText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    color: tokens.colors.error,
  },

  // Actions
  logoutButton: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: tokens.colors.error,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
    color: tokens.colors.error,
  },
});
