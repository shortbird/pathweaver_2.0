import React from 'react';

const DiplomaHeader = ({ 
  user, 
  isOwner, 
  previewMode, 
  onTogglePreview, 
  onShare,
  diploma 
}) => {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const displayName = diploma 
    ? `${diploma.student?.first_name || ''} ${diploma.student?.last_name || ''}`
    : `${user?.first_name || ''} ${user?.last_name || ''}`;

  const graduationDate = diploma?.diploma_issued || new Date().toISOString();

  return (
    <div className="rounded-xl shadow-lg overflow-hidden mb-8 relative" 
         style={{ 
           background: 'linear-gradient(135deg, #ef597b 0%, #6d469b 100%)', 
           boxShadow: '0 4px 20px rgba(239, 89, 123, 0.35)' 
         }}>
      
      {/* Owner Controls */}
      {isOwner && !previewMode && (
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={onTogglePreview}
            className="px-4 py-2 rounded-full transition-all font-semibold text-sm bg-white/20 backdrop-blur-sm text-white hover:bg-white/30"
            title="Preview as public visitor"
          >
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview as Public
          </button>
          <button
            onClick={onShare}
            className="px-4 py-2 rounded-full transition-all font-semibold text-sm bg-white text-[#6d469b] hover:shadow-lg"
            style={{ boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
          >
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m9.032 4.026a9.001 9.001 0 01-7.432 0m9.032-4.026A9.001 9.001 0 0112 3c-4.474 0-8.268 2.943-9.543 7a9.97 9.97 0 011.827 3.342m7.432 6.342A9.97 9.97 0 0112 21c4.474 0 8.268-2.943 9.543-7a9.97 9.97 0 00-1.827-3.342" />
            </svg>
            Share Diploma
          </button>
        </div>
      )}

      {/* Preview Mode Indicator */}
      {isOwner && previewMode && (
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
          <div className="px-4 py-2 rounded-full bg-yellow-400/90 text-yellow-900 font-semibold text-sm">
            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview Mode - This is how others see your diploma
          </div>
          <button
            onClick={onTogglePreview}
            className="px-4 py-2 rounded-full bg-white text-[#6d469b] font-semibold text-sm hover:shadow-lg"
          >
            Exit Preview
          </button>
        </div>
      )}

      <div className="p-12 text-white">
        <div className="text-center">
          {/* Optio Branding */}
          <div className="mb-6">
            <div className="inline-block px-6 py-2 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="text-sm font-semibold tracking-wider uppercase">Optio Education</span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl font-bold mb-3" style={{ letterSpacing: '-1px' }}>
            Certificate of Achievement
          </h1>
          
          {/* Student Name */}
          <p className="text-3xl text-white/95 mb-4 font-light">
            {displayName || 'Student Name'}
          </p>

          {/* Certification Line */}
          <div className="mt-6 mb-4">
            <p className="text-lg text-white/80">
              has successfully completed the requirements for
            </p>
            <p className="text-2xl font-semibold mt-2">
              Self-Validated Learning Diploma
            </p>
          </div>

          {/* Date and Verification */}
          <div className="mt-6 flex justify-center items-center gap-8">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-white/90">Certified: {formatDate(graduationDate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white/90">Verified Achievement</span>
            </div>
          </div>

          {/* Diploma ID for authenticity */}
          <div className="mt-8">
            <p className="text-xs text-white/60 tracking-wider">
              DIPLOMA ID: {(user?.id || diploma?.student?.id || '').slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiplomaHeader;