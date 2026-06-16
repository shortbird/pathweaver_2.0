import React from 'react'
import LegalDocument from '../components/legal/LegalDocument'
import { termsOfService } from '@legal/termsOfService'

// Content lives in shared/legal (single source of truth shared with the v2
// mobile app). This page only renders it for the web. See shared/legal/types.ts.
const TermsOfService = () => <LegalDocument document={termsOfService} />

export default TermsOfService
