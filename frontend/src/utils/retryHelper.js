export const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Only retry on 503 (Service Unavailable) or network errors
      if (error.response?.status === 503 || !error.response) {
        if (i < maxRetries - 1) {
          // Exponential backoff with jitter
          const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Don't retry for other errors
      throw error;
    }
  }
  
  throw lastError;
};