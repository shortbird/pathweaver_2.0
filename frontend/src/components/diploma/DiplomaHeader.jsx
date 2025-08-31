import React, { useState } from 'react';

// Info Modal Component
const InfoModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState('philosophy');

  return (
    <>
      {/* Info Icon Button - Positioned Absolutely */}
      <button
        onClick={() => setIsOpen(true)}
        className="absolute top-4 left-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 transition-all hover:scale-110"
        title="What is a Portfolio Diploma?"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={() => setIsOpen(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 relative my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Content */}
            <div className="max-w-none">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold" style={{ color: '#003f5c' }}>
                  What is a Portfolio Diploma?
                </h2>
              </div>
              
              <div className="space-y-5">
                <p className="text-lg text-gray-700 leading-relaxed">
                  A Portfolio Diploma represents a revolutionary approach to education where students receive their diploma on day one, 
                  not as a reward for completion, but as a <strong className="text-purple-600">responsibility to make valuable</strong>.
                </p>

                <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-xl mb-2" style={{ color: '#6d469b' }}>The Philosophy</h3>
                      <p className="text-base leading-relaxed text-gray-700">
                        Traditional education validates learning through institutional approval. The Portfolio Diploma empowers students to 
                        create their own comprehensive record of learning that demonstrates real skills, completed challenges, and 
                        documented growth in ways that transcend traditional transcripts.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <h3 className="font-semibold text-xl" style={{ color: '#003f5c' }}>How It Works</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 ml-9">
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base text-gray-700">Students accept responsibility for their own education from the start</span>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base text-gray-700">Each completed quest and task adds evidence to their portfolio</span>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base text-gray-700">The diploma's value grows with each authentic challenge overcome</span>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-base text-gray-700">Students build a detailed, evidence-based record of their capabilities</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="font-semibold text-xl" style={{ color: '#003f5c' }}>Accountability & Quality</h3>
                  </div>
                  <div className="ml-9 space-y-3">
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-sm font-medium text-orange-900 mb-2">What prevents gaming the system?</p>
                      <p className="text-base text-gray-700 leading-relaxed">
                        <strong>Public accountability.</strong> All evidence submitted becomes part of the student's public portfolio. 
                        Poor quality work reflects poorly on them, as this is what employers, colleges, and peers will see.
                      </p>
                    </div>
                    <div className="space-y-2 text-base text-gray-700">
                      <p className="flex items-start gap-2">
                        <span className="text-purple-600 mt-1">•</span>
                        <span>Optio does not verify or validate submissions. The public nature of the portfolio creates natural accountability</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-purple-600 mt-1">•</span>
                        <span>Students motivated by genuine learning will naturally produce quality work they're proud to display</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-purple-600 mt-1">•</span>
                        <span>The portfolio's value comes from demonstrating real capabilities. Shortcuts only diminish their own credential</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <blockquote className="text-base text-gray-700 leading-relaxed">
                      <p className="font-medium mb-2">A New Paradigm in Education</p>
                      <p>
                        This approach recognizes that true learning happens when students take ownership of their education. 
                        The portfolio becomes a living document of growth, far more meaningful than any traditional credential.
                      </p>
                    </blockquote>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

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

      {/* Info Modal Component */}
      <InfoModal />
      
      <div className="p-12 text-white">
        <div className="text-center">
          {/* Optio Branding */}
          <div className="mb-6">
            <div className="inline-block px-6 py-2 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="text-sm font-bold tracking-wider uppercase">Optio Academy</span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl font-bold mb-3">
            Portfolio Diploma
          </h1>
          
          {/* Student Name */}
          <p className="text-3xl text-white/95 mb-4 font-light">
            {displayName || 'Student Name'}
          </p>

          {/* Certification Line */}
          <div className="mt-6 mb-4">
            <p className="text-lg text-white/80">
              has accepted the responsibility to self-validate their education.
            </p>
            <p className="text-xl font-semibold mt-2 text-white/90">
              This diploma is a record of their learning journey.
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
              <span className="text-white/90">Self-Validated Achievement</span>
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