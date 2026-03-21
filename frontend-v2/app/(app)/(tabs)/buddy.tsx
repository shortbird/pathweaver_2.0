/**
 * Buddy Page - Animated companion with feeding, tapping, and admin debug controls.
 *
 * Uses the OptioBuddy SVG component with useBuddyState for
 * decay, feeding, and stage evolution logic.
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';
import { useBuddy } from '@/src/hooks/useBuddy';
import OptioBuddy from '@/src/components/buddy/OptioBuddy';
import useBuddyState from '@/src/components/buddy/useBuddyState';
import {
  STAGE_PALETTES,
  DAILY_XP_CAP,
} from '@/src/components/buddy/buddyConstants';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText, Card, Divider,
} from '@/src/components/ui';

// ── Create Buddy Form ──

function CreateBuddyForm({ onCreate, loading: creating }: { onCreate: (name: string) => void; loading: boolean }) {
  const [name, setName] = useState('');

  return (
    <VStack className="items-center px-6" space="lg">
      <OptioBuddy vitality={0.8} bond={0} stage={0} width={250} height={213} />
      <VStack className="items-center" space="sm">
        <Heading size="xl">Adopt Your Buddy</Heading>
        <UIText size="sm" className="text-typo-500 text-center">
          Give your buddy a name and watch it grow as you feed it each day!
        </UIText>
      </VStack>
      <HStack className="w-full max-w-sm gap-3">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name your buddy..."
          maxLength={30}
          className="flex-1 px-4 py-3 border border-surface-200 rounded-lg text-base font-poppins"
          placeholderTextColor="#9CA3AF"
        />
        <Button
          size="lg"
          onPress={() => name.trim() && onCreate(name.trim())}
          disabled={!name.trim() || creating}
          loading={creating}
        >
          <ButtonText>Adopt</ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
}

// ── Buddy View ──

function BuddyView({ buddyData, feedBuddy, tapBuddy, updateBuddy }: {
  buddyData: any;
  feedBuddy: (p: any) => Promise<any>;
  tapBuddy: (p: any) => Promise<any>;
  updateBuddy: (p: any) => Promise<any>;
}) {
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';

  const state = useBuddyState(buddyData);
  const { vitality, bond, stage, feedReaction, tapBurst, isFull, xpFedToday,
    feed, tap, setVitality, setBond, setStage } = state;

  const feedsUsed = Math.floor(xpFedToday / 10);
  const totalDots = Math.floor(DAILY_XP_CAP / 10);

  const handleFeed = useCallback(() => {
    if (feedReaction || (!isSuperadmin && isFull)) return;

    const reactions = ['crunch', 'sweet', 'spicy', 'soupy', 'chewy'] as const;
    const mockFood = {
      id: 'feed',
      name: 'Feed',
      emoji: '',
      type: reactions[Math.floor(Math.random() * reactions.length)],
      xpCost: 10,
      stageUnlock: 0,
      rotation: 'permanent' as const,
    };

    const result = feed(mockFood);
    if (result) {
      feedBuddy({
        food_id: mockFood.id,
        xp_cost: 0,
        new_vitality: result.newVitality,
        new_bond: result.newBond,
        last_interaction: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [feedReaction, isFull, isSuperadmin, feed, feedBuddy]);

  const handleTap = useCallback(() => {
    const result = tap();
    if (result) {
      tapBuddy({
        new_bond: result.newBond,
        last_interaction: new Date().toISOString(),
      });
    }
  }, [tap, tapBuddy]);

  const canFeed = (isSuperadmin || !isFull) && !feedReaction;

  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40 }}>
      {/* Name */}
      <Heading size="xl" className="mt-6">{buddyData.name}</Heading>

      {/* Character */}
      <View className="-my-2">
        <OptioBuddy
          vitality={vitality}
          bond={bond}
          stage={stage}
          onTap={handleTap}
          feedReaction={feedReaction}
          tapBurst={tapBurst}
          width={360}
          height={306}
        />
      </View>

      {/* Feed dots */}
      <HStack className="gap-1.5 mb-4">
        {Array.from({ length: totalDots }).map((_, i) => (
          <View
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${
              i < feedsUsed ? 'bg-optio-purple' : 'bg-surface-200'
            }`}
          />
        ))}
      </HStack>

      {/* Feed button */}
      <Button
        size="lg"
        onPress={handleFeed}
        disabled={!canFeed}
        action={canFeed ? 'primary' : 'secondary'}
      >
        <ButtonText>
          {!isSuperadmin && isFull ? 'Full for today!' : feedReaction ? 'Eating...' : 'Feed'}
        </ButtonText>
      </Button>

      <UIText size="xs" className="text-typo-300 mt-3">
        Tap your buddy to interact!
      </UIText>

      {/* Superadmin debug controls */}
      {isSuperadmin && (
        <View className="w-full max-w-lg mt-8">
          <Card variant="ghost" size="md" className="bg-gray-900 rounded-xl">
            <VStack space="md">
              <HStack className="items-center justify-between">
                <UIText size="xs" className="text-gray-400 font-poppins-medium">
                  SUPERADMIN CONTROLS
                </UIText>
                <Pressable
                  onPress={() => {
                    setStage(0); setVitality(0.8); setBond(0);
                    updateBuddy({
                      stage: 0, highest_stage: 0, vitality: 0.8, bond: 0,
                      total_xp_fed: 0, xp_fed_today: 0,
                    });
                  }}
                  className="px-3 py-1 bg-red-600 rounded"
                >
                  <UIText size="xs" className="text-white font-poppins-medium">Reset to Egg</UIText>
                </Pressable>
              </HStack>

              {/* Sliders (web only -- native range inputs not supported) */}
              {Platform.OS === 'web' && (
                <>
                  {/* Stage */}
                  <VStack space="xs">
                    <HStack className="items-center justify-between">
                      <UIText size="xs" className="text-gray-400">Stage</UIText>
                      <UIText size="xs" className="text-white font-poppins-medium">
                        {stage} ({STAGE_PALETTES[stage]?.name})
                      </UIText>
                    </HStack>
                    <input
                      type="range" min={0} max={6} step={1} value={stage}
                      onChange={(e: any) => {
                        const s = parseInt(e.target.value);
                        setStage(s);
                        updateBuddy({ stage: s, highest_stage: Math.max(buddyData.highest_stage || 0, s) });
                      }}
                      style={{ width: '100%', accentColor: '#6D469B' }}
                    />
                    <HStack className="justify-between">
                      {STAGE_PALETTES.map((p, i) => (
                        <UIText key={i} size="xs" className="text-gray-500" style={{ fontSize: 9 }}>{p.name}</UIText>
                      ))}
                    </HStack>
                  </VStack>

                  {/* Vitality */}
                  <VStack space="xs">
                    <HStack className="items-center justify-between">
                      <UIText size="xs" className="text-gray-400">Vitality</UIText>
                      <UIText size="xs" className="text-white font-poppins-medium">{vitality.toFixed(2)}</UIText>
                    </HStack>
                    <input
                      type="range" min={0} max={1} step={0.01} value={vitality}
                      onChange={(e: any) => {
                        const v = parseFloat(e.target.value);
                        setVitality(v);
                        updateBuddy({ vitality: v });
                      }}
                      style={{ width: '100%', accentColor: '#22C55E' }}
                    />
                    <HStack className="justify-between">
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Sleeping</UIText>
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Tired</UIText>
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Happy</UIText>
                    </HStack>
                  </VStack>

                  {/* Bond */}
                  <VStack space="xs">
                    <HStack className="items-center justify-between">
                      <UIText size="xs" className="text-gray-400">Bond</UIText>
                      <UIText size="xs" className="text-white font-poppins-medium">{bond.toFixed(2)}</UIText>
                    </HStack>
                    <input
                      type="range" min={0} max={1} step={0.01} value={bond}
                      onChange={(e: any) => {
                        const b = parseFloat(e.target.value);
                        setBond(b);
                        updateBuddy({ bond: b });
                      }}
                      style={{ width: '100%', accentColor: '#EC4899' }}
                    />
                    <HStack className="justify-between">
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Shy</UIText>
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Friendly</UIText>
                      <UIText size="xs" className="text-gray-500" style={{ fontSize: 9 }}>Bonded</UIText>
                    </HStack>
                  </VStack>
                </>
              )}

              {/* Quick presets (work on both web and mobile) */}
              <Divider className="bg-gray-700" />
              <HStack className="flex-wrap gap-2">
                <UIText size="xs" className="text-gray-400 self-center mr-1">Presets:</UIText>
                {[
                  { label: 'Sleeping', v: 0.05, b: 0.1, s: 1 },
                  { label: 'Tired', v: 0.3, b: 0.2, s: 2 },
                  { label: 'Content', v: 0.55, b: 0.4, s: 3 },
                  { label: 'Happy', v: 0.8, b: 0.6, s: 4 },
                  { label: 'Thriving', v: 0.95, b: 0.85, s: 5 },
                  { label: 'Legend', v: 1.0, b: 1.0, s: 6 },
                ].map((p) => (
                  <Pressable
                    key={p.label}
                    onPress={() => {
                      setVitality(p.v); setBond(p.b); setStage(p.s);
                      updateBuddy({
                        vitality: p.v, bond: p.b, stage: p.s,
                        highest_stage: Math.max(buddyData.highest_stage || 0, p.s),
                      });
                    }}
                    className="px-2 py-1 bg-gray-700 rounded active:bg-gray-600"
                  >
                    <UIText size="xs" className="text-white">{p.label}</UIText>
                  </Pressable>
                ))}
              </HStack>
            </VStack>
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

// ── Main Page ──

export default function BuddyScreen() {
  const { buddy, loading, createBuddy, feedBuddy, tapBuddy, updateBuddy } = useBuddy();
  const [creating, setCreating] = useState(false);

  const handleCreate = async (name: string) => {
    setCreating(true);
    try { await createBuddy(name); } finally { setCreating(false); }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      {buddy ? (
        <BuddyView
          buddyData={buddy}
          feedBuddy={feedBuddy}
          tapBuddy={tapBuddy}
          updateBuddy={updateBuddy}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <CreateBuddyForm onCreate={handleCreate} loading={creating} />
        </View>
      )}
    </SafeAreaView>
  );
}
