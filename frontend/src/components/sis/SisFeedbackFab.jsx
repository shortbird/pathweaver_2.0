import React from 'react'
import FeedbackFab from '../feedback/FeedbackFab'

/**
 * Beta feedback FAB for the SIS console (iCreate pilot).
 *
 * Thin surface binding around the shared FeedbackFab — the learning app mounts
 * the same component with surface="learning" so teachers can report from either
 * product. SisLayout mounts this for every staff member (org_admin AND advisor),
 * so the teacher portal has the same reporting path as the admin console.
 */
const SisFeedbackFab = () => <FeedbackFab surface="sis" platform="web-sis" />

export default SisFeedbackFab
