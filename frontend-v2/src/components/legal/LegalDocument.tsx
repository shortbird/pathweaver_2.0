/**
 * Renders a shared LegalDocument (from shared/legal) with React Native
 * components. The document content is the single source of truth shared with
 * the v1 web app; this component only handles mobile presentation.
 * See shared/legal/types.ts.
 */
import React from 'react';
import { ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, Heading, UIText, Card, Divider } from '@/src/components/ui';
import type { LegalBlock, LegalDocument as LegalDocumentType, RichText, InlineNode } from '@legal/types';

function openHref(href: string) {
  if (href.startsWith('/')) {
    router.push(href as never);
  } else {
    Linking.openURL(href).catch(() => {});
  }
}

function Inline({ node }: { node: InlineNode }) {
  if (typeof node === 'string') return <>{node}</>;
  if ('bold' in node) {
    return <UIText className="font-poppins-semibold text-typo-700 dark:text-dark-typo-200">{node.bold}</UIText>;
  }
  return (
    <UIText className="text-optio-purple font-poppins-medium" onPress={() => openHref(node.href)}>
      {node.link}
    </UIText>
  );
}

function InlineText({ value, className }: { value: RichText; className?: string }) {
  const base = className ?? 'text-typo-600 dark:text-dark-typo-300 leading-6';
  if (typeof value === 'string') {
    return <UIText size="sm" className={base}>{value}</UIText>;
  }
  return (
    <UIText size="sm" className={base}>
      {value.map((node, i) => (
        <Inline key={i} node={node} />
      ))}
    </UIText>
  );
}

function BulletList({ items }: { items: RichText[] }) {
  return (
    <VStack space="xs" className="ml-2">
      {items.map((item, i) => (
        <HStack key={i} className="items-start gap-2">
          <UIText size="sm" className="text-optio-purple">•</UIText>
          <InlineText value={item} className="text-typo-600 dark:text-dark-typo-300 leading-6 flex-1" />
        </HStack>
      ))}
    </VStack>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'subheading':
      return <UIText size="sm" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-200">{block.text}</UIText>;
    case 'paragraph':
      return (
        <InlineText
          value={block.text}
          className={`text-typo-600 dark:text-dark-typo-300 leading-6${block.emphasis ? ' font-poppins-semibold' : ''}`}
        />
      );
    case 'list':
      return <BulletList items={block.items} />;
    case 'callout': {
      const tone =
        block.variant === 'success'
          ? 'border-l-4 border-green-400 bg-green-50'
          : 'border-l-4 border-amber-400 bg-amber-50';
      return (
        <Card variant="outline" size="md" className={tone}>
          <VStack space="xs">
            {block.title && (
              <UIText size="sm" className="font-poppins-semibold text-typo-900">{block.title}</UIText>
            )}
            {block.blocks.map((inner, i) => (
              <Block key={i} block={inner} />
            ))}
          </VStack>
        </Card>
      );
    }
    case 'contact':
      return (
        <VStack space="xs" className="ml-2">
          {block.lines.map((line, i) => (
            <InlineText key={i} value={line} className="text-typo-600 dark:text-dark-typo-300" />
          ))}
        </VStack>
      );
    default:
      return null;
  }
}

export default function LegalDocument({ document }: { document: LegalDocumentType }) {
  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 py-6 pb-16" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-3xl w-full md:mx-auto">

          {/* Back button */}
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push('/(auth)/login'))} className="flex-row items-center gap-1">
            <Ionicons name="arrow-back" size={18} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Back</UIText>
          </Pressable>

          <Card variant="elevated" size="lg">
            <VStack space="lg">
              <Heading size="2xl">{document.title}</Heading>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Effective Date: {document.effectiveDate}</UIText>

              <Divider />

              {document.preamble?.map((block, i) => (
                <Block key={`pre-${i}`} block={block} />
              ))}

              {document.sections.map((section, i) => (
                <VStack key={i} space="sm">
                  <Heading size="md">{section.heading}</Heading>
                  {section.blocks.map((block, j) => (
                    <Block key={j} block={block} />
                  ))}
                </VStack>
              ))}
            </VStack>
          </Card>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
