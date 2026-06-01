/**
 * PathwayCard - one OEA diploma pathway in the selection comparison view (PRD 4.2).
 *
 * Shows the credit split (foundation vs elective vs total), description, who it's
 * best for, and the per-subject requirement breakdown. Selectable; the current
 * selection is highlighted with the Optio purple border.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Button, ButtonText } from '@/src/components/ui';
import type { Pathway } from './types';

interface PathwayCardProps {
  pathway: Pathway;
  selected: boolean;
  saving?: boolean;
  onSelect: (key: Pathway['key']) => void;
}

function CreditPill({ label, value }: { label: string; value: number }) {
  return (
    <View className="items-center px-3 py-2 rounded-lg bg-surface-100">
      <UIText size="lg" className="font-poppins-bold text-typo">{value}</UIText>
      <UIText size="xs" className="text-typo-500">{label}</UIText>
    </View>
  );
}

export function PathwayCard({ pathway, selected, saving, onSelect }: PathwayCardProps) {
  return (
    <Pressable
      onPress={() => onSelect(pathway.key)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`rounded-2xl border bg-white p-5 ${
        selected ? 'border-optio-purple' : 'border-surface-200'
      }`}
    >
      <VStack space="md">
        <HStack className="items-start justify-between">
          <View className="flex-1 pr-3">
            <UIText size="lg" className="font-poppins-bold text-typo">{pathway.name}</UIText>
            <UIText size="sm" className="text-optio-purple font-poppins-medium">{pathway.tagline}</UIText>
          </View>
          {selected && (
            <View className="w-6 h-6 rounded-full bg-optio-purple items-center justify-center">
              <Ionicons name="checkmark" size={16} color="white" />
            </View>
          )}
        </HStack>

        <HStack space="sm">
          <CreditPill label="Foundation" value={pathway.foundation_credits} />
          <CreditPill label="Elective" value={pathway.elective_credits} />
          <CreditPill label="Total" value={pathway.total_credits} />
        </HStack>

        <UIText size="sm" className="text-typo-600">{pathway.description}</UIText>

        <View className="bg-surface-50 rounded-lg p-3">
          <UIText size="xs" className="font-poppins-semibold text-typo-500 mb-1">BEST FOR</UIText>
          <UIText size="sm" className="text-typo-700">{pathway.best_for}</UIText>
        </View>

        <VStack space="xs">
          <UIText size="xs" className="font-poppins-semibold text-typo-500">REQUIREMENTS</UIText>
          {pathway.requirements.map((r) => (
            <HStack key={r.key} className="items-center justify-between py-1">
              <HStack className="items-center" space="xs">
                <View className={`w-2 h-2 rounded-full ${
                  r.category === 'foundation' ? 'bg-optio-purple' : 'bg-optio-pink'
                }`} />
                <UIText size="sm" className="text-typo-700">{r.label}</UIText>
              </HStack>
              <UIText size="sm" className="font-poppins-medium text-typo">
                {r.credits} {r.credits === 1 ? 'credit' : 'credits'}
              </UIText>
            </HStack>
          ))}
        </VStack>

        <Button
          size="md"
          variant={selected ? 'solid' : 'outline'}
          onPress={() => onSelect(pathway.key)}
          loading={!!saving && selected}
          disabled={!!saving}
        >
          <ButtonText>{selected ? 'Selected pathway' : 'Choose this pathway'}</ButtonText>
        </Button>
      </VStack>
    </Pressable>
  );
}
