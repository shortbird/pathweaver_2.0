/**
 * Architecture guard: modal overlays must render through a portal.
 *
 * THE BUG THIS PREVENTS
 * A modal backdrop written as a raw `fixed inset-0 ... flex items-center
 * justify-center` div is NOT immune to its ancestors. If any ancestor has a
 * CSS `transform`, `filter`, `perspective`, `contain`, or a running keyframe
 * animation that touches `transform` (this app has several: `animate-fade-in`,
 * `animate-slideUp`, etc.), that ancestor becomes the containing block for
 * `position: fixed`. The backdrop then aligns to the ancestor's box instead of
 * the viewport, and the fixed `TopNavbar` (z-30, its own stacking context)
 * paints over it -- producing the "light strip at the top that the dimmed
 * background doesn't reach." It is intermittent and layout-dependent, which is
 * why it kept recurring.
 *
 * THE FIX
 * Render the overlay through a portal to document.body so it can never be
 * trapped by an ancestor. Use the shared <ModalOverlay> (or <Modal>) from
 * src/components/ui/ -- both portal correctly.
 *
 * HOW THIS GUARD WORKS
 * It scans the source tree for the centered-modal backdrop signature and flags
 * any file that uses it WITHOUT a portal. The known offenders that predate this
 * guard are baselined below. The test fails if:
 *   - a NEW file introduces a non-portaled modal (add the portal, don't baseline it)
 *   - a baselined file is migrated/deleted (remove it from the baseline -- the
 *     list is a ratchet that only shrinks)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

// A centered-modal backdrop: `fixed` + full-viewport anchor + flex centering,
// all within one className string (the [^"'`]* stops at the attribute boundary).
const BACKDROP = /\bfixed\b[^"'`]*\b(?:inset-0|top-0 left-0)\b[^"'`]*\bitems-center\b/
// A file is considered to portal its overlay if it uses any of these.
const PORTAL = /createPortal|ModalOverlay|ui\/Modal['"]/

function sourceFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      sourceFiles(p, acc)
    } else if (/\.(jsx?|tsx?)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      acc.push(p)
    }
  }
  return acc
}

function findOffenders() {
  return sourceFiles(SRC)
    .filter((p) => {
      const c = readFileSync(p, 'utf8')
      return BACKDROP.test(c) && !PORTAL.test(c)
    })
    .map((p) => p.slice(p.indexOf('src/')).replace(/\\/g, '/'))
    .sort()
}

// Pre-existing non-portaled modals. DO NOT ADD to this list -- new modals must
// use <ModalOverlay>. Migrating one of these? Delete its line.
const BASELINE = [
  'src/components/CoursePreview.jsx',
  'src/components/ImageCropModal.jsx',
  'src/components/ReflectionModal.jsx',
  'src/components/SessionConflictOverlay.jsx',
  'src/components/SourcesManager.jsx',
  'src/components/admin/AdminQuests.jsx',
  'src/components/admin/AdvisorTaskForm.jsx',
  'src/components/admin/FlaggedTasksPanel.jsx',
  'src/components/admin/InviteUserModal.jsx',
  'src/components/admin/QuestCreationForm.jsx',
  'src/components/admin/QuestSelectionModal.jsx',
  'src/components/admin/ServiceFormModal.jsx',
  'src/components/admin/UserDetailsModal.jsx',
  'src/components/admin/ai/ReviewQueueTab.jsx',
  'src/components/admin/curriculum-upload/UploadDetailModal.jsx',
  'src/components/advisor/AdvisorNotesModal.jsx',
  'src/components/advisor/CheckinHistoryModal.jsx',
  'src/components/bounty/EvidenceViewerModal.jsx',
  'src/components/classes/CreateCreditClassModal.jsx',
  'src/components/communication/CreateGroupModal.jsx',
  'src/components/communication/GroupSettingsModal.jsx',
  'src/components/consent/ConsentBlockedOverlay.jsx',
  'src/components/course/AIToolsModal.jsx',
  'src/components/course/AddQuestModal.jsx',
  'src/components/course/AddTaskModal.jsx',
  'src/components/course/BulkTaskGenerationModal.jsx',
  'src/components/course/CourseDetailsModal.jsx',
  'src/components/course/LessonEditorModal.jsx',
  'src/components/course/MoveLessonModal.jsx',
  'src/components/course/refine/AIRefineModal.jsx',
  'src/components/credit-dashboard/MergeModal.jsx',
  'src/components/credit-dashboard/ShortcutHelp.jsx',
  'src/components/curriculum/CurriculumView.jsx',
  'src/components/curriculum/LessonHelperModal.jsx',
  'src/components/curriculum/LessonTaskPanel.jsx',
  'src/components/curriculum/LessonViewer.jsx',
  'src/components/curriculum/PhilosophyGuide.jsx',
  'src/components/dashboard/AchievementCelebration.jsx',
  'src/components/diploma/AchievementDetailModal.jsx',
  'src/components/diploma/CreditProgressModal.jsx',
  'src/components/diploma/DiplomaExplanationModal.jsx',
  'src/components/diploma/DiplomaHeader.jsx',
  'src/components/diploma/EvidenceDetailModal.jsx',
  'src/components/diploma/evidence/EvidenceLightbox.jsx',
  'src/components/evidence/EvidenceDisplay.jsx',
  'src/components/evidence/MultiFormatEvidenceEditor.jsx',
  'src/components/evidence/blocks/ImageBlock.jsx',
  'src/components/interest-tracks/CreateTrackModal.jsx',
  'src/components/interest-tracks/EvolveTopicModal.jsx',
  'src/components/interest-tracks/InterestTrackDetail.jsx',
  'src/components/marketing/FreeClassModal.jsx',
  'src/components/marketing/PhilosophyModal.jsx',
  'src/components/notifications/SendNotificationModal.jsx',
  'src/components/organization/CreateUsernameStudentModal.jsx',
  'src/components/organization/OverviewTab.jsx',
  'src/components/organization/PeopleTab.jsx',
  'src/components/organization/SettingsTab.jsx',
  'src/components/organization/UsersTab.jsx',
  'src/components/organization/people/EditUserModal.jsx',
  'src/components/organization/people/InvitationLinksSection.jsx',
  'src/components/overview/QuestAccordionGallery.jsx',
  'src/components/parent/AddChildrenModal.jsx',
  'src/components/parent/RequestStudentConnectionModal.jsx',
  'src/components/quest/QuestCompletionCelebration.jsx',
  'src/components/quest/RestartQuestModal.jsx',
  'src/components/quest/TaskCompletionModal.jsx',
  'src/components/quests/QuestPersonalizationWizard.jsx',
  'src/components/services/ServiceInquiryModal.jsx',
  'src/components/student/QuestIdeaSubmission.jsx',
  'src/components/ui/mobile/MobileModal.jsx',
  'src/components/verification/VerificationModal.jsx',
  'src/pages/QuestDetail.jsx',
  'src/pages/TaskLibraryBrowser.jsx',
  'src/pages/admin/CourseGenerationQueue.jsx',
  'src/pages/admin/CourseGeneratorWizard.jsx',
  'src/pages/admin/OrganizationDashboard.jsx',
  'src/pages/courses/CourseHomepage.jsx',
  'src/pages/curriculum/CurriculumPage.jsx',
]

describe('modal portal guard', () => {
  const offenders = findOffenders()
  const baseline = new Set(BASELINE)

  it('no NEW modal uses a raw fixed-inset backdrop without a portal', () => {
    const added = offenders.filter((f) => !baseline.has(f))
    expect(
      added,
      `\nThese files render a centered modal with a raw "fixed inset-0 ..." backdrop ` +
        `and no portal, so the dimmed background can be trapped by a transformed ` +
        `ancestor (the "light strip at the top" bug).\nWrap the overlay in ` +
        `<ModalOverlay onClose={...}> from src/components/ui/ModalOverlay.jsx ` +
        `(it portals to document.body):\n  ${added.join('\n  ')}\n`
    ).toEqual([])
  })

  it('baseline has no stale entries (migrated/deleted files must be removed)', () => {
    const offenderSet = new Set(offenders)
    const stale = BASELINE.filter((f) => !offenderSet.has(f))
    expect(
      stale,
      `\nThese files are in the modal-portal baseline but no longer match the ` +
        `non-portaled pattern (nice -- they were migrated or removed). Delete ` +
        `them from BASELINE in this test so the ratchet can't slip back:\n  ${stale.join('\n  ')}\n`
    ).toEqual([])
  })
})
