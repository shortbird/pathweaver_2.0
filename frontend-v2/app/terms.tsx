/**
 * Terms of Service - Public page, no auth required.
 *
 * Content lives in shared/legal (single source of truth shared with the v1 web
 * app). This screen only renders it. See shared/legal/types.ts.
 */
import React from 'react';
import LegalDocument from '@/src/components/legal/LegalDocument';
import { termsOfService } from '@legal/termsOfService';

export default function TermsOfServiceScreen() {
  return <LegalDocument document={termsOfService} />;
}
