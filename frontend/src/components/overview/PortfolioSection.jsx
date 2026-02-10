import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import EvidenceMasonryGallery from '../diploma/EvidenceMasonryGallery';
import EvidenceDetailModal from '../diploma/EvidenceDetailModal';

const PortfolioSection = ({
  achievements = [],
  visibilityStatus,
  userId,
  onPrivacyToggle,
  privacyLoading = false,
  hideHeader = false,
  readOnly = false // When true, hide privacy toggle and show status badge only
}) => {
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState(null);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const qrCodeRef = useRef(null);

  // Generate portfolio URL
  const getPortfolioUrl = () => {
    return `${window.location.origin}/public/diploma/${userId}`;
  };

  // Copy portfolio link to clipboard
  const copyPortfolioLink = async () => {
    try {
      await navigator.clipboard.writeText(getPortfolioUrl());
      toast.success('Portfolio link copied!');
      setShowShareOptions(false);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  // Download QR code
  const downloadQRCode = async () => {
    const qrSvg = qrCodeRef.current?.querySelector('svg');
    if (!qrSvg) {
      toast.error('QR code not available');
      return;
    }

    try {
      const clonedSvg = qrSvg.cloneNode(true);
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = 'portfolio-qr.svg';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);

      toast.success('QR code downloaded!');
      setShowShareOptions(false);
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast.error('Failed to download QR code');
    }
  };

  const isPublic = visibilityStatus?.is_public;
  const isPendingApproval = visibilityStatus?.pending_parent_approval;
  const isApprovalDenied = visibilityStatus?.parent_approval_denied;

  // Privacy status badge for read-only view
  const PrivacyStatusBadge = () => {
    if (isPendingApproval) {
      return (
        <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Awaiting Approval
        </div>
      );
    }
    if (isApprovalDenied) {
      return (
        <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Denied
        </div>
      );
    }
    return (
      <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm ${
        isPublic
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-700'
      }`}>
        {isPublic ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
        {isPublic ? 'Public' : 'Private'}
      </div>
    );
  };

  // Privacy and Share Controls component
  const PrivacyShareControls = () => {
    // Read-only mode: show status badge only
    if (readOnly) {
      return (
        <div className="flex items-center gap-3">
          <PrivacyStatusBadge />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3">
              {/* Privacy Toggle */}
              {isPendingApproval ? (
                <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Awaiting Approval
                </div>
              ) : isApprovalDenied ? (
                <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Denied
                </div>
              ) : (
                <button
                  onClick={onPrivacyToggle}
                  disabled={privacyLoading}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition-colors min-h-[36px] ${
                    isPublic
                      ? 'bg-green-100 hover:bg-green-200 text-green-800'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  } ${privacyLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={isPublic ? 'Your portfolio is public' : 'Your portfolio is private'}
                >
                  {privacyLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : isPublic ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                  {isPublic ? 'Public' : 'Private'}
                </button>
              )}

              {/* Share Button - only show if public */}
              {isPublic && (
                <div className="relative">
                  <button
                    onClick={() => setShowShareOptions(!showShareOptions)}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white flex items-center gap-2 text-sm font-medium hover:shadow-md transition-shadow min-h-[36px]"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                    </svg>
                    Share
                  </button>

                  {/* Share Dropdown */}
                  {showShareOptions && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50">
                      <div className="flex justify-center mb-4" ref={qrCodeRef}>
                        <div className="p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                          <QRCodeSVG
                            value={getPortfolioUrl()}
                            size={120}
                            level="H"
                            includeMargin={true}
                            fgColor="#6D469B"
                            bgColor="#FFFFFF"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={copyPortfolioLink}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 text-sm font-medium transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy Link
                        </button>
                        <button
                          onClick={downloadQRCode}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg text-sm font-medium hover:shadow-md transition-shadow"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download QR Code
                        </button>
                      </div>

                      <button
                        onClick={() => setShowShareOptions(false)}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

      {/* View Full Portfolio Link */}
      <Link
        to="/diploma"
        className="text-sm text-optio-purple hover:text-purple-700 font-medium flex items-center gap-1"
      >
        View Full
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </Link>

      {/* Create Evidence Report Link */}
      <Link
        to="/evidence-reports"
        className="text-sm text-optio-purple hover:text-purple-700 font-medium flex items-center gap-1"
        title="Create shareable evidence reports"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Reports
      </Link>
    </div>
    );
  };

  // Evidence gallery content
  const EvidenceContent = () => (
    <>
      {achievements.length > 0 ? (
        <EvidenceMasonryGallery
          achievements={achievements}
          onEvidenceClick={(item) => setSelectedEvidenceItem(item)}
          isOwner={true}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No evidence yet</h3>
          <p className="text-gray-500 mb-4 max-w-sm mx-auto">
            Complete quests to add evidence of your learning to your portfolio
          </p>
          <Link
            to="/quests"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium text-sm hover:shadow-md transition-shadow"
          >
            Explore Quests
          </Link>
        </div>
      )}
    </>
  );

  if (hideHeader) {
    return (
      <>
        {/* Controls row when header is hidden */}
        <div className="flex items-center justify-end gap-3 mb-4">
          <PrivacyShareControls />
        </div>

        {/* Evidence Gallery */}
        <EvidenceContent />

        {/* Evidence Detail Modal */}
        <EvidenceDetailModal
          isOpen={!!selectedEvidenceItem}
          onClose={() => setSelectedEvidenceItem(null)}
          evidenceItem={selectedEvidenceItem}
        />

        {/* Click outside to close share options */}
        {showShareOptions && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowShareOptions(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
                Portfolio Evidence
              </h2>
            </div>
            <PrivacyShareControls />
          </div>
        </div>

        {/* Evidence Gallery */}
        <div className="p-6">
          <EvidenceContent />
        </div>
      </section>

      {/* Evidence Detail Modal */}
      <EvidenceDetailModal
        isOpen={!!selectedEvidenceItem}
        onClose={() => setSelectedEvidenceItem(null)}
        evidenceItem={selectedEvidenceItem}
      />

      {/* Click outside to close share options */}
      {showShareOptions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowShareOptions(false)}
        />
      )}
    </>
  );
};

PortfolioSection.propTypes = {
  achievements: PropTypes.array,
  visibilityStatus: PropTypes.shape({
    is_public: PropTypes.bool,
    pending_parent_approval: PropTypes.bool,
    parent_approval_denied: PropTypes.bool
  }),
  userId: PropTypes.string,
  onPrivacyToggle: PropTypes.func,
  privacyLoading: PropTypes.bool,
  readOnly: PropTypes.bool
};

export default PortfolioSection;
