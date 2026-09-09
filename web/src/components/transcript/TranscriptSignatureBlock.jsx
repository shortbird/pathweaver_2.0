import React from 'react';

// Official signature for transcripts issued by Optio Academy (the school of
// record). The signature artwork is a generated script rendering, not the
// signer's personal handwritten signature, so its presence at a public URL is
// not a forgery vector for other documents.
const SIGNATURE_SRC = '/images/signature-head-of-school.png';
const SIGNER_NAME = 'Dr. Tanner Bowman';
const SIGNER_TITLE = 'Head of School';

/**
 * Certification block rendered above the transcript footer. Shown only when
 * the transcript is issued by Optio Academy (`accreditation.source === 'optio'`,
 * decided server-side) — partner schools with their own school of record sign
 * their own documents. Rendered inside #printable-transcript, so it flows into
 * the html2pdf output and print view automatically.
 */
const TranscriptSignatureBlock = ({ show, issuedDate }) => {
  if (!show) return null;
  // issuedDate is a pre-formatted display string (may come from a saved
  // date_issued override); default to the generation date.
  const dateText = issuedDate || new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="px-4 sm:px-10 pt-6 pb-2 flex flex-col items-center text-center">
      <p className="text-[10px] sm:text-xs italic text-gray-600">
        This transcript is official when it bears the signature of the school official below.
      </p>
      <div className="mt-4 w-full max-w-sm">
        <div className="border-b border-gray-900 px-2">
          <img
            src={SIGNATURE_SRC}
            alt={`Signature of ${SIGNER_NAME}, ${SIGNER_TITLE}`}
            className="h-14 w-auto -mb-1.5 mx-auto"
            style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
          />
        </div>
        <div className="mt-1 flex justify-between gap-4 text-[10px] sm:text-xs">
          <span className="font-semibold text-gray-900">{SIGNER_NAME}, {SIGNER_TITLE}</span>
          <span className="text-gray-500">Date issued: {dateText}</span>
        </div>
      </div>
    </div>
  );
};

export default TranscriptSignatureBlock;
