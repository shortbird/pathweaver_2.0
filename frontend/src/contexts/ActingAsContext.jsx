import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ActingAsContext = createContext();

export const useActingAs = () => {
  const context = useContext(ActingAsContext);
  if (!context) {
    throw new Error('useActingAs must be used within ActingAsProvider');
  }
  return context;
};

export const ActingAsProvider = ({ children }) => {
  const { user } = useAuth();
  const [actingAsDependent, setActingAsDependent] = useState(null);

  // Load acting-as state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('acting_as_dependent');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setActingAsDependent(parsed);
      } catch (error) {
        console.error('Failed to parse acting_as_dependent from localStorage:', error);
        localStorage.removeItem('acting_as_dependent');
      }
    }
  }, []);

  // Clear acting-as state if user changes or logs out
  useEffect(() => {
    if (!user) {
      clearActingAs();
    }
  }, [user]);

  const setActingAs = (dependent) => {
    if (dependent) {
      localStorage.setItem('acting_as_dependent', JSON.stringify(dependent));
      setActingAsDependent(dependent);
    } else {
      clearActingAs();
    }
  };

  const clearActingAs = () => {
    localStorage.removeItem('acting_as_dependent');
    setActingAsDependent(null);
  };

  const value = {
    actingAsDependent,
    setActingAs,
    clearActingAs,
    isActingAsDependent: !!actingAsDependent
  };

  return (
    <ActingAsContext.Provider value={value}>
      {children}
    </ActingAsContext.Provider>
  );
};
