// The owner's bar above the portfolio: back out of it, toggle whether it is
// public, and copy the share link. Everything here is owner-only or
// route-dependent, which is why the page passes so much of itself in.
import React from 'react';

const DiplomaShareControls = ({
  copyShareLink, fromOrgProgress, handlePrivacyToggle, isOwner, linkCopied,
  navigate, privacyLoading, sourceOrgId, user, visibilityStatus,
}) => (
<div className="flex items-center justify-between mb-6">
  {/* Back Button */}
  {user && (
    <button
      onClick={() => {
        if (fromOrgProgress && sourceOrgId) {
          // Navigate back to org management with progress tab active
          navigate(`/admin/organizations/${sourceOrgId}`, { state: { activeTab: 'progress' } });
        } else {
          navigate('/dashboard');
        }
      }}
      className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group min-h-[44px]"
    >
      <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span className="font-medium">{fromOrgProgress ? 'Back to Progress' : 'Back to Dashboard'}</span>
    </button>
  )}

  {/* Share Controls and Privacy Settings */}
  {isOwner && (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      {/* Privacy Toggle */}
      <div className="flex items-center gap-3">
        {visibilityStatus?.pending_parent_approval ? (
          <div className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2 text-sm min-h-[44px]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Awaiting Parent Approval
          </div>
        ) : visibilityStatus?.parent_approval_denied ? (
          <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm min-h-[44px]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Request Denied
          </div>
        ) : (
          <button
            onClick={handlePrivacyToggle}
            disabled={privacyLoading}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm min-h-[44px] transition-colors ${
              visibilityStatus?.is_public
                ? 'bg-green-100 hover:bg-green-200 text-green-800'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            } ${privacyLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={visibilityStatus?.is_public ? 'Your portfolio is public' : 'Your portfolio is private'}
          >
            {privacyLoading ? (
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : visibilityStatus?.is_public ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            {visibilityStatus?.is_public ? 'Public' : 'Private'}
          </button>
        )}
      </div>
      {/* Share button - only show if public */}
      {visibilityStatus?.is_public && (
        <button
          onClick={copyShareLink}
          className="btn-primary min-h-[44px]"
        >
          {linkCopied ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92zM18 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM6 13c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm12 7.02c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
              </svg>
              Share Portfolio
            </>
          )}
        </button>
      )}
    </div>
  )}
</div>
);

export default DiplomaShareControls;
