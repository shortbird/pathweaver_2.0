import React, { createContext, useContext, useState, useEffect, useCallback, startTransition } from 'react';
import { useAuth } from './AuthContext';
import api, { tokenStore } from '../services/api';
import logger from '../utils/logger';

const ActingAsContext = createContext();

export const useActingAs = () => {
  const context = useContext(ActingAsContext);
  if (!context) {
    throw new Error('useActingAs must be used within ActingAsProvider');
  }
  return context;
};

export const ActingAsProvider = ({ children }) => {
  const { user, loading } = useAuth();
  const [actingAsDependent, setActingAsDependent] = useState(null);
  const [actingAsToken, setActingAsToken] = useState(null);
  const [parentName, setParentName] = useState(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load acting-as state from sessionStorage on mount
  // sessionStorage persists acting-as state across page reloads
  useEffect(() => {
    const restoreActingAsState = async () => {
      const stored = sessionStorage.getItem('acting_as_dependent');
      const storedToken = sessionStorage.getItem('acting_as_token');
      const storedParentName = sessionStorage.getItem('acting_as_parent_name');
      if (stored && storedToken) {
        try {
          const parsed = JSON.parse(stored);

          // CRITICAL: Restore token to tokenStore so it gets included in Authorization header
          await tokenStore.setTokens(storedToken, tokenStore.getRefreshToken() || '');

          // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
          startTransition(() => {
            setActingAsDependent(parsed);
            setActingAsToken(storedToken);
            if (storedParentName) {
              setParentName(storedParentName);
            }
            logger.debug('[ActingAsContext] Restored acting-as token from sessionStorage');
          });
        } catch (error) {
          console.error('Failed to parse acting_as_dependent from sessionStorage:', error);
          sessionStorage.removeItem('acting_as_dependent');
          sessionStorage.removeItem('acting_as_token');
          sessionStorage.removeItem('acting_as_parent_name');
        }
      }
      // Mark as initialized after attempting to restore
      setHasInitialized(true);
    };

    restoreActingAsState();
  }, []);

  // Memoized clearActingAs function to prevent re-renders
  const clearActingAs = useCallback(async () => {
    try {
      // CROSS-ORIGIN FIX: Call backend to get fresh parent tokens
      // This bypasses sessionStorage issues in production where frontend (optioeducation.com)
      // and backend (onrender.com) are on different domains
      const response = await api.post('/api/dependents/stop-acting-as', {});

      if (response.data.success) {
        const { access_token, refresh_token } = response.data;

        // Store fresh parent tokens
        await tokenStore.setTokens(access_token, refresh_token);
        logger.debug('[ActingAsContext] Fresh parent tokens received from backend');
      } else {
        console.error('[ActingAsContext] Backend returned error:', response.data.error);
        // Fall through to sessionStorage fallback
        throw new Error(response.data.error || 'Failed to get parent tokens from backend');
      }
    } catch (error) {
      console.warn('[ActingAsContext] Backend stop-acting-as failed, trying sessionStorage fallback:', error.message);

      // FALLBACK: Try sessionStorage (works in same-origin environments like localhost)
      const parentAccess = sessionStorage.getItem('parent_access_token');
      const parentRefresh = sessionStorage.getItem('parent_refresh_token');

      if (parentAccess && parentRefresh) {
        await tokenStore.setTokens(parentAccess, parentRefresh);
        logger.debug('[ActingAsContext] Restored parent tokens from sessionStorage fallback');
      } else {
        console.error('[ActingAsContext] No parent tokens available - user will need to log in again');
      }
    }

    // Clean up all acting-as state from sessionStorage
    sessionStorage.removeItem('acting_as_dependent');
    sessionStorage.removeItem('acting_as_token');
    sessionStorage.removeItem('acting_as_parent_name');
    sessionStorage.removeItem('parent_access_token');
    sessionStorage.removeItem('parent_refresh_token');

    // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
    startTransition(() => {
      setActingAsDependent(null);
      setActingAsToken(null);
      setParentName(null);
      logger.debug('[ActingAsContext] Cleared acting-as state');
    });
  }, []);

  // Clear acting-as state if user logs out (NOT during initial load)
  // CRITICAL: Only run after initialization AND auth loading is complete
  // Otherwise this wipes sessionStorage before we can restore acting-as state
  useEffect(() => {
    if (hasInitialized && !loading && !user) {
      // Only clear if there's actually an acting-as state to clear
      // This prevents unnecessary API calls and 401 errors on public pages
      if (actingAsDependent || actingAsToken) {
        logger.debug('[ActingAsContext] User logged out, clearing acting-as state');
        clearActingAs();
      } else {
        // Just clear sessionStorage without API call if no acting-as state
        sessionStorage.removeItem('acting_as_dependent');
        sessionStorage.removeItem('acting_as_token');
        sessionStorage.removeItem('acting_as_parent_name');
        sessionStorage.removeItem('parent_access_token');
        sessionStorage.removeItem('parent_refresh_token');
      }
    }
  }, [user, loading, hasInitialized, clearActingAs, actingAsDependent, actingAsToken]);

  const setActingAs = async (dependent, redirectTo = '/dashboard') => {
    if (dependent) {
      try {
        // CRITICAL: Save parent's tokens before switching to dependent
        const parentAccess = tokenStore.getAccessToken();
        const parentRefresh = tokenStore.getRefreshToken();

        if (parentAccess && parentRefresh) {
          sessionStorage.setItem('parent_access_token', parentAccess);
          sessionStorage.setItem('parent_refresh_token', parentRefresh);
          logger.debug('[ActingAsContext] Saved parent tokens before switching');
        }

        // Save parent's name for display in navbar
        if (user) {
          const parentDisplayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.display_name || 'Parent';
          sessionStorage.setItem('acting_as_parent_name', parentDisplayName);
        }

        // Request acting-as token from backend
        const response = await api.post(`/api/dependents/${dependent.id}/act-as`, {});
        const { acting_as_token } = response.data;

        // Store dependent info and token in sessionStorage (clears on page refresh)
        sessionStorage.setItem('acting_as_dependent', JSON.stringify(dependent));
        sessionStorage.setItem('acting_as_token', acting_as_token);

        // Store token in tokenStore so it gets included in Authorization header
        await tokenStore.setTokens(acting_as_token, tokenStore.getRefreshToken() || parentRefresh);

        logger.debug('[ActingAsContext] Now acting as dependent:', dependent.display_name);

        // CRITICAL FIX: Force full page reload to clear React Query cache
        // Without this, cached data from parent session shows instead of dependent's data
        // This matches the behavior of clearActingAs() which does window.location.href
        window.location.href = redirectTo;

        // The code below won't be reached due to page redirect, but keep for fallback
        startTransition(() => {
          setActingAsDependent(dependent);
          setActingAsToken(acting_as_token);
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
    parentName,
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
