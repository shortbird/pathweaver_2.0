import React from 'react'
import LegalDocument from '../components/legal/LegalDocument'
import { privacyPolicy } from '@legal/privacyPolicy'

// Content lives in shared/legal (single source of truth shared with the v2
// mobile app). This page only renders it for the web. See shared/legal/types.ts.
const PrivacyPolicy = () => <LegalDocument document={privacyPolicy} />

export default PrivacyPolicy
