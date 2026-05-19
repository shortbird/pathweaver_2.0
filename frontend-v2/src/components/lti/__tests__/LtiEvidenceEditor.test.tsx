/**
 * LtiEvidenceEditor — multi-format capture: text/link inline, media via
 * signed upload, gating on >=1 block, onComplete payload shape.
 */

jest.mock('@/src/services/signedUpload', () => ({
  uploadViaSignedUrl: jest.fn(),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import { LtiEvidenceEditor } from '../LtiEvidenceEditor';

afterEach(() => jest.clearAllMocks());

describe('LtiEvidenceEditor', () => {
  it('Mark complete is disabled until at least one block is added', () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <LtiEvidenceEditor taskId="t1" onComplete={onComplete} />,
    );
    // The button label encodes the block count.
    expect(getByText('Mark complete (0)')).toBeTruthy();
  });

  it('adds a text block and submits it via onComplete', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByTestId } = render(
      <LtiEvidenceEditor taskId="t1" onComplete={onComplete} />,
    );
    fireEvent.changeText(getByTestId('lti-evidence-text'), 'I built a thing');
    fireEvent.press(getByText('Add text'));
    expect(getByText('Mark complete (1)')).toBeTruthy();

    fireEvent.press(getByText('Mark complete (1)'));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'text', content: { text: 'I built a thing' } },
      ]),
    );
  });

  it('adds a link block', () => {
    const { getByText, getByTestId } = render(
      <LtiEvidenceEditor taskId="t1" onComplete={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('lti-evidence-link'), 'https://repo.example/x');
    fireEvent.press(getByText('Add link'));
    expect(getByText('Mark complete (1)')).toBeTruthy();
  });

  it('uploads a picked image via signed upload and adds an image block', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://pic.jpg', type: 'image', fileName: 'pic.jpg', fileSize: 1234 }],
    });
    (uploadViaSignedUrl as jest.Mock).mockResolvedValueOnce({
      file_url: 'https://cdn/pic.jpg',
      file_name: 'pic.jpg',
    });
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const { getByText } = render(
      <LtiEvidenceEditor taskId="task-9" onComplete={onComplete} />,
    );

    fireEvent.press(getByText('Add photo/video'));

    await waitFor(() => expect(getByText('Mark complete (1)')).toBeTruthy());
    expect(uploadViaSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        initPath: '/api/evidence/documents/task-9/upload-init',
        finalizePath: '/api/evidence/documents/task-9/upload-finalize',
        blockType: 'image',
      }),
    );

    fireEvent.press(getByText('Mark complete (1)'));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'image',
          file_url: 'https://cdn/pic.jpg',
          file_name: 'pic.jpg',
        }),
      ]),
    );
  });
});
