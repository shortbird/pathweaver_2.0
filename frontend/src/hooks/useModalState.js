/**
 * useModalState Hook
 *
 * Reusable modal/dialog state management.
 * Supports multiple modals with optional data passing.
 *
 * Usage (single modal):
 *   const modal = useModalState();
 *   <button onClick={() => modal.open({ userId: 123 })}>Edit User</button>
 *   {modal.isOpen && <Modal onClose={modal.close} data={modal.data} />}
 *
 * Usage (multiple modals):
 *   const modals = useModalState({
 *     modals: ['edit', 'delete', 'create']
 *   });
 *   <button onClick={() => modals.open('edit', { userId: 123 })}>Edit</button>
 *   {modals.isOpen('edit') && <EditModal data={modals.getData('edit')} />}
 */

import { useState, useCallback, useMemo } from 'react';

export function useModalState({ modals = null } = {}) {
  // Single modal mode
  if (!modals) {
    const [isOpen, setIsOpen] = useState(false);
    const [data, setData] = useState(null);

    const open = useCallback((modalData = null) => {
      setData(modalData);
      setIsOpen(true);
    }, []);

    const close = useCallback(() => {
      setIsOpen(false);
      // Clear data after a brief delay to allow for exit animations
      setTimeout(() => setData(null), 150);
    }, []);

    const toggle = useCallback((modalData = null) => {
      if (isOpen) {
        close();
      } else {
        open(modalData);
      }
    }, [isOpen, open, close]);

    return {
      isOpen,
      data,
      open,
      close,
      toggle
    };
  }

  // Multi-modal mode
  const [state, setState] = useState(() => {
    const initial = {};
    modals.forEach(modalName => {
      initial[modalName] = { isOpen: false, data: null };
    });
    return initial;
  });

  const open = useCallback((modalName, modalData = null) => {
    setState(prev => ({
      ...prev,
      [modalName]: { isOpen: true, data: modalData }
    }));
  }, []);

  const close = useCallback((modalName) => {
    setState(prev => ({
      ...prev,
      [modalName]: { ...prev[modalName], isOpen: false }
    }));
    // Clear data after a brief delay
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        [modalName]: { ...prev[modalName], data: null }
      }));
    }, 150);
  }, []);

  const closeAll = useCallback(() => {
    setState(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = { isOpen: false, data: null };
      });
      return next;
    });
  }, []);

  const toggle = useCallback((modalName, modalData = null) => {
    setState(prev => {
      const current = prev[modalName];
      if (current?.isOpen) {
        return { ...prev, [modalName]: { isOpen: false, data: current.data } };
      } else {
        return { ...prev, [modalName]: { isOpen: true, data: modalData } };
      }
    });
  }, []);

  const isOpen = useCallback((modalName) => {
    return state[modalName]?.isOpen ?? false;
  }, [state]);

  const getData = useCallback((modalName) => {
    return state[modalName]?.data ?? null;
  }, [state]);

  const anyOpen = useMemo(() => {
    return Object.values(state).some(m => m.isOpen);
  }, [state]);

  const openModals = useMemo(() => {
    return Object.keys(state).filter(key => state[key].isOpen);
  }, [state]);

  return {
    state,
    open,
    close,
    closeAll,
    toggle,
    isOpen,
    getData,
    anyOpen,
    openModals
  };
}

export default useModalState;
