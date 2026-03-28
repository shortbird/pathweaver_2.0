/**
 * CaptureSheet parent capture tests - studentIds prop for single/multi-kid capture.
 * Uses JSON POST (not FormData) to create moments, then shared upload endpoint for files.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CaptureSheet } from '../CaptureSheet';
import api from '@/src/services/api';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CaptureSheet parent capture', () => {
  it('appends student_id and source_type=parent for single kid', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, event: { id: 'event-1' } } });

    const { getByPlaceholderText, getByText } = render(
      <CaptureSheet
        visible={true}
        onClose={jest.fn()}
        onCaptured={jest.fn()}
        studentIds={['child-1']}
      />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'Jane learned to cook');
    fireEvent.press(getByText('Save Moment'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/quick',
        expect.objectContaining({
          description: 'Jane learned to cook',
          source_type: 'parent',
          student_id: 'child-1',
        })
      );
    });
  });

  it('makes sequential POST calls for multiple kids', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, event: { id: 'event-1' } } });

    const { getByPlaceholderText, getByText } = render(
      <CaptureSheet
        visible={true}
        onClose={jest.fn()}
        onCaptured={jest.fn()}
        studentIds={['child-1', 'child-2', 'child-3']}
      />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'Family science project');
    fireEvent.press(getByText('Save Moment'));

    await waitFor(() => {
      // One POST per student
      expect(api.post).toHaveBeenCalledTimes(3);
    });

    // All should call the quick endpoint with JSON body
    for (const call of (api.post as jest.Mock).mock.calls) {
      expect(call[0]).toBe('/api/learning-events/quick');
      expect(call[1]).toHaveProperty('description', 'Family science project');
      expect(call[1]).toHaveProperty('source_type', 'parent');
    }
  });

  it('uses source_type=realtime when no studentIds provided', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, event: { id: 'event-1' } } });

    const { getByPlaceholderText, getByText } = render(
      <CaptureSheet visible={true} onClose={jest.fn()} onCaptured={jest.fn()} />
    );

    fireEvent.changeText(getByPlaceholderText('What did you learn?'), 'Learned something');
    fireEvent.press(getByText('Save Moment'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith(
        '/api/learning-events/quick',
        expect.objectContaining({
          description: 'Learned something',
          source_type: 'realtime',
        })
      );
    });
  });
});
