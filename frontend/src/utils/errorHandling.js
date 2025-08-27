/**
 * Utility functions for consistent API error handling
 */

/**
 * Extracts error message from API response data
 * Handles different error response formats:
 * 1. Direct error string: { error: "Error message" }
 * 2. Structured error object: { error: { message: "Error message", code: "ERROR_CODE" } }
 * 3. Message field fallback: { message: "Error message" }
 * 
 * @param {Object} data - Response data from API
 * @param {string} fallbackMessage - Default error message if none found
 * @returns {string} - Extracted error message
 */
export function extractErrorMessage(data, fallbackMessage = 'An error occurred') {
  if (data.error) {
    // Handle structured error responses from middleware
    if (typeof data.error === 'object' && data.error.message) {
      return data.error.message;
    }
    // Handle direct error responses from routes
    else if (typeof data.error === 'string') {
      return data.error;
    }
  } else if (data.message) {
    // Fallback to message field
    return data.message;
  }
  
  return fallbackMessage;
}

/**
 * Handles API response and throws appropriate error if response is not ok
 * 
 * @param {Response} response - Fetch response object
 * @param {Object} data - Parsed JSON data from response
 * @param {string} fallbackMessage - Default error message
 * @throws {Error} - Throws error with extracted message if response not ok
 */
export function handleApiResponse(response, data, fallbackMessage = 'Request failed') {
  if (!response.ok) {
    const errorMessage = extractErrorMessage(data, fallbackMessage);
    throw new Error(errorMessage);
  }
}

/**
 * Makes a fetch request with consistent error handling
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {string} fallbackMessage - Default error message
 * @returns {Promise<Object>} - Response data
 * @throws {Error} - Throws error with extracted message if response not ok
 */
export async function fetchWithErrorHandling(url, options = {}, fallbackMessage = 'Request failed') {
  const response = await fetch(url, options);
  const data = await response.json();
  
  handleApiResponse(response, data, fallbackMessage);
  
  return data;
}