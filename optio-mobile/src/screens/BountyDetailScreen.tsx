/**
 * Bounty Detail Screen - View bounty, claim, submit evidence, view reviews.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { tokens, PillarKey } from '../theme/tokens';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { useAuthStore } from '../stores/authStore';
import { useBountyStore, Bounty, BountyClaim } from '../stores/bountyStore';
import api from '../services/api';

export function BountyDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const bountyId = route.params?.bountyId;
  const { user } = useAuthStore();
  const { myClaims, claimBounty, submitEvidence, loadMyClaims } = useBountyStore();

  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  const myClaim = myClaims.find((c) => c.bounty_id === bountyId);
  const isStudent = user?.role === 'student' || user?.org_role === 'student';

  const loadBounty = useCallback(async () => {
    try {
      const response = await api.get(`/api/bounties/${bountyId}`);
      setBounty(response.data.bounty);
    } catch {
      Alert.alert('Error', 'Could not load bounty');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [bountyId]);

  useEffect(() => {
    loadBounty();
    loadMyClaims();
  }, [loadBounty, loadMyClaims]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claimBounty(bountyId);
      Alert.alert('Claimed!', 'You have claimed this bounty. Submit your evidence when ready.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleSubmit = async () => {
    if (!myClaim) return;
    if (!evidenceText.trim() && !evidenceUrl.trim()) {
      Alert.alert('Required', 'Please provide evidence text or a URL.');
      return;
    }
    setSubmitting(true);
    try {
      await submitEvidence(bountyId, myClaim.id, {
        text: evidenceText.trim() || undefined,
        url: evidenceUrl.trim() || undefined,
      });
      Alert.alert('Submitted!', 'Your evidence has been submitted for review.');
      setEvidenceText('');
      setEvidenceUrl('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  if (!bounty) return null;

  const deadline = new Date(bounty.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const pillarColor = tokens.colors.pillars[bounty.pillar as PillarKey] || tokens.colors.textMuted;
  const isActive = bounty.status === 'active';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={tokens.colors.primary} />
        <Text style={styles.backButton}>Back</Text>
      </TouchableOpacity>

      {/* Bounty Info */}
      <SurfaceCard style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.pillarBadge, { backgroundColor: pillarColor }]}>
            <Text style={styles.pillarBadgeText}>
              {bounty.pillar.charAt(0).toUpperCase() + bounty.pillar.slice(1)}
            </Text>
          </View>
          <Text style={styles.typeBadge}>{bounty.bounty_type}</Text>
        </View>

        <Text style={styles.bountyTitle}>{bounty.title}</Text>
        <Text style={styles.bountyDescription}>{bounty.description}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Requirements</Text>
        <Text style={styles.requirements}>{bounty.requirements}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>+{bounty.xp_reward}</Text>
            <Text style={styles.statLabel}>XP Reward</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{bounty.max_participants}</Text>
            <Text style={styles.statLabel}>Max Slots</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{daysLeft}d</Text>
            <Text style={styles.statLabel}>Left</Text>
          </View>
        </View>

        {bounty.sponsored_reward && (
          <View style={styles.rewardCard}>
            <Text style={styles.rewardTitle}>Sponsored Prize</Text>
            <Text style={styles.rewardText}>{bounty.sponsored_reward}</Text>
          </View>
        )}
      </SurfaceCard>

      {/* Claim / Submit Section (students only) */}
      {isStudent && isActive && (
        <SurfaceCard style={styles.card}>
          {!myClaim ? (
            <>
              <Text style={styles.sectionTitle}>Ready to take this on?</Text>
              <TouchableOpacity
                style={[styles.claimButton, claiming && styles.buttonDisabled]}
                onPress={handleClaim}
                disabled={claiming}
              >
                {claiming ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.claimButtonText}>Claim Bounty</Text>
                )}
              </TouchableOpacity>
            </>
          ) : myClaim.status === 'claimed' ? (
            <>
              <Text style={styles.sectionTitle}>Submit Your Evidence</Text>
              <Text style={styles.claimStatus}>Status: Claimed - Waiting for your submission</Text>
              <TextInput
                style={styles.evidenceInput}
                placeholder="Describe what you did..."
                placeholderTextColor={tokens.colors.textMuted}
                value={evidenceText}
                onChangeText={setEvidenceText}
                multiline
              />
              <TextInput
                style={styles.urlInput}
                placeholder="Link to evidence (optional)"
                placeholderTextColor={tokens.colors.textMuted}
                value={evidenceUrl}
                onChangeText={setEvidenceUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit Evidence</Text>
                )}
              </TouchableOpacity>
            </>
          ) : myClaim.status === 'submitted' ? (
            <>
              <Text style={styles.sectionTitle}>Evidence Submitted</Text>
              <Text style={styles.claimStatus}>Waiting for review by the bounty poster.</Text>
              {myClaim.evidence?.text && (
                <Text style={styles.evidencePreview}>{myClaim.evidence.text}</Text>
              )}
            </>
          ) : myClaim.status === 'approved' ? (
            <>
              <Text style={styles.sectionTitle}>Bounty Completed!</Text>
              <Text style={styles.approvedText}>
                You earned +{bounty.xp_reward} XP for completing this bounty.
              </Text>
            </>
          ) : myClaim.status === 'rejected' ? (
            <Text style={styles.rejectedText}>Your submission was not accepted.</Text>
          ) : myClaim.status === 'revision_requested' ? (
            <>
              <Text style={styles.sectionTitle}>Revision Requested</Text>
              <Text style={styles.claimStatus}>The poster asked for changes. Resubmit below.</Text>
              <TextInput
                style={styles.evidenceInput}
                placeholder="Updated evidence..."
                placeholderTextColor={tokens.colors.textMuted}
                value={evidenceText}
                onChangeText={setEvidenceText}
                multiline
              />
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Resubmit</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </SurfaceCard>
      )}

      {!isActive && (
        <SurfaceCard style={styles.card}>
          <Text style={styles.inactiveText}>
            This bounty is {bounty.status === 'pending_review' ? 'pending moderation' : bounty.status}.
          </Text>
        </SurfaceCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: tokens.colors.background,
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
    backgroundColor: tokens.colors.background,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: tokens.spacing.md,
  },
  backButton: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.primary,
    fontWeight: tokens.typography.weights.semiBold,
  },
  card: {
    marginBottom: tokens.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  pillarBadge: {
    borderRadius: tokens.radius.full,
    paddingVertical: 2,
    paddingHorizontal: tokens.spacing.sm,
  },
  pillarBadgeText: {
    fontSize: tokens.typography.sizes.xs,
    fontWeight: tokens.typography.weights.medium,
    color: '#FFF',
  },
  typeBadge: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
    textTransform: 'capitalize',
  },
  bountyTitle: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  bountyDescription: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.textSecondary,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: tokens.spacing.md,
  },
  sectionLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.xs,
  },
  requirements: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.primary,
  },
  statLabel: {
    fontSize: tokens.typography.sizes.xs,
    color: tokens.colors.textMuted,
  },
  rewardCard: {
    backgroundColor: tokens.colors.success + '10',
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  rewardTitle: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.success,
    marginBottom: tokens.spacing.xs,
  },
  rewardText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
  },
  sectionTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.sm,
  },
  claimStatus: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    marginBottom: tokens.spacing.md,
  },
  claimButton: {
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  claimButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.bold,
  },
  evidenceInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: tokens.spacing.sm,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  submitButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  evidencePreview: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: tokens.spacing.sm,
  },
  approvedText: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.success,
    fontWeight: tokens.typography.weights.semiBold,
  },
  rejectedText: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.error,
  },
  inactiveText: {
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.textMuted,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
});
