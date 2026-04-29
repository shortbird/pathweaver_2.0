/**
 * Generic error UX inside the iframe. We never link out — the parent is
 * Canvas and clicking "go to optio.com" inside an iframe is a worse UX
 * than just telling the teacher/student to relaunch from Canvas.
 */

import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { VStack, UIText } from '@/src/components/ui';

const MESSAGES: Record<string, string> = {
  no_target: 'No Optio quest is associated with this Canvas item yet. The teacher needs to add one via "+ External Tool" → Optio.',
  expired: 'This launch session has expired. Reload the page in Canvas to start over.',
  default: 'Something went wrong with this launch. Reload the page in Canvas to try again.',
};

export default function LtiError() {
  const params = useLocalSearchParams<{ reason?: string }>();
  const message = MESSAGES[params.reason || 'default'] || MESSAGES.default;

  return (
    <View className="flex-1 items-center justify-center px-6">
      <VStack space="md" className="items-center max-w-md">
        <UIText size="lg" className="font-poppins-semibold text-typo-900 text-center">
          We can't load this Optio assignment
        </UIText>
        <UIText size="sm" className="text-typo-500 text-center">
          {message}
        </UIText>
      </VStack>
    </View>
  );
}
