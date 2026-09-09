/**
 * useLinkPreview - Fetches Open Graph metadata for a URL via the backend proxy.
 *
 * Uses a module-level in-memory cache so multiple cards rendering the same
 * URL (or re-renders during feed pagination) only fetch once per session.
 * The backend already caches OG metadata for 7 days.
 */

import { useEffect, useState } from 'react';
import { api } from '../services/api';

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  video_url: string | null;
  og_type: string | null;
}

const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'vimeo.com',
  'instagram.com',
  'facebook.com',
];

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return VIDEO_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

export function isVideoPreview(preview: LinkPreview | null | undefined, url: string): boolean {
  if (!preview) return false;
  if (preview.og_type?.startsWith('video')) return true;
  if (preview.video_url) return true;
  return isVideoUrl(url);
}

// Cache a single resolved/in-flight promise per URL so we dedupe concurrent renders.
const cache = new Map<string, Promise<LinkPreview>>();

function fetchPreview(url: string): Promise<LinkPreview> {
  const existing = cache.get(url);
  if (existing) return existing;
  const p = api
    .get<LinkPreview>('/api/utils/link-preview', { params: { url } })
    .then((r) => r.data)
    .catch(() => {
      cache.delete(url);
      return {
        title: null,
        description: null,
        image: null,
        site_name: null,
        video_url: null,
        og_type: null,
      };
    });
  cache.set(url, p);
  return p;
}

export function useLinkPreview(url: string | null | undefined) {
  const [data, setData] = useState<LinkPreview | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetchPreview(url).then((preview) => {
      if (!cancelled) setData(preview);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data };
}
