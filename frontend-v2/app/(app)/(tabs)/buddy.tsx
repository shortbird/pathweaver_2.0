/**
 * Buddy - Learning companion pet system.
 */

import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBuddy } from '@/src/hooks/useBuddy';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Input, InputField, Center, Badge, BadgeText, Skeleton,
} from '@/src/components/ui';

const stageNames = ['Egg', 'Hatchling', 'Sprout', 'Explorer', 'Adventurer', 'Champion', 'Legend'];
const stageIcons: (keyof typeof Ionicons.glyphMap)[] = [
  'ellipse', 'sunny-outline', 'leaf-outline', 'walk-outline',
  'compass-outline', 'shield-outline', 'diamond-outline',
];

function VitalityBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <VStack space="xs">
      <HStack className="items-center justify-between">
        <UIText size="xs" className="font-poppins-medium text-typo-500">{label}</UIText>
        <UIText size="xs" className="text-typo-400">{percent}%</UIText>
      </HStack>
      <View className="h-2.5 bg-surface-200 rounded-full overflow-hidden">
        <View className="h-full rounded-full bg-optio-purple" style={{ width: `${percent}%` }} />
      </View>
    </VStack>
  );
}

function FeedDots({ fed, max }: { fed: number; max: number }) {
  return (
    <HStack className="items-center gap-1.5">
      {Array.from({ length: max }).map((_, i) => (
        <View key={i} className={`w-3 h-3 rounded-full ${i < fed ? 'bg-optio-purple' : 'bg-surface-200'}`} />
      ))}
    </HStack>
  );
}

function CreateBuddyForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try { await onCreate(name.trim()); } finally { setLoading(false); }
  };

  return (
    <Center className="flex-1 px-6">
      <Card variant="elevated" size="lg" className="w-full max-w-sm">
        <VStack space="lg" className="items-center">
          <View className="w-24 h-24 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="heart" size={40} color="#6D469B" />
          </View>
          <VStack space="xs" className="items-center">
            <Heading size="lg">Adopt a Buddy</Heading>
            <UIText size="sm" className="text-typo-500 text-center">
              Your buddy grows as you learn. Feed it XP and watch it evolve!
            </UIText>
          </VStack>
          <Input size="lg" className="w-full">
            <InputField placeholder="Name your buddy" value={name} onChangeText={setName} autoCapitalize="words" />
          </Input>
          <Button size="lg" className="w-full" onPress={handleCreate} loading={loading} disabled={!name.trim()}>
            <ButtonText>Adopt</ButtonText>
          </Button>
        </VStack>
      </Card>
    </Center>
  );
}

export default function BuddyScreen() {
  const { buddy, loading, createBuddy, feedBuddy, tapBuddy } = useBuddy();
  const [feeding, setFeeding] = useState(false);

  const handleFeed = async () => {
    setFeeding(true);
    try { await feedBuddy(); } catch {} finally { setFeeding(false); }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <Center className="flex-1">
          <Skeleton className="w-48 h-48 rounded-full" />
          <Skeleton className="w-32 h-6 mt-4 rounded" />
        </Center>
      </SafeAreaView>
    );
  }

  if (!buddy) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <CreateBuddyForm onCreate={createBuddy} />
      </SafeAreaView>
    );
  }

  const stage = buddy.stage || 0;
  const maxFeeds = 8;
  const fedToday = buddy.xp_fed_today || 0;
  const canFeed = fedToday < maxFeeds;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <View className="flex-1 px-5 md:px-8 pt-6 pb-12 max-w-lg w-full md:mx-auto">
        <VStack space="lg" className="flex-1">
          <Center className="flex-1">
            <Pressable onPress={tapBuddy} className="active:scale-95">
              <View className="w-48 h-48 rounded-full bg-optio-purple/10 items-center justify-center">
                <Ionicons name={stageIcons[stage] || 'ellipse'} size={80} color="#6D469B" />
              </View>
            </Pressable>
            <Heading size="xl" className="mt-4">{buddy.name}</Heading>
            <HStack className="items-center gap-2 mt-1">
              <Badge action="info"><BadgeText className="text-blue-700">{stageNames[stage] || 'Unknown'}</BadgeText></Badge>
              <UIText size="xs" className="text-typo-400">Stage {stage + 1}/7</UIText>
            </HStack>
            <UIText size="xs" className="text-typo-400 mt-2">Tap your buddy to interact!</UIText>
          </Center>

          <Card variant="elevated" size="md">
            <VStack space="md">
              <VitalityBar value={buddy.vitality} label="Vitality" />
              <VitalityBar value={buddy.bond} label="Bond" />
            </VStack>
          </Card>

          <Card variant="elevated" size="md">
            <VStack space="sm" className="items-center">
              <UIText size="sm" className="font-poppins-medium">Daily Feeds</UIText>
              <FeedDots fed={fedToday} max={maxFeeds} />
              <UIText size="xs" className="text-typo-400">
                {canFeed ? `${maxFeeds - fedToday} feeds remaining today` : 'Come back tomorrow!'}
              </UIText>
              <Button size="md" onPress={handleFeed} loading={feeding} disabled={!canFeed} className="w-full mt-2">
                <ButtonText>{canFeed ? 'Feed Buddy' : 'Daily Limit Reached'}</ButtonText>
              </Button>
            </VStack>
          </Card>

          <HStack className="justify-around">
            <VStack className="items-center">
              <UIText size="lg" className="font-poppins-bold text-optio-purple">{(buddy.total_xp_fed || 0).toLocaleString()}</UIText>
              <UIText size="xs" className="text-typo-400">Total XP Fed</UIText>
            </VStack>
            <VStack className="items-center">
              <UIText size="lg" className="font-poppins-bold text-optio-pink">{buddy.highest_stage + 1}</UIText>
              <UIText size="xs" className="text-typo-400">Highest Stage</UIText>
            </VStack>
          </HStack>
        </VStack>
      </View>
    </SafeAreaView>
  );
}
