/**
 * ChildSwitcher - one picker for the family scope, bound to familyStore.
 * It replaced three hand-rolled copies (Family tab header, Feed kid pills,
 * child-messages list) that each held their own selection.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ChildSwitcher, nameFor, initialsFor } from '../ChildSwitcher';
import { useFamilyStore } from '@/src/stores/familyStore';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

const KIDS = [
  createMockChild({ id: 'kid-a', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna' }),
  createMockChild({ id: 'kid-b', first_name: 'Hope', last_name: 'Hanna', display_name: 'Hope Hanna' }),
];

beforeEach(() => {
  useFamilyStore.setState({ parentId: 'parent-1', children: KIDS, selectedChildId: 'kid-a' });
});
afterEach(() => useFamilyStore.getState().clear());

describe('ChildSwitcher', () => {
  it('renders every child and writes the pick to the store', () => {
    const onSelect = jest.fn();
    const r = render(<ChildSwitcher onSelect={onSelect} />);
    fireEvent.press(r.getByLabelText('Hope Hanna'));
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-b');
    expect(onSelect).toHaveBeenCalledWith('kid-b');
  });

  it('renders nothing for a one-child family', () => {
    useFamilyStore.setState({ children: [KIDS[0]], selectedChildId: 'kid-a' });
    const r = render(<ChildSwitcher />);
    expect(r.toJSON()).toBeNull();
  });

  it('offers "All" only where every child at once is a real view, and leaves the store alone', () => {
    const onSelect = jest.fn();
    const r = render(<ChildSwitcher allowAll onSelect={onSelect} />);
    fireEvent.press(r.getByLabelText('All children'));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-a');
  });

  it('is a single avatar in the compact header form until tapped', () => {
    const r = render(<ChildSwitcher compact />);
    expect(r.queryByLabelText('Hope Hanna')).toBeNull();
    fireEvent.press(r.getByLabelText('Working with Romney Hanna. Change child'));
    expect(r.getByLabelText('Hope Hanna')).toBeTruthy();
  });

  it('names a child from whichever fields exist', () => {
    expect(nameFor({ display_name: 'Romney Hanna' })).toBe('Romney Hanna');
    expect(nameFor({ first_name: 'Hope', last_name: 'Hanna' })).toBe('Hope Hanna');
    expect(nameFor({})).toBe('Student');
    expect(initialsFor({ first_name: 'Hope', last_name: 'Hanna' })).toBe('HH');
    expect(initialsFor({ display_name: 'Romney Hanna' })).toBe('RH');
  });
});
