// Frontend error handling utilities for standardized backend errors

import { useState, useCallback } from 'react';

/**
 * Parse standardized error response from backend
 * @param {Response|Error} error - The error response or exception
 * @returns {Object} Parsed error with message, code, and details
 */
export const parseError = async (error) => {
  // Handle Response objects from fetch
  if (error instanceof Response) {
    try {
      const data = await error.json();
      if (data.error) {
        return {
          message: data.error.message || 'An error occurred',
          code: data.error.code || 'UNKNOWN_ERROR',
          details: data.error.details || {},
          statusCode: error.status,
          requestId: data.error.request_id
        };
      }
    } catch (e) {
      // Failed to parse JSON response
      return {
        message: `HTTP ${error.status}: ${error.statusText}`,
        code: 'HTTP_ERROR',
        statusCode: error.status
      };
    }
  }
  
  // Handle regular Error objects
  if (error instanceof Error) {
    // Network errors
    if (error.message === 'Failed to fetch') {
      return {
        message: 'Network error. Please check your connection.',
        code: 'NETWORK_ERROR',
        details: { originalMessage: error.message }
      };
    }
    
    return {
      message: error.message,
      code: 'CLIENT_ERROR',
      details: { originalMessage: error.message }
    };
  }
  
  // Handle error objects from backend
  if (error && typeof error === 'object' && error.error) {
    return {
      message: error.error.message || 'An error occurred',
      code: error.error.code || 'UNKNOWN_ERROR',
      details: error.error.details || {},
      requestId: error.error.request_id
    };
  }
  
  // Fallback for unknown error types
  return {
    message: String(error),
    code: 'UNKNOWN_ERROR'
  };
};

/**
 * Display user-friendly error message
 * @param {Object} error - Parsed error object
 * @param {Object} options - Display options
 */
export const displayError = (error, options = {}) => {
  const {
    fallbackMessage = 'Something went wrong. Please try again.',
    showDetails = false,
    duration = 5000,
    onClose = null
  } = options;
  
  let message = error.message || fallbackMessage;
  
  // Add retry hint for transient errors
  if (['NETWORK_ERROR', 'EXTERNAL_SERVICE_ERROR', 'RATE_LIMIT_EXCEEDED'].includes(error.code)) {
    if (error.details?.retry_after) {
      message += ` Please wait ${error.details.retry_after} seconds.`;
    } else {
      message += ' Please try again in a moment.';
    }
  }
  
  // Add request ID for support
  if (error.requestId && showDetails) {
    message += ` (Request ID: ${error.requestId})`;
  }
  
  return message;
};

/**
 * Error handler for API calls with retry logic
 * @param {Function} apiCall - The API call function
 * @param {Object} options - Retry options
 */
export const withRetry = async (apiCall, options = {}) => {
  const {
    maxAttempts = 3,
    retryDelay = 1000,
    retryOn = ['NETWORK_ERROR', 'EXTERNAL_SERVICE_ERROR'],
    onRetry = null
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = await parseError(error);
      
      // Check if error is retryable
      const shouldRetry = retryOn.includes(lastError.code) && attempt < maxAttempts;
      
      if (shouldRetry) {
        if (onRetry) {
          onRetry(attempt, lastError);
        }
        
        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }
  
  throw lastError;
};

/**
 * Error boundary helper for React components
 */
export class ErrorHandler {
  static handleAuthError(error, navigate) {
    if (error.code === 'AUTHENTICATION_ERROR' || error.statusCode === 401) {
      // Clear local auth data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login
      if (navigate) {
        navigate('/login', {
          state: { message: 'Your session has expired. Please log in again.' }
        });
      }
      
      return true;
    }
    return false;
  }
  
  static handlePermissionError(error) {
    if (error.code === 'AUTHORIZATION_ERROR' || error.statusCode === 403) {
      return 'You don\'t have permission to perform this action.';
    }
    return null;
  }
  
  static handleValidationError(error) {
    if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
      // Extract field-specific errors if available
      if (error.details && typeof error.details === 'object') {
        return Object.entries(error.details)
          .map(([field, message]) => `${field}: ${message}`)
          .join('\n');
      }
      return error.message;
    }
    return null;
  }
  
  static handleRateLimitError(error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED' || error.statusCode === 429) {
      const retryAfter = error.details?.retry_after;
      if (retryAfter) {
        return `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
      }
      return 'Too many requests. Please wait a moment before trying again.';
    }
    return null;
  }
}

/**
 * React Hook for error handling
 */
export const useErrorHandler = () => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const handleAsync = useCallback(async (asyncFunction, options = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await asyncFunction();
      return result;
    } catch (err) {
      const parsedError = await parseError(err);
      setError(parsedError);
      
      if (options.throwError) {
        throw parsedError;
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    error,
    loading,
    handleAsync,
    clearError
  };
};

// Export for use in other files
export default {
  parseError,
  displayError,
  withRetry,
  ErrorHandler,
  useErrorHandler
};