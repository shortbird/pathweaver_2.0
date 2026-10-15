/**
 * Ticket d0cc8d45: a student pasted a path to a file on their own device
 * (`file:///home/chronos/.../Screenshot ....png`) into an evidence link
 * field. It saved as a link block, the file was never uploaded, and the
 * teacher saw nothing.
 *
 * Every mobile field where a student types a link now refuses a local path,
 * says why, and does not save it. A normal https link still saves. A saved
 * one shows "<name> never uploaded" instead of a link that opens nothing.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { CaptureSheet } from '../CaptureSheet';
import { CaptureModal } from '../CaptureModal';
import { TaskEvidenceSheet } from '../TaskEvidenceSheet';
import { LtiEvidenceEditor } from '../../lti/LtiEvidenceEditor';
import { EvidenceBlockDisplay } from '../../quests/QuestDetailView';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/signedUpload', () => ({
  uploadViaSignedUrl: jest.fn(),
}));

const LOCAL =
  'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/Screenshot 2026-07-23 8.43.22 AM.png';
const GOOD = 'https://docs.google.com/document/d/abc/edit';
const MESSAGE =
  "That's a file on your computer, not a link, so no one else can open it. Use Upload to add the file instead.";
const NEVER_UPLOADED =
  'Screenshot 2026-07-23 8.43.22 AM.png never uploaded. Add it again with Upload.';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CaptureSheet link field (ticket d0cc8d45)', () => {
  const fill = (url: string) => {
    const utils = render(<CaptureSheet visible onClose={jest.fn()} />);
    fireEvent.changeText(utils.getByPlaceholderText('What did you learn?'), 'Made a poster');
    fireEvent.changeText(utils.getByPlaceholderText('Add a link (optional)'), url);
    return utils;
  };

  it('a pasted file path shows the message and Save does not create the moment', async () => {
    const { getByText, getByTestId } = fill(LOCAL);
    expect(getByTestId('local-file-path-message')).toHaveTextContent(MESSAGE);
    fireEvent.press(getByText('Save Moment'));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a normal https link still saves', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { event: { id: 'evt-1' } } });
    const { getByText, queryByTestId } = fill(GOOD);
    expect(queryByTestId('local-file-path-message')).toBeNull();
    fireEvent.press(getByText('Save Moment'));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/learning-events/quick', expect.anything()),
    );
  });
});

describe('CaptureModal link block (ticket d0cc8d45)', () => {
  const fill = (url: string) => {
    const utils = render(<CaptureModal visible onClose={jest.fn()} />);
    fireEvent.changeText(utils.getByPlaceholderText('What did you learn?'), 'Made a poster');
    fireEvent.press(utils.getByText('Link'));
    fireEvent.changeText(utils.getByPlaceholderText('https://...'), url);
    return utils;
  };

  it('a pasted file path shows the message and Save does not create the moment', async () => {
    const { getByText, getByTestId } = fill(LOCAL);
    expect(getByTestId('local-file-path-message')).toHaveTextContent(MESSAGE);
    // The button is disabled, so the press reaches the card behind it, whose
    // handler stops propagation; give it an event to call that on.
    fireEvent.press(getByText('Save Moment'), { stopPropagation: jest.fn() });
    await new Promise((r) => setTimeout(r, 0));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('a normal https link still saves', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { event: { id: 'evt-1' } } });
    const { getByText, queryByTestId } = fill(GOOD);
    expect(queryByTestId('local-file-path-message')).toBeNull();
    fireEvent.press(getByText('Save Moment'), { stopPropagation: jest.fn() });
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/learning-events/evt-1/evidence', {
        blocks: [expect.objectContaining({ block_type: 'link', content: { url: GOOD, title: GOOD } })],
      }),
    );
  });
});

describe('TaskEvidenceSheet link field (ticket d0cc8d45)', () => {
  const fill = (url: string, onSave: jest.Mock) => {
    const utils = render(
      <TaskEvidenceSheet visible taskTitle="Poster" existingBlocks={[]} onClose={jest.fn()} onSave={onSave} />,
    );
    fireEvent.changeText(utils.getByPlaceholderText('https://'), url);
    return utils;
  };

  it('a pasted file path shows the message and Save Evidence saves nothing', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = fill(LOCAL, onSave);
    expect(getByTestId('local-file-path-message')).toHaveTextContent(MESSAGE);
    fireEvent.press(getByText('Save Evidence'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a normal https link still saves', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const { getByText, queryByTestId } = fill(GOOD, onSave);
    expect(queryByTestId('local-file-path-message')).toBeNull();
    fireEvent.press(getByText('Save Evidence'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        [expect.objectContaining({ type: 'link', content: { url: GOOD, title: GOOD } })],
        expect.anything(),
      ),
    );
  });
});

describe('LTI evidence editor link field (ticket d0cc8d45)', () => {
  it('a pasted file path shows the message and Add link adds nothing', () => {
    const { getByText, getByTestId } = render(
      <LtiEvidenceEditor taskId="t1" onComplete={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('lti-evidence-link'), LOCAL);
    expect(getByTestId('local-file-path-message')).toHaveTextContent(MESSAGE);
    fireEvent.press(getByText('Add link'));
    expect(getByText('Mark complete (0)')).toBeTruthy();
  });

  it('a normal https link is still added and submitted', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId, queryByTestId } = render(
      <LtiEvidenceEditor taskId="t1" onComplete={onComplete} />,
    );
    fireEvent.changeText(getByTestId('lti-evidence-link'), GOOD);
    expect(queryByTestId('local-file-path-message')).toBeNull();
    fireEvent.press(getByText('Add link'));
    fireEvent.press(getByText('Mark complete (1)'));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'link', content: { url: GOOD } }]),
    );
  });
});

describe('saved link evidence on the quest task (EvidenceBlockDisplay, ticket d0cc8d45)', () => {
  it('a file path says the file never uploaded, with no link', () => {
    const { getByText, queryByText } = render(
      <EvidenceBlockDisplay block={{ block_type: 'link', content: { url: LOCAL, title: LOCAL } }} />,
    );
    expect(getByText(NEVER_UPLOADED)).toBeTruthy();
    expect(queryByText(LOCAL)).toBeNull();
  });

  it('a normal link is unchanged', () => {
    const { getByText, queryByTestId } = render(
      <EvidenceBlockDisplay block={{ block_type: 'link', content: { url: GOOD, title: 'Essay' } }} />,
    );
    expect(getByText(GOOD)).toBeTruthy();
    expect(getByText('Essay')).toBeTruthy();
    expect(queryByTestId('never-uploaded-notice')).toBeNull();
  });
});
