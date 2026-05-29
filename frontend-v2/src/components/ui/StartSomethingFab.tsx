/**
 * StartSomethingMount - Headless mount for the student "Start something new"
 * sheet stack (StartSomethingSheet + CreateQuestSheet + CreateClassSheet).
 *
 * Used to be a floating "+" FAB; that affordance moved to the center tab
 * (Optio logo), which now opens the sheet via useStartSomethingStore.open().
 * This component is mounted once in (tabs)/_layout.tsx so the sheets exist
 * regardless of which tab is active.
 *
 * Exported as `StartSomethingFab` for back-compat with existing imports —
 * the component just no longer renders a visible FAB.
 */

import React, { useState } from 'react';
import { useAuthStore } from '@/src/stores/authStore';
import { useStartSomethingStore } from '@/src/stores/startSomethingStore';
import { StartSomethingSheet } from '@/src/components/journal/StartSomethingSheet';
import { CreateQuestSheet } from '@/src/components/journal/CreateQuestSheet';
import { CreateClassSheet } from '@/src/components/class/CreateClassSheet';

interface StartSomethingFabProps {
  /** Open the parent-owned CaptureSheet — wired by (tabs)/_layout.tsx since
   *  the CaptureSheet's state lives there (so the center-tab tap and this
   *  mount both open the same sheet). */
  onCaptureMoment: () => void;
  /** Fires whenever a quest or class was just created — gives parent screens
   *  a chance to refetch their list. Optional. */
  onCreated?: () => void;
}

function computeCanStartClass(user: any): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  const dob = user.date_of_birth;
  if (!dob) return false;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 13;
}

export function StartSomethingFab({ onCaptureMoment, onCreated }: StartSomethingFabProps) {
  const user = useAuthStore((s) => s.user);
  const sheetVisible = useStartSomethingStore((s) => s.visible);
  const closeSheet = useStartSomethingStore((s) => s.close);
  const [questSheetVisible, setQuestSheetVisible] = useState(false);
  const [classSheetVisible, setClassSheetVisible] = useState(false);
  const canStartClass = computeCanStartClass(user);

  return (
    <>
      <StartSomethingSheet
        visible={sheetVisible}
        onClose={closeSheet}
        canStartClass={canStartClass}
        onCaptureMoment={onCaptureMoment}
        onCreateQuest={() => setQuestSheetVisible(true)}
        onStartClass={() => setClassSheetVisible(true)}
      />

      <CreateQuestSheet
        visible={questSheetVisible}
        onClose={() => setQuestSheetVisible(false)}
        onCreated={() => { onCreated?.(); }}
      />

      <CreateClassSheet
        visible={classSheetVisible}
        onClose={() => setClassSheetVisible(false)}
        onCreated={() => { onCreated?.(); }}
      />
    </>
  );
}
