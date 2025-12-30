/**
 * Error handling utilities
 * Provides standardized error handling and user-friendly error messages
 */

/**
 * Extract user-friendly error message from various error types
 * @param {Error|string|unknown} error - The error object or message
 * @returns {string} User-friendly error message
 */
export function getErrorMessage(error) {
  if (!error) return "An unknown error occurred";

  // Handle string errors
  if (typeof error === "string") return error;

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message || error.toString();

    // Handle common Web3 errors
    if (message.includes("user rejected")) {
      return "Transaction was rejected. Please try again.";
    }
    if (message.includes("insufficient funds")) {
      return "Insufficient funds for this transaction.";
    }
    if (message.includes("network")) {
      return "Network error. Please check your connection and try again.";
    }
    if (message.includes("nonce")) {
      return "Transaction nonce error. Please try again.";
    }
    if (message.includes("replacement transaction underpriced")) {
      return "A transaction with the same nonce is already pending. Please wait or increase gas price.";
    }
    if (message.includes("execution reverted")) {
      // Try to extract custom error message
      const match = message.match(/execution reverted: (.+)/);
      if (match) return match[1];
      return "Transaction failed. The contract rejected the transaction.";
    }
    if (message.includes("Merkle root already committed")) {
      return "This Merkle root has already been committed to the blockchain.";
    }
    if (message.includes("Only committer can update")) {
      return "Only the original committer can update this metadata.";
    }
    if (message.includes("MetadataTooLong")) {
      return "Metadata is too long. Maximum length is 2048 bytes.";
    }

    return message;
  }

  // Handle objects with message property
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  // Handle objects with reason property (ethers.js)
  if (error && typeof error === "object" && "reason" in error) {
    return getErrorMessage(error.reason);
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Log error with context for debugging
 * @param {Error|string|unknown} error - The error
 * @param {string} context - Context where error occurred
 */
export function logError(error, context = "Unknown") {
  console.error(`[${context}]`, error);
  
  // In development, log full error details
  if (import.meta.env.DEV) {
    if (error instanceof Error) {
      console.error("Error stack:", error.stack);
    }
  }
}

/**
 * Create a standardized error object
 * @param {string} message - Error message
 * @param {string} code - Error code (optional)
 * @param {unknown} originalError - Original error (optional)
 * @returns {Error} Standardized error
 */
export function createError(message, code = null, originalError = null) {
  const error = new Error(message);
  if (code) error.code = code;
  if (originalError) error.originalError = originalError;
  return error;
}

