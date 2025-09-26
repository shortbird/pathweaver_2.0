import React from 'react';

// Standardized user-friendly error messages
const errorMessages = {
  // Authentication errors
  'auth/invalid-credentials': {
    message: 'Invalid email or password',
    suggestion: 'Please check your credentials and try again.'
  },
  'auth/user-not-found': {
    message: 'No account found with this email',
    suggestion: 'Please check your email or sign up for a new account.'
  },
  'auth/wrong-password': {
    message: 'Incorrect password',
    suggestion: 'Please try again or reset your password.'
  },
  'auth/email-already-in-use': {
    message: 'An account already exists with this email',
    suggestion: 'Please sign in or use a different email address.'
  },
  'auth/weak-password': {
    message: 'Password is too weak',
    suggestion: 'Please use at least 8 characters with uppercase, lowercase, and numbers.'
  },
  'auth/session-expired': {
    message: 'Your session has expired',
    suggestion: 'Please sign in again to continue.'
  },
  
  // Quest errors
  'quest/already-started': {
    message: 'You have already started this quest',
    suggestion: 'Continue from your dashboard or quest details page.'
  },
  'quest/not-found': {
    message: 'Quest not found',
    suggestion: 'This quest may have been removed or is no longer available.'
  },
  'quest/already-completed': {
    message: 'You have already completed this quest',
    suggestion: 'Check your diploma page to see your achievement.'
  },
  'quest/prerequisite-not-met': {
    message: 'Prerequisites not met for this quest',
    suggestion: 'Complete the required quests first to unlock this one.'
  },
  
  // Upload errors
  'upload/file-too-large': {
    message: 'File is too large',
    suggestion: 'Please upload files under 10MB. Consider compressing images or videos.'
  },
  'upload/invalid-type': {
    message: 'Invalid file type',
    suggestion: 'Supported formats: JPG, PNG, GIF, PDF, MP4, and common document types.'
  },
  'upload/failed': {
    message: 'Upload failed',
    suggestion: 'Please check your internet connection and try again.'
  },
  
  // Network errors
  'network/offline': {
    message: 'No internet connection',
    suggestion: 'Please check your connection and try again.'
  },
  'network/timeout': {
    message: 'Request timed out',
    suggestion: 'The server is taking too long to respond. Please try again.'
  },
  'network/server-error': {
    message: 'Server error occurred',
    suggestion: 'Something went wrong on our end. Please try again later.'
  },
  
  // Validation errors
  'validation/required-field': {
    message: 'Required field is missing',
    suggestion: 'Please fill in all required fields.'
  },
  'validation/invalid-email': {
    message: 'Invalid email format',
    suggestion: 'Please enter a valid email address.'
  },
  'validation/invalid-input': {
    message: 'Invalid input',
    suggestion: 'Please check your input and try again.'
  },
  
  // Permission errors
  'permission/denied': {
    message: 'Permission denied',
    suggestion: 'You do not have permission to perform this action.'
  },
  'permission/subscription-required': {
    message: 'Subscription required',
    suggestion: 'Upgrade your subscription to access this feature.'
  },
  
  // Diploma errors
  'diploma/not-found': {
    message: 'Diploma not found',
    suggestion: 'This diploma may be private or does not exist.'
  },
  'diploma/private': {
    message: 'This diploma is private',
    suggestion: 'The owner has not made this diploma publicly visible.'
  },
  
  // Default error
  'default': {
    message: 'Something went wrong',
    suggestion: 'Please try again. If the problem persists, contact support.'
  }
};

// Helper function to get user-friendly error message
export const getUserFriendlyError = (errorCode, fallbackMessage = null) => {
  // Check if we have a specific error message
  const errorInfo = errorMessages[errorCode] || errorMessages['default'];
  
  // If a fallback message is provided and we're using default, use the fallback
  if (fallbackMessage && errorCode && !errorMessages[errorCode]) {
    return {
      message: fallbackMessage,
      suggestion: errorInfo.suggestion
    };
  }
  
  return errorInfo;
};

// Helper function to format error for display
export const formatErrorMessage = (error) => {
  let errorCode = 'default';
  let fallbackMessage = null;
  
  // Extract error code from different error formats
  if (typeof error === 'string') {
    // Simple string error
    errorCode = error.toLowerCase().replace(/\s+/g, '-');
  } else if (error?.response?.data?.code) {
    // API response error with code
    errorCode = error.response.data.code;
    fallbackMessage = error.response.data.message;
  } else if (error?.code) {
    // Error object with code
    errorCode = error.code;
    fallbackMessage = error.message;
  } else if (error?.message) {
    // Error object with message only
    fallbackMessage = error.message;
    // Try to extract a code from the message
    if (error.message.toLowerCase().includes('auth')) {
      errorCode = 'auth/invalid-credentials';
    } else if (error.message.toLowerCase().includes('network')) {
      errorCode = 'network/server-error';
    } else if (error.message.toLowerCase().includes('permission')) {
      errorCode = 'permission/denied';
    }
  }
  
  return getUserFriendlyError(errorCode, fallbackMessage);
};

// Toast notification helper
export const showErrorToast = (error, toast) => {
  const { message, suggestion } = formatErrorMessage(error);
  
  if (toast) {
    toast.error(
      <div>
        <div className="font-semibold">{message}</div>
        {suggestion && (
          <div className="text-sm mt-1 opacity-90">{suggestion}</div>
        )}
      </div>
    );
  } else {
    // Fallback to console if toast is not available
    console.error(`Error: ${message}. ${suggestion}`);
  }
};

// Success messages for common actions
export const successMessages = {
  'quest/started': 'Quest started successfully!',
  'quest/completed': 'Congratulations! Quest completed!',
  'task/completed': 'Task completed successfully!',
  'profile/updated': 'Profile updated successfully!',
  'diploma/shared': 'Diploma link copied to clipboard!',
  'collaboration/sent': 'Team-up invitation sent!',
  'collaboration/accepted': 'Team-up invitation accepted!',
  'evidence/uploaded': 'Evidence uploaded successfully!',
  'settings/updated': 'Settings updated successfully!'
};

export default errorMessages;