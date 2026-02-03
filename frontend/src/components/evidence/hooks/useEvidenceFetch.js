/**
 * useEvidenceFetch - Auto-fetch evidence blocks when document ID is detected
 *
 * This is a frontend fallback in case backend doesn't parse document IDs.
 * With Phase 1 backend enhancements, this should rarely be needed.
 */

import { useState, useEffect } from 'react';
import api from '../../../services/api';

const useEvidenceFetch = (evidence) => {
  const [enhancedEvidence, setEnhancedEvidence] = useState(evidence);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If evidence already has blocks, no need to fetch
    if (evidence?.evidence_blocks?.length > 0) {
      setEnhancedEvidence(evidence);
      return;
    }

    // Check if evidence_text contains document ID placeholder
    const evidenceText = evidence?.evidence_text || '';
    if (evidenceText.startsWith('Multi-format evidence document')) {
      const match = evidenceText.match(/Document ID: ([\w-]+)/);
      if (match) {
        const documentId = match[1];
        fetchEvidenceBlocks(documentId);
      } else {
        setEnhancedEvidence(evidence);
      }
    } else {
      setEnhancedEvidence(evidence);
    }
  }, [evidence]);

  const fetchEvidenceBlocks = async (documentId) => {
    setLoading(true);
    setError(null);

    try {
      // Note: This endpoint would need to be created if backend enhancement isn't done
      const response = await api.get(`/api/evidence/documents/by-id/${documentId}`);
      const { blocks } = response.data;

      if (blocks && blocks.length > 0) {
        setEnhancedEvidence({
          ...evidence,
          evidence_type: 'multi_format',
          evidence_blocks: blocks,
          evidence_text: null  // Clear placeholder
        });
      } else {
        setEnhancedEvidence(evidence);
      }
    } catch (err) {
      console.error('Failed to fetch evidence blocks:', err);
      setError(err.message);
      setEnhancedEvidence(evidence);  // Fallback to original
    } finally {
      setLoading(false);
    }
  };

  return { evidence: enhancedEvidence, loading, error };
};

export default useEvidenceFetch;
