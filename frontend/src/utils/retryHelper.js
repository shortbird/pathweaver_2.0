export const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000, showProgress = false) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Only retry on 503 (Service Unavailable) or network errors
      if (error.response?.status === 503 || !error.response) {
        if (i < maxRetries - 1) {
          // For 503 errors (service waking up), use longer delays
          const baseDelay = error.response?.status === 503 ? 3000 : initialDelay;
          
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(1.5, i) + Math.random() * 1000;
          
          if (showProgress && error.response?.status === 503) {
            console.log(`Service is waking up... Retrying in ${Math.round(delay/1000)} seconds (attempt ${i + 2}/${maxRetries})`);
          }
          
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

// Warm up the backend service (for cold starts on Render)
export const warmupBackend = async (apiUrl) => {
  try {
    // Remove trailing /api if present to avoid double prefix
    const baseUrl = apiUrl.replace(/\/api$/, '');
    const healthUrl = `${baseUrl}/api/health`;
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 503) {
      // Service is starting up, retry with backoff
      await retryWithBackoff(
        () => fetch(healthUrl),
        5, // More retries for warmup
        2000 // 2 second initial delay
      );
    }
    
    return true;
  } catch (error) {
    console.warn('Backend warmup failed, but continuing...', error);
    return false;
  }
};