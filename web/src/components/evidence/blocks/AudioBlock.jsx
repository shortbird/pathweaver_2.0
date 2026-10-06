/**
 * AudioBlock - Plays a voice note recorded in the mobile app.
 *
 * Mobile's TaskEvidenceSheet saves these as block_type 'audio' with
 * content { url, filename, duration_ms }. Until 2026-10-06 the database
 * refused the type and nothing on web rendered it (tickets 9040e599,
 * 672adb58, 64c75285). Supports content.items too, like the other blocks.
 */

import React from 'react';

const AudioBlock = ({ block }) => {
  const { content } = block;
  const items = content?.items || (content?.url ? [{
    url: content.url,
    filename: content.filename,
    duration_ms: content.duration_ms
  }] : []);

  if (items.length === 0) {
    return <p className="text-sm text-gray-500">This voice note has no recording.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <audio
          key={item.url || i}
          controls
          preload="none"
          src={item.url}
          className="w-full"
          aria-label={item.filename ? `Voice note ${item.filename}` : 'Voice note'}
          data-testid="evidence-audio"
        />
      ))}
    </div>
  );
};

export default AudioBlock;
