import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, SparklesIcon, PhotoIcon, DocumentIcon, VideoCameraIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { Document, Page, pdfjs } from 'react-pdf';
import api from '../../services/api';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker from public folder (same as DocumentPreview)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// PDF Thumbnail component
const PdfThumbnail = ({ url, fileName }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [numPages, setNumPages] = useState(null);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = () => {
    setLoading(false);
    setError(true);
  };

  // Fallback card for errors
  const FallbackCard = () => (
    <div className="w-full h-full bg-gradient-to-br from-red-50 to-red-100 flex flex-col items-center justify-center p-3">
      <div className="w-12 h-14 bg-white rounded shadow-sm flex flex-col items-center justify-center mb-2 relative">
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold px-1 rounded">PDF</div>
        <DocumentIcon className="w-6 h-6 text-red-400" />
      </div>
      <p className="text-[10px] text-red-600 text-center line-clamp-2 leading-tight font-medium">
        {fileName?.length > 20 ? fileName.substring(0, 17) + '...' : fileName || 'Document.pdf'}
      </p>
    </div>
  );

  if (error) {
    return <FallbackCard />;
  }

  return (
    <div className="w-full h-full bg-white relative overflow-hidden flex items-center justify-center">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
          <div className="animate-pulse flex flex-col items-center">
            <DocumentIcon className="w-8 h-8 text-red-300" />
            <span className="text-[10px] text-red-400 mt-1">Loading...</span>
          </div>
        </div>
      )}
      <Document
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={null}
      >
        <Page
          pageNumber={1}
          width={180}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
      {/* PDF badge */}
      {!loading && (
        <div className="absolute bottom-1 left-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-20">
          PDF
        </div>
      )}
    </div>
  );
};

/**
 * LearningJournalSection - Shows recent learning moments as a grid of cards
 * Used in both StudentOverviewPage and ChildOverviewContent (parent view)
 */
