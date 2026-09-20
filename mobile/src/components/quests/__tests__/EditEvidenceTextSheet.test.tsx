/**
 * A text block on a task can be reworded without being removed.
 *
 * Tami Eastman, iCreate, 2026-09-20: a spelling error in submitted evidence
 * could only be fixed by deleting the whole post and typing it again.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import {
  EditEvidenceTextSheet, replaceBlockText, textOfBlock,
} from '../EditEvidenceTextSheet';

const block = { id: 'b1', block_type: 'text', content: { text: 'I baked a caek' } };
const photo = { id: 'b2', block_type: 'image', content: { url: 'https://x/y.jpg' } };

describe('replaceBlockText', () => {
  it('rewords only the target block and keeps everything else on it', () => {
    const out = replaceBlockText([photo, block], block, 'I baked a cake');
    expect(out[0]).toBe(photo);
    expect(out[1]).toEqual({ id: 'b1', block_type: 'text', content: { text: 'I baked a cake', value: 'I baked a cake' } });
  });

  it('reads the older content.value spelling too', () => {
    expect(textOfBlock({ content: { value: 'old style' } })).toBe('old style');
    expect(textOfBlock({ content: {} })).toBe('');
  });

  it('a block that is not in the list changes nothing', () => {
    const out = replaceBlockText([photo], block, 'x');
    expect(out).toEqual([photo]);
  });
});

describe('EditEvidenceTextSheet', () => {
  it('opens on the block text, saves the trimmed edit, and closes', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const { getByLabelText, getByDisplayValue } = render(
      <EditEvidenceTextSheet visible block={block} onClose={onClose} onSave={onSave} />
    );
    expect(getByDisplayValue('I baked a caek')).toBeTruthy();

    fireEvent.changeText(getByLabelText('Evidence text'), ' I baked a cake ');
    fireEvent.press(getByLabelText('Save evidence text'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('I baked a cake'));
    expect(onClose).toHaveBeenCalled();
  });

  it('an unchanged or empty text cannot be saved', () => {
    const onSave = jest.fn();
    const { getByLabelText } = render(
      <EditEvidenceTextSheet visible block={block} onClose={jest.fn()} onSave={onSave} />
    );
    fireEvent.press(getByLabelText('Save evidence text'));
    fireEvent.changeText(getByLabelText('Evidence text'), '   ');
    fireEvent.press(getByLabelText('Save evidence text'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a failed save keeps the sheet open and says so', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('500'));
    const onClose = jest.fn();
    const { getByLabelText, findByText } = render(
      <EditEvidenceTextSheet visible block={block} onClose={onClose} onSave={onSave} />
    );
    fireEvent.changeText(getByLabelText('Evidence text'), 'I baked a cake');
    fireEvent.press(getByLabelText('Save evidence text'));

    expect(await findByText(/couldn't be saved/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
