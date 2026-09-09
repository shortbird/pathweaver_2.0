// Print stylesheet for the transcript. Kept out of the page body because it is
// 25 lines of CSS-in-a-template-literal that nothing else reads.
import React from 'react';

const TranscriptPrintStyles = () => (
  <style>{`
    @media print {
      .no-print { display: none !important; }

      /* Hide everything except the printable transcript */
      body * { visibility: hidden; }
      #printable-transcript, #printable-transcript * { visibility: visible; }
      #printable-transcript {
        position: absolute; left: 0; top: 0; width: 100%;
      }
      .min-h-screen { min-height: auto !important; }
      #main-content { min-height: auto !important; padding: 0 !important; margin: 0 !important; }

      /* Clean up */
      #printable-transcript { box-shadow: none !important; overflow: visible !important; }
      html, body { height: auto !important; overflow: visible !important; }

      /* Hide edit affordances in print */
      .no-print-hover { cursor: default !important; }
      .no-print-edit { display: none !important; }

      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      @page { margin: 0.75in; size: letter; }
    }
  `}</style>
);

export default TranscriptPrintStyles;
