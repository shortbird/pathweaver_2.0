import { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
  DocumentIcon
} from '@heroicons/react/24/outline';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Configure PDF.js worker from public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Determines if a URL/filename points to a PDF file
 */
export const isPdf = (url, title) => {
  const str = (title || url || '').toLowerCase();
  return str.endsWith('.pdf') || str.includes('.pdf?');
};

/**
 * Determines if a URL/filename points to an image file
 */
export const isImage = (url, title) => {
  const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif'];
  const str = (title || url || '').toLowerCase();
  return exts.some(ext => str.includes(ext));
};

/**
 * Can this document be shown, or only handed over as a file? Callers use it to
 * decide whether to caption the preview -- the fallback card already names the
 * file, the PDF and image views deliberately don't.
 */
export const isPreviewableDocument = (url, title) =>
  isPdf(url, title) || isImage(url, title);

/**
 * DocumentPreview - Inline preview for an uploaded document.
 *
 * Features:
 * - PDF viewer with page navigation
 * - Image display for image files typed as documents
 * - Fallback to download link for unsupported formats
 * - "Open in new tab" button on all previews
 *
 * Two shapes. `variant="card"` (default) is the observer feed's: a square well
 * that keeps every card in a scrolling feed the same height. `variant="inline"`
 * is for a reader who is looking at one document at a time -- the credit review
 * pane -- where a square crops a portrait page for no reason, so the preview
 * takes its natural height and fills the width it is given.
 *
 * The page also measures its own container rather than the viewport. Sizing a
 * PDF to `window.innerWidth` is right only when the preview spans the window;
 * in a split review pane it overflowed the column it was sitting in.
 */
const DocumentPreview = ({ url, title, variant = 'card' }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [containerWidth, setContainerWidth] = useState(null);
  const containerRef = useRef(null);
  const isInline = variant === 'inline';

  // Track the container's width so the rendered page matches the space it has.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect?.width;
      if (w) setContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fall back to the viewport when the container hasn't been measured yet
  // (first paint, or a jsdom/older browser without ResizeObserver).
  const pageWidth = Math.max(
    240,
    Math.min(600, (containerWidth || window.innerWidth) - 32)
  );

  const onDocumentLoadSuccess = useCallback(({ numPages: totalPages }) => {
    setNumPages(totalPages);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err) => {
    console.error('PDF load error:', err);
    setError('Failed to load PDF');
    setLoading(false);
  }, []);

  const goToPrevPage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pageNumber > 1) {
      setPageNumber(pageNumber - 1);
    }
  };

  const goToNextPage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pageNumber < numPages) {
      setPageNumber(pageNumber + 1);
    }
  };

  const openInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Touch handlers for swipe navigation
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStart === null) return;

    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0 && pageNumber < numPages) {
        // Swiped left - go to next page
        setPageNumber(pageNumber + 1);
      } else if (diff < 0 && pageNumber > 1) {
        // Swiped right - go to previous page
        setPageNumber(pageNumber - 1);
      }
    }
    setTouchStart(null);
  };

  const displayTitle = title || 'Document';

  // Render PDF preview
  if (isPdf(url, title)) {
    return (
      <div
        ref={containerRef}
        className="relative bg-gray-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Card: fixed square well keeps feed rows even. Inline: natural height. */}
        <div className={`flex items-center justify-center pointer-events-none overflow-hidden ${
          isInline ? 'min-h-[240px] py-2' : 'aspect-square'
        }`}>
          {loading && (
            <div className="flex items-center justify-center w-full h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center w-full h-full text-gray-500 pointer-events-auto">
              <DocumentIcon className="w-12 h-12 mb-2" />
              <p className="text-sm">{error}</p>
              <button
                onClick={openInNewTab}
                className="mt-2 text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Open PDF directly
              </button>
            </div>
          )}

          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            className={loading ? 'hidden' : 'shadow-lg max-h-full'}
          >
            <Page
              key={`page-${pageNumber}`}
              pageNumber={pageNumber}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>

        {/* Navigation controls - overlaid at bottom */}
        {!loading && !error && numPages > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg pointer-events-auto">
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={pageNumber <= 1}
              className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-700 min-w-[60px] text-center font-medium">
              {pageNumber} / {numPages}
            </span>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Open in new tab button - overlaid at top right */}
        <button
          type="button"
          onClick={openInNewTab}
          className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-lg hover:bg-white text-sm text-gray-700 pointer-events-auto"
          aria-label="Open in new tab"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Open</span>
        </button>
      </div>
    );
  }

  // Render image preview (for images typed as documents)
  if (isImage(url, title)) {
    return (
      <div
        ref={containerRef}
        className={`relative bg-gray-100 flex items-center justify-center ${
          isInline ? 'py-2' : 'aspect-square'
        }`}
      >
        <img
          src={url}
          alt={displayTitle}
          className={`object-contain ${isInline ? 'max-w-full max-h-[520px]' : 'max-w-full max-h-full'}`}
          loading="lazy"
        />
        {/* Open in new tab button */}
        <button
          onClick={openInNewTab}
          className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-md hover:bg-white text-sm text-gray-700"
          aria-label="Open in new tab"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Open</span>
        </button>
      </div>
    );
  }

  // Fallback for unsupported document types (docx, xlsx, etc.)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        <DocumentIcon className="w-6 h-6 shrink-0 text-orange-600" />
        <div className="flex-1 min-w-0">
          <span className="text-base font-medium text-orange-600 block truncate">
            {displayTitle}
          </span>
          <p className="text-sm text-gray-500">Click to download</p>
        </div>
        <ArrowTopRightOnSquareIcon className="w-5 h-5 text-gray-400 shrink-0" />
      </div>
    </a>
  );
};

DocumentPreview.propTypes = {
  url: PropTypes.string.isRequired,
  title: PropTypes.string,
  /** 'card' = square well for a feed; 'inline' = natural height for a reader. */
  variant: PropTypes.oneOf(['card', 'inline'])
};

export default DocumentPreview;
