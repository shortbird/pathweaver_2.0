import React, { createContext, useContext, useState, useEffect, useCallback, startTransition } from 'react';
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

  // Load acting-as state from sessionStorage on mount
  // sessionStorage clears on page refresh, returning user to parent account
  useEffect(() => {
    const restoreActingAsState = async () => {
      const stored = sessionStorage.getItem('acting_as_dependent');
      const storedToken = sessionStorage.getItem('acting_as_token');
      if (stored && storedToken) {
        try {
          const parsed = JSON.parse(stored);

          // CRITICAL: Restore token to tokenStore so it gets included in Authorization header
          await tokenStore.setTokens(storedToken, tokenStore.getRefreshToken() || '');

          // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
          startTransition(() => {
            setActingAsDependent(parsed);
            setActingAsToken(storedToken);
            console.log('[ActingAsContext] Restored acting-as token from sessionStorage');
          });
        } catch (error) {
          console.error('Failed to parse acting_as_dependent from sessionStorage:', error);
          sessionStorage.removeItem('acting_as_dependent');
          sessionStorage.removeItem('acting_as_token');
        }
      }
    };

    restoreActingAsState();
  }, []);

  // Memoized clearActingAs function to prevent re-renders
  const clearActingAs = useCallback(async () => {
    sessionStorage.removeItem('acting_as_dependent');
    sessionStorage.removeItem('acting_as_token');

    // Restore parent's saved tokens (saved before switching to dependent)
    const parentAccess = sessionStorage.getItem('parent_access_token');
    const parentRefresh = sessionStorage.getItem('parent_refresh_token');

    if (parentAccess && parentRefresh) {
      // Restore parent's tokens to tokenStore
      await tokenStore.setTokens(parentAccess, parentRefresh);
      // Clean up temporary parent token storage
      sessionStorage.removeItem('parent_access_token');
      sessionStorage.removeItem('parent_refresh_token');
      console.log('[ActingAsContext] Restored parent tokens');
    } else {
      console.warn('[ActingAsContext] No saved parent tokens found to restore');
    }

    // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
    startTransition(() => {
      setActingAsDependent(null);
      setActingAsToken(null);
      console.log('[ActingAsContext] Cleared acting-as state');
    });
  }, []);

  // Clear acting-as state if user changes or logs out
  useEffect(() => {
    if (!user) {
      clearActingAs();
    }
  }, [user, clearActingAs]);

  const setActingAs = async (dependent) => {
    if (dependent) {
      try {
        // CRITICAL: Save parent's tokens before switching to dependent
        const parentAccess = tokenStore.getAccessToken();
        const parentRefresh = tokenStore.getRefreshToken();

        if (parentAccess && parentRefresh) {
          sessionStorage.setItem('parent_access_token', parentAccess);
          sessionStorage.setItem('parent_refresh_token', parentRefresh);
          console.log('[ActingAsContext] Saved parent tokens before switching');
        }

        // Request acting-as token from backend
        const response = await api.post(`/api/dependents/${dependent.id}/act-as`, {});
        const { acting_as_token } = response.data;

        // Store dependent info and token in sessionStorage (clears on page refresh)
        sessionStorage.setItem('acting_as_dependent', JSON.stringify(dependent));
        sessionStorage.setItem('acting_as_token', acting_as_token);

        // Store token in tokenStore so it gets included in Authorization header
        await tokenStore.setTokens(acting_as_token, tokenStore.getRefreshToken() || parentRefresh);

        // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
        startTransition(() => {
          setActingAsDependent(dependent);
          setActingAsToken(acting_as_token);
          console.log('[ActingAsContext] Now acting as dependent:', dependent.display_name);
        });
      } catch (error) {
        console.error('[ActingAsContext] Failed to generate acting-as token:', error);
        throw error;
      }
    } else {
      await clearActingAs();
    }
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
