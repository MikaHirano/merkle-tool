/**
 * Input validation utilities
 * Provides validation functions for user inputs
 */

import { ETH_ADDRESS_REGEX, ETH_ADDRESS_LENGTH, MERKLE_ROOT_REGEX, MERKLE_ROOT_LENGTH } from "./constants.js";
import { ethers } from "ethers";

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid format
 */
export function isValidAddressFormat(address) {
  if (!address || typeof address !== "string") return false;
  return ETH_ADDRESS_REGEX.test(address.trim());
}

/**
 * Validate and checksum Ethereum address
 * @param {string} address - Address to validate
 * @returns {string|null} Checksummed address or null if invalid
 */
export function validateAndChecksumAddress(address) {
  if (!address || typeof address !== "string") return null;
  
  const trimmed = address.trim();
  if (!isValidAddressFormat(trimmed)) return null;

  try {
    // ethers.js getAddress() validates and returns checksummed address
    return ethers.getAddress(trimmed);
  } catch (error) {
    return null;
  }
}

/**
 * Validate Merkle root format (64 hex characters, with or without 0x prefix)
 * @param {string} root - Merkle root to validate
 * @returns {boolean} True if valid format
 */
export function isValidMerkleRootFormat(root) {
  if (!root || typeof root !== "string") return false;
  
  const cleaned = root.trim();
  const withoutPrefix = cleaned.startsWith("0x") || cleaned.startsWith("0X") 
    ? cleaned.slice(2) 
    : cleaned;
  
  return MERKLE_ROOT_REGEX.test(withoutPrefix);
}

/**
 * Normalize Merkle root (ensure 0x prefix and lowercase)
 * @param {string} root - Merkle root to normalize
 * @returns {string} Normalized root
 */
export function normalizeMerkleRoot(root) {
  if (!root) return "";
  const cleaned = String(root).trim();
  const withoutPrefix = cleaned.startsWith("0x") || cleaned.startsWith("0X")
    ? cleaned.slice(2)
    : cleaned;
  return `0x${withoutPrefix.toLowerCase()}`;
}

/**
 * Sanitize string input (remove dangerous characters)
 * @param {string} input - Input to sanitize
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, maxLength = null) {
  if (!input || typeof input !== "string") return "";
  
  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "");
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Apply length limit if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate metadata string length
 * @param {string} metadata - Metadata to validate
 * @param {number} maxLength - Maximum allowed length (default: 2048)
 * @returns {{valid: boolean, length: number, maxLength: number}} Validation result
 */
export function validateMetadataLength(metadata, maxLength = 2048) {
  const length = metadata ? new TextEncoder().encode(metadata).length : 0;
  return {
    valid: length <= maxLength,
    length,
    maxLength,
  };
}

/**
 * Validate JSON string
 * @param {string} jsonString - JSON string to validate
 * @returns {{valid: boolean, parsed: object|null, error: string|null}} Validation result
 */
export function validateJSON(jsonString) {
  if (!jsonString || typeof jsonString !== "string") {
    return { valid: false, parsed: null, error: "Invalid JSON: not a string" };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return { valid: true, parsed, error: null };
  } catch (error) {
    return {
      valid: false,
      parsed: null,
      error: error instanceof Error ? error.message : "Invalid JSON format",
    };
  }
}

