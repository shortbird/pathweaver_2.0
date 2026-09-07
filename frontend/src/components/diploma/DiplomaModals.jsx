// Every modal the portfolio can open, in one place. They were a 55-line stack
// at the bottom of the page's render, each one a line of state on the page --
// which is still where the state lives, because opening them is the page's job.
import React from 'react';

import CreditProgressModal from './CreditProgressModal';
import EvidenceDetailModal from './EvidenceDetailModal';
import AchievementDetailModal from './AchievementDetailModal';
import DiplomaExplanationModal from './DiplomaExplanationModal';
import AccreditedDiplomaModal from './AccreditedDiplomaModal';
import PublicConsentModal from './PublicConsentModal';

const DiplomaModals = ({
  getStudentFirstName, handleConsentConfirm, isOwner, pendingSubjectXP,
  privacyLoading, selectedAchievement, setSelectedAchievement,
  selectedEvidenceItem, setSelectedEvidenceItem,
  setShowAccreditedDiplomaModal, setShowConsentModal, setShowDiplomaExplanation,
  setShowFullCreditsModal, showAccreditedDiplomaModal, showConsentModal,
  showDiplomaExplanation, showFullCreditsModal, subjectXP, visibilityStatus,
}) => (
  <>
{/* Full Credits Modal */}
<CreditProgressModal
  isOpen={showFullCreditsModal}
  onClose={() => setShowFullCreditsModal(false)}
  subjectXP={subjectXP}
  pendingSubjectXP={pendingSubjectXP}
  isOwner={isOwner}
  getStudentFirstName={getStudentFirstName}
  onAccreditedDiplomaClick={() => setShowAccreditedDiplomaModal(true)}
/>

{/* Badge system removed (January 2026 - Microschool client feedback) */}

{/* Evidence Detail Modal */}
<EvidenceDetailModal
  isOpen={!!selectedEvidenceItem}
  onClose={() => setSelectedEvidenceItem(null)}
  evidenceItem={selectedEvidenceItem}
/>

{/* Achievement Detail Modal (legacy - for old selectedAchievement state) */}
<AchievementDetailModal
  isOpen={!!selectedAchievement}
  onClose={() => setSelectedAchievement(null)}
  achievement={selectedAchievement}
/>

{/* Self-Validated Diploma Explanation Modal */}
<DiplomaExplanationModal
  isOpen={showDiplomaExplanation}
  onClose={() => setShowDiplomaExplanation(false)}
/>

{/* Accredited Diploma Modal */}
<AccreditedDiplomaModal
  isOpen={showAccreditedDiplomaModal}
  onClose={() => setShowAccreditedDiplomaModal(false)}
/>

{/* FERPA Compliance: Public Consent Modal */}
<PublicConsentModal
  isOpen={showConsentModal}
  onClose={() => setShowConsentModal(false)}
  onConfirm={handleConsentConfirm}
  isMinor={visibilityStatus?.is_minor}
  parentName={
    visibilityStatus?.approver?.first_name
    || visibilityStatus?.parent_info?.first_name
    || 'your parent or guardian'
  }
  approverKind={visibilityStatus?.approver_kind}
  minorReason={visibilityStatus?.minor_reason}
  canMakePublic={visibilityStatus?.can_make_public !== false}
  loading={privacyLoading}
/>
  </>
);

export default DiplomaModals;
