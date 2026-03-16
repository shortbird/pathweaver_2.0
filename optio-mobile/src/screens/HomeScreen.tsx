/**
 * Home Screen - Yeti companion + quick action buttons.
 *
 * Shows the Yeti pet (Rive animation placeholder for now),
 * Spendable XP balance, and quick capture buttons.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { tokens } from '../theme/tokens';
import { GlassCard } from '../components/common/GlassCard';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

interface YetiPet {
  id: string;
  name: string;
  hunger: number;
  happiness: number;
  energy: number;
  spendable_xp: number;
}

export function HomeScreen() {
  const { user, logout } = useAuthStore();
  const [pet, setPet] = useState<YetiPet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPet();
  }, []);

  const loadPet = async () => {
    try {
      const response = await api.get('/api/yeti/my-pet');
      setPet(response.data.pet);
    } catch {
      // No pet yet - that's ok
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={tokens.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Hey, {user?.display_name || 'there'}
        </Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {pet ? (
        <GlassCard style={styles.yetiCard}>
          <Text style={styles.yetiName}>{pet.name}</Text>
          <View style={styles.statsRow}>
            <StatBar label="Hunger" value={pet.hunger} color={tokens.colors.pillars.wellness} />
            <StatBar label="Happy" value={pet.happiness} color={tokens.colors.pillars.art} />
            <StatBar label="Energy" value={pet.energy} color={tokens.colors.pillars.stem} />
          </View>
          <Text style={styles.xpBalance}>{pet.spendable_xp} XP to spend</Text>
        </GlassCard>
      ) : (
        <GlassCard style={styles.yetiCard}>
          <Text style={styles.noPetText}>You don't have a Yeti yet!</Text>
          <TouchableOpacity style={styles.createButton}>
            <Text style={styles.createButtonText}>Create Your Yeti</Text>
          </TouchableOpacity>
        </GlassCard>
      )}

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Capture</Text>
        <View style={styles.actionRow}>
          <ActionButton label="Photo" icon="📷" color={tokens.colors.pillars.art} />
          <ActionButton label="Voice" icon="🎤" color={tokens.colors.pillars.communication} />
          <ActionButton label="Text" icon="✏️" color={tokens.colors.pillars.stem} />
        </View>
      </View>
    </View>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statContainer}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statBarBg}>
        <View style={[styles.statBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, icon, color }: { label: string; icon: string; color: string }) {
  return (
    <TouchableOpacity style={[styles.actionButton, { borderColor: color }]}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
    paddingTop: 60,
    paddingHorizontal: tokens.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing.lg,
  },
  greeting: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.text,
  },
  logoutText: {
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
  },
  yetiCard: {
    marginBottom: tokens.spacing.lg,
  },
  yetiName: {
    fontSize: tokens.typography.sizes.xxl,
    fontWeight: tokens.typography.weights.bold,
    color: tokens.colors.primary,
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  statsRow: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  statContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  statLabel: {
    width: 55,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.textSecondary,
  },
  statBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: tokens.colors.border,
    borderRadius: tokens.radius.full,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    borderRadius: tokens.radius.full,
  },
  statValue: {
    width: 30,
    fontSize: tokens.typography.sizes.sm,
    color: tokens.colors.text,
    textAlign: 'right',
  },
  xpBalance: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.accent,
    textAlign: 'center',
  },
  noPetText: {
    fontSize: tokens.typography.sizes.lg,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
    marginBottom: tokens.spacing.md,
  },
  createButton: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
  },
  quickActions: {
    marginBottom: tokens.spacing.lg,
  },
  sectionTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontWeight: tokens.typography.weights.semiBold,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  actionButton: {
    flex: 1,
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    ...tokens.shadows.sm,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: tokens.spacing.xs,
  },
  actionLabel: {
    fontSize: tokens.typography.sizes.sm,
    fontWeight: tokens.typography.weights.medium,
    color: tokens.colors.text,
  },
});
