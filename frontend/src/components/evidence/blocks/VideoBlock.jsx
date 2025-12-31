/**
 * VideoBlock - Displays video evidence with embed support
 * Supports both old format (content.url) and new format (content.items)
 */

import React from 'react';
import PropTypes from 'prop-types';

const VideoBlock = ({ block, displayMode }) => {
  const { content } = block;

  // Handle both old format (content.url) and new format (content.items)
  const items = content?.items || (content?.url ? [{ url: content.url, title: content.title, platform: content.platform }] : []);

  // Extract video ID for embeds
  const getYouTubeEmbedUrl = (url) => {
    if (!url) return null;
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/;
    const match = url.match(regex);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const getVimeoEmbedUrl = (url) => {
    if (!url) return null;
    const regex = /vimeo\.com\/(\d+)/;
    const match = url.match(regex);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  };

  const getEmbedUrl = (url, platform) => {
    if (!url) return null;
    if (platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      return getYouTubeEmbedUrl(url);
    } else if (platform === 'vimeo' || url.includes('vimeo.com')) {
      return getVimeoEmbedUrl(url);
    }
    return null;
  };

  // Handle empty items
  if (items.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
        No video content
      </div>
    );
  }

  // Render a single video item
  const renderVideoItem = (item, index) => {
    const { url, title, platform } = item;

    if (!url) {
      return null;
    }

    const embedUrl = getEmbedUrl(url, platform);

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
        platform: PropTypes.string
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
