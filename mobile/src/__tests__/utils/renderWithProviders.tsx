/**
 * Test render utility - wraps components in necessary providers.
 *
 * Zustand doesn't need a Provider (singleton store), so this is
 * mainly for SafeArea and any future provider wrapping.
 */

import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { View } from 'react-native';

function AllProviders({ children }: { children: React.ReactNode }) {
  return <View testID="test-root">{children}</View>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from RNTL for convenience
export { screen, fireEvent, waitFor, act, within } from '@testing-library/react-native';
export { renderHook } from '@testing-library/react-native';
