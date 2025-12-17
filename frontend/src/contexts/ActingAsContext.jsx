import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import api, { tokenStore } from '../services/api';

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
  const [actingAsToken, setActingAsToken] = useState(null);

  // Load acting-as state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('acting_as_dependent');
    const storedToken = localStorage.getItem('acting_as_token');
    if (stored && storedToken) {
      try {
        const parsed = JSON.parse(stored);
        setActingAsDependent(parsed);
        setActingAsToken(storedToken);
      } catch (error) {
        console.error('Failed to parse acting_as_dependent from localStorage:', error);
        localStorage.removeItem('acting_as_dependent');
        localStorage.removeItem('acting_as_token');
      }
    }
  }, []);

  // Clear acting-as state if user changes or logs out
  useEffect(() => {
    if (!user) {
      clearActingAs();
    }
  }, [user]);

  const setActingAs = async (dependent) => {
    if (dependent) {
      try {
        // Request acting-as token from backend
        const response = await api.post(`/api/dependents/${dependent.id}/act-as`, {});
        const { acting_as_token } = response.data;

        // Store dependent info and token
        localStorage.setItem('acting_as_dependent', JSON.stringify(dependent));
        localStorage.setItem('acting_as_token', acting_as_token);
        setActingAsDependent(dependent);
        setActingAsToken(acting_as_token);

        // Store token in tokenStore so it gets included in Authorization header
        tokenStore.setTokens(acting_as_token, tokenStore.getRefreshToken() || '');

        console.log('[ActingAsContext] Now acting as dependent:', dependent.display_name);
      } catch (error) {
        console.error('[ActingAsContext] Failed to generate acting-as token:', error);
        throw error;
      }
    } else {
      clearActingAs();
    }
  };

  const clearActingAs = () => {
    localStorage.removeItem('acting_as_dependent');
    localStorage.removeItem('acting_as_token');
    setActingAsDependent(null);
    setActingAsToken(null);

    // Restore regular tokens to tokenStore (clear acting-as token)
    const regularAccess = localStorage.getItem('access_token');
    const regularRefresh = localStorage.getItem('refresh_token');
    if (regularAccess && regularRefresh) {
      tokenStore.setTokens(regularAccess, regularRefresh);
    }

    console.log('[ActingAsContext] Cleared acting-as state');
  };

  const value = {
    actingAsDependent,
    actingAsToken,
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
