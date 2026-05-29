/**
 * ParentStartSomethingMount - Headless mount for the parent action-sheet
 * stack (ParentStartSomethingSheet + InviteObserverSheet + AddKidSheet).
 *
 * Used to be a floating "+" FAB; that affordance moved to the center tab
 * (Optio logo), which now opens the sheet via
 * useParentStartSomethingStore.open(). This component is mounted once in
 * (tabs)/_layout.tsx so the sheets exist regardless of which tab is active.
 *
 * Exported as `ParentStartSomethingFab` for back-compat with existing
 * imports — the component just no longer renders a visible FAB.
 */

import React, { useState } from 'react';
import { useParentStartSomethingStore } from '@/src/stores/parentStartSomethingStore';
import { useInviteObserverStore } from '@/src/stores/inviteObserverStore';
import { ParentStartSomethingSheet } from '@/src/components/parent/ParentStartSomethingSheet';
import { InviteObserverSheet } from '@/src/components/parent/InviteObserverSheet';
import { AddKidSheet } from '@/src/components/parent/AddKidSheet';

interface ParentStartSomethingFabProps {
  /** Open the parent CaptureSheet (owned by the parent (tabs) layout so it
   *  can use the same capture-sheet instance for the center-tab and the
   *  parent action sheet). */
  onCaptureMoment: () => void;
  /** Called when a new dependent is created so parent surfaces can refresh. */
  onKidAdded?: () => void;
}

export function ParentStartSomethingFab({ onCaptureMoment, onKidAdded }: ParentStartSomethingFabProps) {
  const sheetVisible = useParentStartSomethingStore((s) => s.visible);
  const closeSheet = useParentStartSomethingStore((s) => s.close);
  // InviteObserverSheet is shared — also opened from the Family tab's
  // "Invite observer" row via the store.
  const inviteVisible = useInviteObserverStore((s) => s.visible);
  const openInvite = useInviteObserverStore((s) => s.open);
  const closeInvite = useInviteObserverStore((s) => s.close);
  const [addKidVisible, setAddKidVisible] = useState(false);

  return (
    <>
      <ParentStartSomethingSheet
        visible={sheetVisible}
        onClose={closeSheet}
        onCaptureMoment={onCaptureMoment}
        onInviteObserver={openInvite}
        onAddKid={() => setAddKidVisible(true)}
      />

      <InviteObserverSheet
        visible={inviteVisible}
        onClose={closeInvite}
      />

      <AddKidSheet
        visible={addKidVisible}
        onClose={() => setAddKidVisible(false)}
        onCreated={() => onKidAdded?.()}
      />
    </>
  );
}
