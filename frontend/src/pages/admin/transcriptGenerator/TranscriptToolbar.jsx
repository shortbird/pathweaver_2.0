// The no-print admin bar above the transcript: download, copy, transfer to a
// school, and the entry point to the planned-credit form.
import React from 'react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const TranscriptToolbar = ({
  downloading, handleDownloadPdf, overrides, setShowAddForm,
  setShowTransferModal, showAddForm, student, userId,
}) => (
  <div className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
    <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">
          Transcript: {student.first_name} {student.last_name}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-quiet px-3 py-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Planned Credit
        </button>
        <button
          onClick={async () => {
            // A transcript link is now a named, expiring, revocable grant
            // rather than a permanent open URL, so we mint one instead of
            // composing a path. Safari rejects a clipboard write that
            // isn't inside the click gesture, so we claim the clipboard
            // first and fill it once the token comes back.
            try {
              const write = navigator.clipboard.write
                ? navigator.clipboard.write([
                    new ClipboardItem({
                      'text/plain': api
                        .put(`/api/admin/transcript/${userId}/overrides`, overrides || {})
                        .then(() => api.post(`/api/portfolio/user/${userId}/transcript-shares`, {
                          label: 'Shared from transcript generator',
                        }))
                        .then((res) => new Blob(
                          [res.data?.data?.share_url || ''],
                          { type: 'text/plain' }
                        )),
                    }),
                  ])
                : null;

              if (write) {
                await write;
              } else {
                // Safari <13.4 and Firefox: no async clipboard item.
                await api.put(`/api/admin/transcript/${userId}/overrides`, overrides || {});
                const res = await api.post(
                  `/api/portfolio/user/${userId}/transcript-shares`,
                  { label: 'Shared from transcript generator' }
                );
                await navigator.clipboard.writeText(res.data?.data?.share_url || '');
              }
              toast.success('Share link copied. It expires in 180 days and can be revoked.');
            } catch (e) {
              toast.error('Failed to create share link');
            }
          }}
          className="btn-quiet px-3 py-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy Share Link
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="btn-primary px-4 py-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 4v12m0 0l-4-4m4 4l4-4" />
          </svg>
          {downloading ? 'Generating...' : 'Download PDF'}
        </button>
        <button
          onClick={() => setShowTransferModal(true)}
          className="btn-quiet px-3 py-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          Transfer to School
        </button>
      </div>
    </div>
  </div>
);

export default TranscriptToolbar;
