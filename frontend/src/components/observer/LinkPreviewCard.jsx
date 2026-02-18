import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { LinkIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';

// Client-side cache to avoid re-fetching on re-renders
const previewCache = {};

const LinkPreviewCard = ({ url, title: providedTitle }) => {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  const hostname = (() => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'Link';
    }
  })();

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }

    // Check client cache
    if (previewCache[url]) {
      setPreview(previewCache[url]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPreview = async () => {
      try {
        const resp = await api.get('/api/utils/link-preview', { params: { url } });
        if (!cancelled) {
          const data = resp.data;
          previewCache[url] = data;
          setPreview(data);
        }
      } catch {
        // Silently fail - we'll show a basic link card
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreview();
    return () => { cancelled = true; };
  }, [url]);

  const displayTitle = providedTitle || preview?.title || hostname;
  const description = preview?.description;
  const image = preview?.image;
  const siteName = preview?.site_name || hostname;

  // Loading state - show minimal placeholder
  if (loading) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="p-4 flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 bg-gray-200 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </a>
    );
  }

  // Rich preview with thumbnail
  if (image) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden"
      >
        <div className="aspect-[2/1] bg-gray-200 overflow-hidden">
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
        <div className="p-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{siteName}</p>
          <p className="font-medium text-gray-900 text-sm line-clamp-2">{displayTitle}</p>
          {description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{description}</p>
          )}
        </div>
      </a>
    );
  }

  // Basic link card (no thumbnail available)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-3">
        <LinkIcon className="w-6 h-6 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <span className="text-base font-medium text-blue-600 block truncate">
            {displayTitle}
          </span>
          <p className="text-sm text-gray-500 truncate">{url}</p>
        </div>
      </div>
    </a>
  );
};

LinkPreviewCard.propTypes = {
  url: PropTypes.string.isRequired,
  title: PropTypes.string
};

export default LinkPreviewCard;
