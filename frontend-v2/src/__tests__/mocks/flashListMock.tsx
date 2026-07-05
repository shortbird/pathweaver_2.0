/**
 * Jest stub for @shopify/flash-list.
 *
 * The real FlashList defers rendering until it has measured a layout size, which
 * never happens in the Jest environment, so it renders no items. This stub is a
 * plain list that eagerly renders the header, every item (with separators), and
 * the empty/footer slots so screen tests can assert on rendered content.
 *
 * Wired up via `moduleNameMapper` in jest.config.js rather than an inline
 * jest.mock() factory: jest-hoist lifts a mock factory above NativeWind's
 * Babel-injected `_ReactNativeCSSInterop` helper, which throws "Invalid variable
 * access". As an ordinary module this transforms normally.
 */

import React from 'react';
import { View } from 'react-native';

type Slot = React.ComponentType<any> | React.ReactElement | null | undefined;

function renderSlot(slot: Slot) {
  if (!slot) return null;
  if (React.isValidElement(slot)) return slot;
  const C = slot as React.ComponentType<any>;
  return <C />;
}

export function FlashList({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
}: any) {
  const items = Array.isArray(data) ? data : [];
  return (
    <View>
      {renderSlot(ListHeaderComponent)}
      {items.length === 0
        ? renderSlot(ListEmptyComponent)
        : items.map((item: any, index: number) => (
            <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
              {index > 0 ? renderSlot(ItemSeparatorComponent) : null}
              {renderItem ? renderItem({ item, index }) : null}
            </React.Fragment>
          ))}
      {renderSlot(ListFooterComponent)}
    </View>
  );
}

export default { FlashList };
