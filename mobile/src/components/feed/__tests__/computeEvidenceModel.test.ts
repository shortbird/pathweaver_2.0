/**
 * The feed card shows every piece of evidence on a post: every video, all of
 * the student's writing, and that writing beside photos. Each of these used to
 * keep only the first one (bug: "not all forms of evidence show in the feed").
 */

jest.mock('@/src/services/imageUrl', () => ({
  displayImageUrl: (url: string | null) => url,
  isHeicUrl: () => false,
}));
jest.mock('../VideoPlayer', () => ({ VideoPlayer: () => null }));
jest.mock('../DocumentViewer', () => ({ DocumentViewer: () => null, isPdfUrl: () => true }));
jest.mock('../CommentSheet', () => ({ CommentSheet: () => null }));
jest.mock('../MediaModal', () => ({ MediaModal: () => null }));
jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { computeEvidenceModel } from '../FeedCard';

describe('computeEvidenceModel', () => {
  it('keeps every video: the first plays inline, the rest are extras', () => {
    const m = computeEvidenceModel({
      type: 'document_blocks',
      blocks: [
        { type: 'video', url: 'https://x/v1.mp4' },
        { type: 'video', url: 'https://x/v2.mp4' },
      ],
    } as any);
    expect(m.videoUrl).toBe('https://x/v1.mp4');
    expect(m.extraVideos.map((v) => v.url)).toEqual(['https://x/v2.mp4']);
  });

  it('joins every text block instead of keeping the first', () => {
    const m = computeEvidenceModel({
      type: 'document_blocks',
      blocks: [
        { type: 'text', content: 'First part' },
        { type: 'image', url: 'https://x/a.jpg' },
        { type: 'text', content: 'Second part' },
      ],
    } as any);
    expect(m.textContent).toBe('First part\n\nSecond part');
    expect(m.imageUrls).toEqual(['https://x/a.jpg']);
  });

  it('reads a moment\'s text from preview_text even when it has media', () => {
    const m = computeEvidenceModel(
      { type: 'image', url: 'https://x/a.jpg', preview_text: 'What I did' } as any,
      [{ type: 'image', url: 'https://x/a.jpg' }] as any,
    );
    expect(m.textContent).toBe('What I did');
  });
});
