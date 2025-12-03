/**
 * VideoBlock - Displays video evidence with embed support
 */

import React from 'react';
import PropTypes from 'prop-types';

const VideoBlock = ({ block, displayMode }) => {
  const { content } = block;
  const { url, title, platform } = content;

  // Extract video ID for embeds
  const getYouTubeEmbedUrl = (url) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/;
    const match = url.match(regex);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const getVimeoEmbedUrl = (url) => {
    const regex = /vimeo\.com\/(\d+)/;
    const match = url.match(regex);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  };

  let embedUrl = null;

  if (platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
    embedUrl = getYouTubeEmbedUrl(url);
  } else if (platform === 'vimeo' || url.includes('vimeo.com')) {
    embedUrl = getVimeoEmbedUrl(url);
  }

  if (embedUrl) {
    // Render embedded video
    return (
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-purple-300 transition-all"
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

VideoBlock.propTypes = {
  block: PropTypes.shape({
    content: PropTypes.shape({
      url: PropTypes.string.isRequired,
      title: PropTypes.string,
      platform: PropTypes.string
    }).isRequired
  }).isRequired,
  displayMode: PropTypes.oneOf(['full', 'compact', 'preview'])
};

VideoBlock.defaultProps = {
  displayMode: 'full'
};

export default VideoBlock;
