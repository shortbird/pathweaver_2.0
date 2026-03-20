/**
 * UI Test Screen - Showcases Gluestack-style components with NativeWind.
 * Navigate here via the "UITest" stack route to preview the design system.
 */

import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { VStack } from '../components/ui/vstack';
import { HStack } from '../components/ui/hstack';
import { Center } from '../components/ui/center';
import { Heading } from '../components/ui/heading';
import { UIText } from '../components/ui/text';
import { Button, ButtonText } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input, InputField, InputSlot, InputIcon } from '../components/ui/input';
import { Badge, BadgeText } from '../components/ui/badge';
import { Divider } from '../components/ui/divider';
import { Avatar, AvatarFallbackText } from '../components/ui/avatar';

export function UITestScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="pb-12">
        <VStack className="px-5 pt-6" space="lg">

          {/* Header */}
          <HStack className="items-center justify-between">
            <VStack>
              <Heading size="2xl">UI Test</Heading>
              <UIText size="sm" className="text-typography-500">
                Gluestack + NativeWind Demo
              </UIText>
            </VStack>
            <Button variant="outline" size="sm" onPress={() => navigation.goBack()}>
              <ButtonText>Back</ButtonText>
            </Button>
          </HStack>

          <Divider />

          {/* ── SECTION: Login Card ── */}
          <Heading size="md">Login Form</Heading>
          <Card variant="elevated" size="lg">
            <VStack space="md">
              <Heading size="lg">Welcome Back</Heading>
              <UIText size="sm" className="text-typography-500">
                Sign in to continue your learning journey
              </UIText>

              <VStack space="sm">
                <UIText size="sm" className="font-poppins-medium">Email</UIText>
                <Input>
                  <InputSlot className="ml-1">
                    <InputIcon as="mail-outline" />
                  </InputSlot>
                  <InputField
                    placeholder="student@optio.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </Input>
              </VStack>

              <VStack space="sm">
                <UIText size="sm" className="font-poppins-medium">Password</UIText>
                <Input>
                  <InputField
                    placeholder="Enter password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <InputSlot
                    className="mr-1"
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <InputIcon as={showPassword ? 'eye-off-outline' : 'eye-outline'} />
                  </InputSlot>
                </Input>
              </VStack>

              <Button size="lg" className="mt-2">
                <ButtonText>Sign In</ButtonText>
              </Button>

              <Button variant="link" size="sm">
                <ButtonText>Forgot Password?</ButtonText>
              </Button>
            </VStack>
          </Card>

          <Divider />

          {/* ── SECTION: Quest Cards ── */}
          <Heading size="md">Quest Cards</Heading>

          <Card variant="elevated" size="md">
            <HStack className="items-start gap-3">
              <View className="w-16 h-16 rounded-xl bg-optio-purple/10 items-center justify-center">
                <Ionicons name="rocket-outline" size={28} color="#6D469B" />
              </View>
              <VStack className="flex-1" space="xs">
                <HStack className="items-center justify-between">
                  <Heading size="sm">Build a Portfolio</Heading>
                  <Badge action="success">
                    <BadgeText className="text-green-700">Active</BadgeText>
                  </Badge>
                </HStack>
                <UIText size="sm" className="text-typography-500">
                  Create a personal portfolio showcasing your best work
                </UIText>
                <HStack className="items-center gap-4 mt-1">
                  <HStack className="items-center gap-1">
                    <Ionicons name="star" size={14} color="#FF9028" />
                    <UIText size="xs" className="text-typography-400">250 XP</UIText>
                  </HStack>
                  <HStack className="items-center gap-1">
                    <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                    <UIText size="xs" className="text-typography-400">3 tasks</UIText>
                  </HStack>
                </HStack>
              </VStack>
            </HStack>
          </Card>

          <Card variant="outline" size="md">
            <HStack className="items-start gap-3">
              <View className="w-16 h-16 rounded-xl bg-optio-pink/10 items-center justify-center">
                <Ionicons name="color-palette-outline" size={28} color="#EF597B" />
              </View>
              <VStack className="flex-1" space="xs">
                <HStack className="items-center justify-between">
                  <Heading size="sm">Digital Art Basics</Heading>
                  <Badge action="info">
                    <BadgeText className="text-blue-700">New</BadgeText>
                  </Badge>
                </HStack>
                <UIText size="sm" className="text-typography-500">
                  Learn the fundamentals of digital illustration
                </UIText>
                <HStack className="items-center gap-4 mt-1">
                  <HStack className="items-center gap-1">
                    <Ionicons name="star" size={14} color="#FF9028" />
                    <UIText size="xs" className="text-typography-400">180 XP</UIText>
                  </HStack>
                  <HStack className="items-center gap-1">
                    <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                    <UIText size="xs" className="text-typography-400">5 tasks</UIText>
                  </HStack>
                </HStack>
              </VStack>
            </HStack>
          </Card>

          <Divider />

          {/* ── SECTION: Buttons ── */}
          <Heading size="md">Buttons</Heading>

          <Card variant="filled" size="md">
            <VStack space="sm">
              <UIText size="sm" className="font-poppins-medium text-typography-500">
                Solid Variants
              </UIText>
              <HStack space="sm" className="flex-wrap">
                <Button action="primary" size="md">
                  <ButtonText>Primary</ButtonText>
                </Button>
                <Button action="secondary" size="md">
                  <ButtonText>Secondary</ButtonText>
                </Button>
                <Button action="positive" size="md">
                  <ButtonText>Positive</ButtonText>
                </Button>
                <Button action="negative" size="md">
                  <ButtonText>Negative</ButtonText>
                </Button>
              </HStack>

              <UIText size="sm" className="font-poppins-medium text-typography-500 mt-2">
                Outline Variants
              </UIText>
              <HStack space="sm" className="flex-wrap">
                <Button variant="outline" action="primary" size="md">
                  <ButtonText>Primary</ButtonText>
                </Button>
                <Button variant="outline" action="secondary" size="md">
                  <ButtonText>Secondary</ButtonText>
                </Button>
                <Button variant="outline" action="negative" size="md">
                  <ButtonText>Danger</ButtonText>
                </Button>
              </HStack>

              <UIText size="sm" className="font-poppins-medium text-typography-500 mt-2">
                Sizes
              </UIText>
              <HStack space="sm" className="items-center flex-wrap">
                <Button size="xs">
                  <ButtonText>XS</ButtonText>
                </Button>
                <Button size="sm">
                  <ButtonText>SM</ButtonText>
                </Button>
                <Button size="md">
                  <ButtonText>MD</ButtonText>
                </Button>
                <Button size="lg">
                  <ButtonText>LG</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </Card>

          <Divider />

          {/* ── SECTION: Inputs ── */}
          <Heading size="md">Input Variants</Heading>

          <Card variant="elevated" size="md">
            <VStack space="md">
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Outline (default)</UIText>
                <Input variant="outline">
                  <InputField placeholder="Type something..." />
                </Input>
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Rounded with icon</UIText>
                <Input variant="rounded">
                  <InputSlot className="ml-2">
                    <InputIcon as="search-outline" />
                  </InputSlot>
                  <InputField placeholder="Search quests..." />
                </Input>
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Underlined</UIText>
                <Input variant="underlined">
                  <InputField placeholder="Minimal style" />
                </Input>
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium text-red-500">Invalid state</UIText>
                <Input variant="outline" isInvalid>
                  <InputField placeholder="Something went wrong" />
                </Input>
              </VStack>
            </VStack>
          </Card>

          <Divider />

          {/* ── SECTION: Pillar Badges ── */}
          <Heading size="md">Pillar Badges</Heading>

          <Card variant="elevated" size="md">
            <HStack space="sm" className="flex-wrap">
              <View className="bg-pillar-stem/15 px-3 py-1.5 rounded-full">
                <UIText size="xs" className="text-pillar-stem font-poppins-semibold">STEM</UIText>
              </View>
              <View className="bg-pillar-art/15 px-3 py-1.5 rounded-full">
                <UIText size="xs" className="text-pillar-art font-poppins-semibold">Art</UIText>
              </View>
              <View className="bg-pillar-communication/15 px-3 py-1.5 rounded-full">
                <UIText size="xs" className="text-pillar-communication font-poppins-semibold">Communication</UIText>
              </View>
              <View className="bg-pillar-civics/15 px-3 py-1.5 rounded-full">
                <UIText size="xs" className="text-pillar-civics font-poppins-semibold">Civics</UIText>
              </View>
              <View className="bg-pillar-wellness/15 px-3 py-1.5 rounded-full">
                <UIText size="xs" className="text-pillar-wellness font-poppins-semibold">Wellness</UIText>
              </View>
            </HStack>
          </Card>

          <Divider />

          {/* ── SECTION: Profile Preview ── */}
          <Heading size="md">Profile Card</Heading>

          <Card variant="elevated" size="lg">
            <HStack className="items-center gap-4">
              <Avatar size="lg">
                <AvatarFallbackText>JB</AvatarFallbackText>
              </Avatar>
              <VStack className="flex-1">
                <Heading size="md">Jane Bowman</Heading>
                <UIText size="sm" className="text-typography-500">Level 12 Explorer</UIText>
                <HStack className="items-center gap-2 mt-1">
                  <Ionicons name="star" size={16} color="#FF9028" />
                  <UIText size="sm" className="text-typography-400 font-poppins-medium">2,450 XP</UIText>
                </HStack>
              </VStack>
              <Button variant="outline" size="sm">
                <ButtonText>Edit</ButtonText>
              </Button>
            </HStack>

            <Divider className="my-4" />

            {/* Stats row */}
            <HStack className="justify-around">
              <Center>
                <UIText size="lg" className="font-poppins-bold text-optio-purple">12</UIText>
                <UIText size="xs" className="text-typography-400">Quests</UIText>
              </Center>
              <Center>
                <UIText size="lg" className="font-poppins-bold text-optio-pink">48</UIText>
                <UIText size="xs" className="text-typography-400">Tasks</UIText>
              </Center>
              <Center>
                <UIText size="lg" className="font-poppins-bold text-pillar-stem">5</UIText>
                <UIText size="xs" className="text-typography-400">Badges</UIText>
              </Center>
            </HStack>
          </Card>

          <Divider />

          {/* ── SECTION: Card Variants ── */}
          <Heading size="md">Card Variants</Heading>

          <Card variant="elevated" size="sm">
            <UIText size="sm" className="font-poppins-medium">Elevated (shadow)</UIText>
          </Card>

          <Card variant="outline" size="sm">
            <UIText size="sm" className="font-poppins-medium">Outline (border)</UIText>
          </Card>

          <Card variant="filled" size="sm">
            <UIText size="sm" className="font-poppins-medium">Filled (gray background)</UIText>
          </Card>

          <Card variant="ghost" size="sm">
            <UIText size="sm" className="font-poppins-medium">Ghost (no decoration)</UIText>
          </Card>

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