const LearningJournalSection = ({
  moments: propMoments,
  studentId,
  viewMode = 'student', // 'student' | 'parent'
  hideHeader = false,
  limit = 6
}) => {
  const [moments, setMoments] = useState(propMoments || []);
  const [loading, setLoading] = useState(!propMoments);
  const [error, setError] = useState(null);

  // Fetch moments if not provided as props
  useEffect(() => {
    if (propMoments) {
      setMoments(propMoments);
      return;
    }

    const fetchMoments = async () => {
      setLoading(true);
      try {
        let response;
        if (viewMode === 'parent' && studentId) {
          response = await api.get(`/api/parent/children/${studentId}/learning-moments?limit=${limit}`);
          setMoments(response.data.moments || []);
        } else {
          response = await api.get(`/api/learning-events?limit=${limit}`);
          setMoments(response.data.events || []);
        }
      } catch (err) {
        console.error('Failed to fetch learning moments:', err);
        setError('Failed to load learning moments');
      } finally {
        setLoading(false);
      }
    };

    fetchMoments();
  }, [propMoments, studentId, viewMode, limit]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  const truncateText = (text, maxLength = 80) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  // Get the first evidence block for preview
  const getPreviewEvidence = (moment) => {
    if (!moment.evidence_blocks || moment.evidence_blocks.length === 0) return null;
    return moment.evidence_blocks[0];
  };

  // Get file URL from evidence block (checks all possible locations)
  const getFileUrl = (evidence) => {
    if (!evidence) return null;
    return evidence.file_url || evidence.content?.url || evidence.url || null;
  };

  // Determine file type from URL or block_type
  const getFileType = (evidence) => {
    if (!evidence) return 'unknown';

    const url = getFileUrl(evidence) || '';
    const fileName = evidence.file_name || evidence.content?.filename || '';

    // Check URL or filename for specific file types first
    const urlOrName = url + fileName;
    if (/\.(pdf)$/i.test(urlOrName)) return 'pdf';
    if (/\.(jpg|jpeg|png|gif|webp|svg|heic)$/i.test(urlOrName)) return 'image';
    if (/\.(mp4|webm|mov|avi|m4v)$/i.test(urlOrName)) return 'video';
    if (/\.(mp3|wav|ogg|m4a)$/i.test(urlOrName)) return 'audio';
    if (/\.(doc|docx)$/i.test(urlOrName)) return 'word';

    // Then check block_type
    const blockType = evidence.block_type;
    if (blockType === 'image') return 'image';
    if (blockType === 'video') return 'video';
    if (blockType === 'document') return 'document';
    if (blockType === 'link') return 'link';

    return 'document';
  };

  // Render preview thumbnail
  const renderPreview = (moment) => {
    const evidence = getPreviewEvidence(moment);
    const fileType = getFileType(evidence);
    const fileUrl = getFileUrl(evidence);

    // Fallback icon component
    const FallbackIcon = ({ type }) => {
      const iconClass = "w-8 h-8 text-gray-400";
      let Icon = PhotoIcon;
      let bgColor = "bg-gray-100";

      switch (type) {
        case 'video':
          Icon = VideoCameraIcon;
          bgColor = "bg-purple-50";
          break;
        case 'audio':
          Icon = MusicalNoteIcon;
          bgColor = "bg-pink-50";
          break;
        case 'pdf':
          Icon = DocumentIcon;
          bgColor = "bg-red-50";
          break;
        case 'word':
          Icon = DocumentIcon;
          bgColor = "bg-blue-50";
          break;
        case 'document':
          Icon = DocumentIcon;
          bgColor = "bg-gray-100";
          break;
        default:
          Icon = PhotoIcon;
          bgColor = "bg-gray-100";
      }

      return (
        <div className={`w-full h-full ${bgColor} flex items-center justify-center`}>
          <Icon className={iconClass} />
        </div>
      );
    };

    if (fileType === 'image' && fileUrl) {
      return (
        <div className="w-full h-full relative">
          <img
            src={fileUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.querySelector('.fallback-icon')?.classList.remove('hidden');
            }}
          />
          <div className="fallback-icon hidden absolute inset-0">
            <FallbackIcon type="image" />
          </div>
        </div>
      );
    }

    // Document preview helper
    const renderDocumentPreview = (type, bgFrom, bgTo, badgeColor, textColor, label) => {
      const fileName = evidence?.file_name || evidence?.content?.filename || `Document.${type.toLowerCase()}`;
      return (
        <div className={`w-full h-full bg-gradient-to-br ${bgFrom} ${bgTo} flex flex-col items-center justify-center p-3`}>
          <div className="w-12 h-14 bg-white rounded shadow-sm flex flex-col items-center justify-center mb-2 relative">
            <div className={`absolute -top-1 -right-1 ${badgeColor} text-white text-[8px] font-bold px-1 rounded`}>
              {label}
            </div>
            <svg className={`w-6 h-6 ${textColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className={`text-[10px] ${textColor} text-center line-clamp-2 leading-tight font-medium`}>
            {fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName}
          </p>
        </div>
      );
    };

    // PDF preview - render first page
    if (fileType === 'pdf' && fileUrl) {
      const fileName = evidence?.file_name || evidence?.content?.filename || 'Document.pdf';
      return <PdfThumbnail url={fileUrl} fileName={fileName} />;
    }

    // Word doc preview
    if (fileType === 'word') {
      return renderDocumentPreview('docx', 'from-blue-50', 'to-blue-100', 'bg-blue-500', 'text-blue-600', 'DOC');
    }

    // Generic document preview
    if (fileType === 'document') {
      return renderDocumentPreview('file', 'from-gray-50', 'to-gray-100', 'bg-gray-500', 'text-gray-600', 'FILE');
    }

    // Video preview - show poster frame or icon
    if (fileType === 'video' && fileUrl) {
      return (
        <div className="w-full h-full relative bg-purple-50">
          <video
            src={fileUrl}
            className="w-full h-full object-cover"
            muted
            preload="metadata"
            onLoadedMetadata={(e) => {
              // Seek to 1 second for a better thumbnail
              e.target.currentTime = 1;
            }}
          />
          {/* Play icon overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
          </div>
        </div>
      );
    }

    return <FallbackIcon type={fileType} />;
  };

  // Determine the link destination (observers don't get journal access)
  const showJournalLink = viewMode !== 'observer';
  const journalLink = viewMode === 'parent' && studentId
    ? `/parent/child/${studentId}/journal`
    : '/learning-journal';

  const journalLinkText = viewMode === 'parent'
    ? 'View & Organize Journal'
    : 'View Learning Journal';

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="animate-pulse bg-gray-100 rounded-xl overflow-hidden">
            <div className="aspect-square bg-gray-200" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header - shown inline when hideHeader is true */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Recent Learning Moments
          </h3>
          <Link
            to={journalLink}
            className="text-sm font-medium text-optio-purple hover:text-optio-pink transition-colors flex items-center gap-1"
          >
            {journalLinkText}
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}

      {moments.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-xl">
          <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            No learning moments yet
          </p>
          <p className="text-sm text-gray-500">
            {viewMode === 'parent'
              ? 'Capture learning moments using the button below'
              : 'Start capturing your learning moments to build your journal'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grid of cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {moments.slice(0, limit).map((moment) => {
              const evidenceCount = moment.evidence_blocks?.length || 0;

              return (
                <div
                  key={moment.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Preview thumbnail */}
                  <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {renderPreview(moment)}
                    {/* File count badge */}
                    {evidenceCount > 1 && (
                      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                        +{evidenceCount - 1}
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <div className="p-3">
                    {/* Caption */}
                    {moment.description && (
                      <p className="text-sm text-gray-800 leading-snug mb-2 line-clamp-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {truncateText(moment.description)}
                      </p>
                    )}

                    {/* Metadata row */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatDate(moment.created_at)}</span>
                      {moment.captured_by_name && (
                        <span className="truncate ml-2">Recorded by {moment.captured_by_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* View All Link (hidden for observers) */}
          {showJournalLink && (
            <Link
              to={journalLink}
              className="flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 hover:from-optio-purple/10 hover:to-optio-pink/10 rounded-lg transition-colors group"
            >
              <span className="text-sm font-medium text-optio-purple group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {journalLinkText}
              </span>
              <ArrowRightIcon className="w-4 h-4 text-optio-purple group-hover:text-optio-pink group-hover:translate-x-1 transition-all" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

LearningJournalSection.propTypes = {
  moments: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    description: PropTypes.string,
    created_at: PropTypes.string,
    evidence_blocks: PropTypes.array,
    captured_by_user_id: PropTypes.string,
    captured_by_name: PropTypes.string
  })),
  studentId: PropTypes.string,
  viewMode: PropTypes.oneOf(['student', 'parent', 'observer']),
  hideHeader: PropTypes.bool,
  limit: PropTypes.number
};

export default LearningJournalSection;
