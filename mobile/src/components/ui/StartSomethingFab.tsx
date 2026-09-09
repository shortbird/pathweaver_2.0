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
import { AddBirthdaySheet } from '@/src/components/class/AddBirthdaySheet';

interface StartSomethingFabProps {
  /** Open the parent-owned CaptureSheet — wired by (tabs)/_layout.tsx since
   *  the CaptureSheet's state lives there (so the center-tab tap and this
   *  mount both open the same sheet). */
  onCaptureMoment: () => void;
  /** Fires whenever a quest or class was just created — gives parent screens
   *  a chance to refetch their list. Optional. */
  onCreated?: () => void;
}

// 'needs-dob' still shows the row: a missing birthday shouldn't silently lock
// an eligible student out — tapping it explains how to unlock instead.
type ClassGate = 'ok' | 'needs-dob' | 'under-13';

function computeClassGate(user: any): ClassGate {
  if (!user) return 'under-13';
  if (user.role === 'superadmin') return 'ok';
  const dob = user.date_of_birth;
  if (!dob) return 'needs-dob';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 'needs-dob';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 13 ? 'ok' : 'under-13';
}

export function StartSomethingFab({ onCaptureMoment, onCreated }: StartSomethingFabProps) {
  const user = useAuthStore((s) => s.user);
  const sheetVisible = useStartSomethingStore((s) => s.visible);
  const closeSheet = useStartSomethingStore((s) => s.close);
  // CreateQuestSheet visibility lives in the store so the Quests page's
  // "Create your own quest" button can open this same mounted sheet.
  const questSheetVisible = useStartSomethingStore((s) => s.createQuestVisible);
  const closeQuestSheet = useStartSomethingStore((s) => s.closeCreateQuest);
  const [classSheetVisible, setClassSheetVisible] = useState(false);
  const [birthdaySheetVisible, setBirthdaySheetVisible] = useState(false);
  const classGate = computeClassGate(user);

  return (
    <>
      <StartSomethingSheet
        visible={sheetVisible}
        onClose={closeSheet}
        canStartClass={classGate !== 'under-13'}
        onCaptureMoment={onCaptureMoment}
        onStartClass={() => {
          if (classGate === 'needs-dob') setBirthdaySheetVisible(true);
          else setClassSheetVisible(true);
        }}
      />

      <AddBirthdaySheet
        visible={birthdaySheetVisible}
        onClose={() => setBirthdaySheetVisible(false)}
        // The backend rejects a self-service DOB under 13, so a successful
        // save means the class gate now passes — continue straight in.
        onSaved={() => setClassSheetVisible(true)}
      />

      <CreateQuestSheet
        visible={questSheetVisible}
        onClose={closeQuestSheet}
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
