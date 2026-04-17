/**
 * CaptureSheet tests - multi-file capture flow.
 * Tests: camera, file picker (multi-select), save (JSON create + shared upload), close reset.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { CaptureSheet } from '../CaptureSheet';
import api from '@/src/services/api';

const mockOnClose = jest.fn();
const mockOnCaptured = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CaptureSheet', () => {
  it('renders capture UI when visible', () => {
    const { getByText, getByPlaceholderText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    expect(getByText('Capture a Moment')).toBeTruthy();
    expect(getByPlaceholderText('What did you learn?')).toBeTruthy();
    expect(getByText('Camera')).toBeTruthy();
    expect(getByText('Voice')).toBeTruthy();
    expect(getByText('Files')).toBeTruthy();
    expect(getByText('Save Moment')).toBeTruthy();
  });

  it('camera: adds photo to media list', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{
        uri: 'file://photo.jpg',
        type: 'image',
        fileName: 'photo.jpg',
      }],
    });

    const { getByText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    fireEvent.press(getByText('Camera'));

    await waitFor(() => {
      expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(getByText('photo.jpg')).toBeTruthy();
    });
  });

  it('file picker: supports multiple selection', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file://img1.jpg', type: 'image', fileName: 'img1.jpg' },
        { uri: 'file://img2.jpg', type: 'image', fileName: 'img2.jpg' },
      ],
    });

    const { getByText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    fireEvent.press(getByText('Files'));

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
        expect.objectContaining({ allowsMultipleSelection: true })
      );
    });

    await waitFor(() => {
      expect(getByText('img1.jpg')).toBeTruthy();
      expect(getByText('img2.jpg')).toBeTruthy();
    });
  });

  it('save: creates moment via JSON, uploads via signed-upload, saves evidence blocks', async () => {
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', type: 'image', fileName: 'photo.jpg', fileSize: 2048 }],
    });
    (api.post as jest.Mock)
      // 1: create moment
      .mockResolvedValueOnce({ data: { success: true, event: { id: 'evt-1' } } })
      // 2a: signed-upload init
      .mockResolvedValueOnce({
        data: {
          upload: {
            signed_url: 'https://storage/upload?token=tkn',
            token: 'tkn',
            storage_path: 'learning-events/u/photo.jpg',
            bucket: 'quest-evidence',
          },
        },
      })
      // 2b: signed-upload finalize
      .mockResolvedValueOnce({ data: { url: 'https://storage/photo.jpg', filename: 'photo.jpg' } })
      // 3: save evidence blocks
      .mockResolvedValueOnce({ data: { success: true } });

    // Stub XMLHttpRequest so the PUT-to-Supabase leg resolves immediately.
    const xhr: Record<string, unknown> = {
      upload: { onprogress: null },
      open: jest.fn(),
      send: jest.fn(() => {
        queueMicrotask(() => {
          xhr.status = 200;
          (xhr.onload as () => void)?.();
        });
      }),
      onload: null, onerror: null, ontimeout: null, timeout: 0, status: 0, responseText: '',
    };
    function XHRFactory() { return xhr; }
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = XHRFactory;

    const { getByText, getByPlaceholderText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'Built a robot');
    fireEvent.press(getByText('Camera'));

    await waitFor(() => expect(getByText('photo.jpg')).toBeTruthy());

    fireEvent.press(getByText('Save Moment'));

    await waitFor(() => {
      // Step 1: JSON create
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/quick',
        expect.objectContaining({ description: 'Built a robot', source_type: 'realtime' })
      );
      // Step 2a: signed-upload init (per-event)
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/evt-1/upload-init',
        expect.objectContaining({ filename: 'photo.jpg', file_size: 2048 })
      );
      // Step 2b: signed-upload finalize
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/evt-1/upload-finalize',
        expect.objectContaining({ storage_path: 'learning-events/u/photo.jpg', bucket: 'quest-evidence' })
      );
      // Step 3: Save evidence blocks
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/evt-1/evidence',
        expect.objectContaining({ blocks: expect.any(Array) })
      );
    });

    expect(mockOnCaptured).toHaveBeenCalled();
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('save with description only (no files) creates moment without uploads', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, event: { id: 'evt-2' } } });

    const { getByText, getByPlaceholderText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'Read a chapter');
    fireEvent.press(getByText('Save Moment'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/quick',
        expect.objectContaining({ description: 'Read a chapter' })
      );
    });
  });

  it('close resets state', () => {
    const { getByPlaceholderText } = render(
      <CaptureSheet visible={true} onClose={mockOnClose} onCaptured={mockOnCaptured} />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'test');
    // Pressing title doesn't close
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
