/**
 * VideoBlock - Displays video evidence with both file upload and embed support
 * Supports uploaded files (with inline <video> player) and external URLs (embed/link)
 */

import React from 'react';
import PropTypes from 'prop-types';
import { getVideoEmbedUrl } from '../../../utils/videoUtils';

const VideoBlock = ({ block, displayMode }) => {
  const { content } = block;

  // Handle both old format (content.url) and new format (content.items)
  const items = content?.items || (content?.url ? [{ url: content.url, title: content.title, platform: content.platform, thumbnail_url: content.thumbnail_url, duration_seconds: content.duration_seconds, filename: content.filename, content_type: content.content_type }] : []);

  // Handle empty items
  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        No video content
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Determine if an item is an uploaded file (not a YouTube/Vimeo link)
  const isUploadedFile = (item) => {
    if (!item.url) return false;
    if (item.filename || item.content_type?.startsWith('video/')) return true;
    if (item.url.includes('supabase.co')) return true;
    // Not a known embed platform
    const embedUrl = getVideoEmbedUrl(item.url);
    return !embedUrl && (item.url.endsWith('.mp4') || item.url.endsWith('.mov') || item.url.endsWith('.webm'));
  };

  // Render a single video item
  const renderVideoItem = (item, index) => {
    const { url, title } = item;

    if (!url) {
      return null;
    }

    // Render uploaded file with inline player
    if (isUploadedFile(item)) {
      return (
        <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <video
            src={url}
            controls
            preload="metadata"
            poster={item.thumbnail_url}
            className="w-full max-h-[480px] bg-black"
          />
          {(title || item.duration_seconds) && (
            <div className="p-3 flex items-center gap-2">
              {title && (
                <h4 className="font-bold text-gray-900 flex-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {title}
                </h4>
              )}
              {item.duration_seconds && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {formatDuration(item.duration_seconds)}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    const embedUrl = getVideoEmbedUrl(url);

    if (embedUrl) {
      // Render embedded video
      return (
        <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {title && (
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h4 className="font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {title}
              </h4>
            </div>
          )}

          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src={embedUrl}
              title={title || 'Video evidence'}
              className="absolute inset-0 w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      );
    }

    // Fallback: Render as link card
    return (
      <a
        key={index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-purple-300 transition-all min-h-[56px]"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
            <svg className="h-6 w-6 text-pink-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="font-bold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {title}
              </h4>
            )}

            <p className="text-xs text-optio-pink font-semibold truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {url}
            </p>
          </div>

          <svg className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </a>
    );
  };

  // Render all video items
  return (
    <div className="w-full space-y-4">
      {items.map((item, index) => renderVideoItem(item, index))}
    </div>
  );
};

VideoBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.oneOfType([
      PropTypes.shape({
        url: PropTypes.string,
        title: PropTypes.string,
        platform: PropTypes.string,
        thumbnail_url: PropTypes.string,
        duration_seconds: PropTypes.number,
        filename: PropTypes.string,
      }),
      PropTypes.shape({
        items: PropTypes.arrayOf(PropTypes.shape({
          url: PropTypes.string,
          title: PropTypes.string,
          platform: PropTypes.string
        }))
      })
    ])
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

VideoBlock.defaultProps = {
  displayMode: 'full'
};

export default VideoBlock;
