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

  // Restore acting-as state on mount.
  // FE-M12 fix: the dependent (child) acting-as bearer token is NO LONGER
  // persisted in sessionStorage. A JWT sitting in web storage is stealable by
  // any XSS, which in this COPPA-sensitive flow meant child-account
  // impersonation for the token's lifetime. Instead we persist only the
  // non-sensitive dependent info and RE-MINT a fresh token from the backend on
  // reload (the backend re-verifies the parent owns this dependent), mirroring
  // the parent/masquerade pattern already used below and in masqueradeService.
  useEffect(() => {
    const restoreActingAsState = async () => {
      const stored = sessionStorage.getItem('acting_as_dependent');
      const storedParentName = sessionStorage.getItem('acting_as_parent_name');
      // Purge any token persisted by an older build.
      sessionStorage.removeItem('acting_as_token');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);

          // Re-mint the acting-as token via the parent's restored session
          // instead of reading a persisted one. Backend re-authorizes ownership.
          const response = await api.post(`/api/dependents/${parsed.id}/act-as`, {});
          const freshToken = response.data?.acting_as_token;
          if (!freshToken) {
            throw new Error('No acting_as_token returned on restore');
          }

          await tokenStore.setTokens(freshToken, tokenStore.getRefreshToken() || '');

          // Use startTransition for non-urgent state updates (prevents React errors #300 and #310)
          startTransition(() => {
            setActingAsDependent(parsed);
            setActingAsToken(freshToken);
            if (storedParentName) {
              setParentName(storedParentName);
            }
            logger.debug('[ActingAsContext] Re-minted acting-as token on reload');
          });
        } catch (error) {
          // Parent session unavailable or no longer authorized: drop acting-as
          // state and fall back to the parent's own session / re-auth.
          console.warn('[ActingAsContext] Could not restore acting-as on reload:', error.message);
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
      // FE-H1 fix: no sessionStorage token fallback anymore (parent tokens are
      // never persisted). If the backend round-trip fails, clear the acting-as
      // token so requests fall back to the parent's httpOnly-cookie session;
      // if that too is unavailable (cross-origin header-auth), the parent
      // re-authenticates. This is the secure default.
      console.warn('[ActingAsContext] Backend stop-acting-as failed; parent must re-authenticate if the cookie session is unavailable:', error.message);
    }

    // Clean up all acting-as state from sessionStorage (incl. removing any
    // legacy parent_* token values written by older builds).
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
        // FE-H1 fix: DO NOT persist the parent's access/refresh tokens in
        // sessionStorage. The long-lived parent refresh token there was
        // stealable by any XSS -> indefinite parent-account access in a
        // COPPA-sensitive flow. The parent session is restored on stop via a
        // backend round-trip (/api/dependents/stop-acting-as), matching the
        // masqueradeService pattern (backend mints tokens; only UI state cached).
        const parentRefresh = tokenStore.getRefreshToken();

        // Save parent's name for display in navbar
        if (user) {
          const parentDisplayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.display_name || 'Parent';
          sessionStorage.setItem('acting_as_parent_name', parentDisplayName);
        }

        // Request acting-as token from backend
        const response = await api.post(`/api/dependents/${dependent.id}/act-as`, {});
        const { acting_as_token } = response.data;

        // Persist ONLY the non-sensitive dependent info (FE-M12): the token is
        // held in memory and re-minted from the backend on reload, never written
        // to sessionStorage where XSS could steal it.
        sessionStorage.setItem('acting_as_dependent', JSON.stringify(dependent));

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
