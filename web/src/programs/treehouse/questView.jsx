/**
 * Treehouse quest-view contributions for core QuestDetail (program module).
 *
 * Core QuestDetail asks the registry (`useProgramQuestView`) for program-specific
 * quest-page UI + behavior; Treehouse plugs its "signal bar" and simplified task
 * view in here, so core carries no Treehouse rendering. See
 * docs/ARCHITECTURE_CORE_AND_PROGRAMS.md.
 */
import React, { Suspense, lazy } from 'react'
import { useTreehouseProfile } from './useTreehouseProfile'
import TreehouseSignalBar from './TreehouseSignalBar'

const TreehouseSimpleTasks = lazy(() => import('./TreehouseSimpleTasks'))

const Loading = () => <div className="p-8 text-center text-gray-400">Loading…</div>

/**
 * Treehouse quest-view contributions (inert for non-Treehouse users):
 *   - suppressAutoWizard: Treehouse task-gen is opt-in (no auto wizard on enroll)
 *   - signalBar: help/proud buttons for Treehouse students (not facilitators)
 *   - simpleTasksView: big-button task view for young ("simplified") learners
 */
export function useTreehouseQuestView(quest) {
  const treehouse = useTreehouseProfile();
  return {
    suppressAutoWizard: treehouse.isMember,
    signalBar: (treehouse.isMember && !treehouse.isFacilitator)
      ? <TreehouseSignalBar questId={quest?.id} />
      : null,
    simpleTasksView: treehouse.simplified ? (
      <div className="bg-white rounded-xl shadow-md overflow-hidden min-h-[400px]">
        <Suspense fallback={<Loading />}>
          <TreehouseSimpleTasks tasks={quest?.quest_tasks} questId={quest?.id} />
        </Suspense>
      </div>
    ) : null,
  };
}
