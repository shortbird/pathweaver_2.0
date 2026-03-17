import PropTypes from 'prop-types';
import { VideoCameraIcon } from '@heroicons/react/24/outline';

const VideoLinkPreview = ({ url, title: providedTitle }) => {
  const serviceName = (() => {
    if (/photos\.app\.goo\.gl|photos\.google\.com/.test(url)) return 'Google Photos';
    if (/share\.icloud\.com/.test(url)) return 'iCloud';
    try { return new URL(url).hostname.replace('www.', ''); } catch { return 'Video'; }
  })();

  const displayTitle = providedTitle || `Video on ${serviceName}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
          <VideoCameraIcon className="w-5 h-5 text-gray-500" />
        </div>
        <div className="min-w-0">
          <span className="text-base font-medium text-blue-600 block truncate">
            {displayTitle}
          </span>
          <p className="text-sm text-gray-500 truncate">{serviceName}</p>
        </div>
      </div>
    </a>
  );
};

VideoLinkPreview.propTypes = {
  url: PropTypes.string.isRequired,
  title: PropTypes.string
};

export default VideoLinkPreview;
