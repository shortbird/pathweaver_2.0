/**
 * familyStore - the family scope (which child a parent is working for) and
 * the Add-a-kid sheet state it absorbed from addKidStore.
 */
import * as SecureStore from 'expo-secure-store';
import { useFamilyStore, useAddKidStore } from '../familyStore';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

const KIDS = [
  createMockChild({ id: 'kid-a', first_name: 'Romney', display_name: 'Romney Hanna' }),
  createMockChild({ id: 'kid-b', first_name: 'Hope', display_name: 'Hope Hanna' }),
];

beforeEach(() => {
  useFamilyStore.getState().clear();
  useFamilyStore.setState({ visible: false, version: 0 });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  jest.clearAllMocks();
});

describe('reconcile (after every children fetch)', () => {
  it('defaults to the first child when nothing was ever picked', async () => {
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-a');
    expect(useFamilyStore.getState().children).toEqual(KIDS);
  });

  it('keeps a selection the parent made', async () => {
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    useFamilyStore.getState().setSelected('kid-b');
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-b');
  });

  it('drops a child who is no longer in the family', async () => {
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    useFamilyStore.getState().setSelected('kid-b');
    await useFamilyStore.getState().reconcile('parent-1', [KIDS[0]]);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-a');
  });

  it('restores the remembered child for this parent on a fresh start', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('kid-b');
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('optio_family_scope:parent-1');
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-b');
  });

  it('never carries one parent\'s selection to another account', async () => {
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    useFamilyStore.getState().setSelected('kid-b');
    const other = [createMockChild({ id: 'kid-z', display_name: 'Zed' })];
    await useFamilyStore.getState().reconcile('parent-2', other);
    expect(useFamilyStore.getState().selectedChildId).toBe('kid-z');
  });
});

describe('setSelected', () => {
  it('remembers the choice per parent', async () => {
    await useFamilyStore.getState().reconcile('parent-1', KIDS);
    useFamilyStore.getState().setSelected('kid-b');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('optio_family_scope:parent-1', 'kid-b');
  });
});

describe('the Add-a-kid half (was addKidStore)', () => {
  it('still opens, closes and bumps the version under the old name', () => {
    useAddKidStore.getState().open();
    expect(useAddKidStore.getState().visible).toBe(true);
    useAddKidStore.getState().close();
    expect(useAddKidStore.getState().visible).toBe(false);
    useAddKidStore.getState().refreshChildren();
    expect(useAddKidStore.getState().version).toBe(1);
    // one store, not two
    expect(useAddKidStore).toBe(useFamilyStore);
  });
});
