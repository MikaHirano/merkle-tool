/**
 * OpenTimestamps Protocol Implementation
 * Uses backend proxy for OpenTimestamps operations due to browser compatibility requirements
 */

// Public OpenTimestamps calendar servers (for upgrade/status checks)
export const CALENDAR_SERVERS = [
  'https://alice.btc.calendar.opentimestamps.org', // Official calendar server Alice
  'https://bob.btc.calendar.opentimestamps.org',   // Official calendar server Bob
  'https://finney.calendar.eternitywall.com',     // Eternity Wall calendar server
  'https://ots.btc.catallaxy.com',                // Catallaxy calendar server
];

// Pool servers (aggregation endpoints - faster for initial stamping)
// These aggregate multiple submissions and are recommended for stamping
export const POOL_SERVERS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://ots.btc.catallaxy.com', // Also supports /digest
];

// Backend API configuration
// Uses VITE_BACKEND_URL environment variable, falls back to localhost for development
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Environment validation
const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

// Validate backend URL format
if (BACKEND_URL && !BACKEND_URL.match(/^https?:\/\/.+/)) {
  console.warn(`[OpenTimestamps] Invalid BACKEND_URL format: ${BACKEND_URL}. Expected http:// or https:// URL.`);
}

// Simple logger that respects environment
const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args) => {
    console.warn(...args); // Always show warnings
  },
  error: (...args) => {
    console.error(...args); // Always show errors
  },
};

// Backend health check cache
let backendHealthCache = { available: true, lastCheck: 0 };
const BACKEND_HEALTH_CACHE_TTL = 10000; // 10 seconds

/**
 * Check backend server availability
 * @returns {Promise<boolean>} True if backend is available, false otherwise
 */
export async function checkBackendHealth() {
  const now = Date.now();
  if (now - backendHealthCache.lastCheck < BACKEND_HEALTH_CACHE_TTL) {
    if (isDevelopment) {
      logger.log(`[OpenTimestamps] Using cached backend health: ${backendHealthCache.available}`);
    }
    return backendHealthCache.available;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const available = response.ok;
    backendHealthCache = { available, lastCheck: now };
    if (isDevelopment) {
      logger.log(`[OpenTimestamps] Backend health check result: ${available} (status: ${response.status})`);
    }
    return available;
  } catch (error) {
    backendHealthCache = { available: false, lastCheck: now };
    if (isDevelopment) {
      logger.warn(`[OpenTimestamps] Backend health check failed:`, error);
    }
    return false;
  }
}

/**
 * Retry wrapper for backend operations with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 * @returns {Promise<any>} Result of the operation
 */
async function retryBackendOperation(operation, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isConnectionError = error.message?.includes('Failed to fetch') || 
                               error.message?.includes('ERR_CONNECTION_REFUSED') ||
                               error.message?.includes('NetworkError') ||
                               error.name === 'TypeError' && error.message?.includes('fetch');
      
      if (!isConnectionError || attempt === maxRetries - 1) {
        throw error; // Not a connection error or last attempt
      }
      
      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} bytes - Bytes to convert
 * @returns {string} Hex string
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 * @param {string} hex - Hex string
 * @returns {Uint8Array} Bytes
 */
function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * SHA-256 hash using Web Crypto API
 * @param {Uint8Array} data - Data to hash
 * @returns {Promise<Uint8Array>} Hash bytes
 */
async function sha256(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

/**
 * Submit hash to a single calendar server
 * @param {string} server - Calendar server URL
 * @param {Uint8Array} hashBytes - Hash bytes to submit
 * @returns {Promise<{otsFile: Uint8Array, server: string}>} OTS file and server
 */
/**
 * Validate OTS proof file bytes
 * OTS proof files must start with magic bytes: 0x00 0x4f 0x50 0x45 0x4e 0x54 0x49 0x4d 0x45 0x53 0x54 0x41 0x4d 0x50 0x53 ("OpenTimestamps")
 * @param {Uint8Array} otsBytes - OTS proof bytes to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
function validateOtsProof(otsBytes) {
  if (!otsBytes || otsBytes.length < 16) {
    const firstBytes = otsBytes ? Array.from(otsBytes.slice(0, Math.min(16, otsBytes.length)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ') : 'null/undefined';
    return {
      valid: false,
      error: `OTS proof too short (${otsBytes?.length || 0} bytes). First bytes: ${firstBytes}`,
    };
  }
  
  const first16Hex = Array.from(otsBytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  logger.log(`[OpenTimestamps] Validating OTS proof. First 16 bytes (hex): ${first16Hex}`);
  
  // Check if starts with 0x00
  if (otsBytes[0] !== 0x00) {
    return {
      valid: false,
      error: `Invalid OTS proof: first byte is 0x${otsBytes[0].toString(16)}, expected 0x00. First 16 bytes: ${first16Hex}`,
    };
  }
  
  // Check magic bytes: "OpenTimestamps" (mixed case, not uppercase)
  const magic = [0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73];
  if (otsBytes.length < 1 + magic.length) {
    return {
      valid: false,
      error: `OTS proof too short for magic bytes (${otsBytes.length} bytes, need at least ${1 + magic.length})`,
    };
  }
  
  for (let i = 0; i < magic.length; i++) {
    if (otsBytes[i + 1] !== magic[i]) {
      const expectedHex = Array.from([0x00, ...magic]).slice(0, 16)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      return {
        valid: false,
        error: `Invalid OTS proof: magic bytes mismatch at position ${i + 1}. Expected: ${expectedHex}, Got: ${first16Hex}`,
      };
    }
  }
  
  logger.log(`[OpenTimestamps] ✓ Valid OTS proof file detected (${otsBytes.length} bytes)`);
  return { valid: true };
}

/**
 * Submit hash digest to calendar server and receive OTS proof file
 * @param {string} server - Calendar server URL
 * @param {Uint8Array} hashBytes - Digest bytes (32 bytes SHA-256) to send to calendar
 * @returns {Promise<{otsFile: Uint8Array, server: string}>} OTS proof file bytes (with magic header) and server
 */
async function submitToServer(server, hashBytes) {
  const response = await fetch(`${server}/digest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: hashBytes, // Send digest bytes (32 bytes SHA-256)
  });

  if (!response.ok) {
    throw new Error(`Calendar server error: ${response.status} ${response.statusText}`);
  }

  // Get content type to determine response format
  const contentType = response.headers.get('content-type') || '';
    logger.log(`[OpenTimestamps] ${server} response content-type: ${contentType}`);
  
  let otsProofBytes;
  
  // Check if response is text (hex-encoded) or binary
  if (contentType.includes('text') || contentType.includes('application/json')) {
    // Response might be hex-encoded text - read as text first
    const text = await response.text();
      logger.log(`[OpenTimestamps] ${server} returned text response (${text.length} chars), first 100 chars: ${text.substring(0, 100)}`);
    
    // Check if it's hex-encoded
    const cleanText = text.trim();
    if (/^[0-9a-fA-F]+$/.test(cleanText) && cleanText.length % 2 === 0) {
      // It's hex - decode it properly (do NOT use TextEncoder)
          logger.log(`[OpenTimestamps] ${server} response is hex-encoded, decoding...`);
      otsProofBytes = hexToBytes(cleanText);
    } else {
      // Try to decode as base64
      try {
        const binaryString = atob(cleanText);
        otsProofBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          otsProofBytes[i] = binaryString.charCodeAt(i);
        }
            logger.log(`[OpenTimestamps] ${server} response decoded as base64`);
      } catch (e) {
        throw new Error(`Calendar server returned text response that is neither hex nor base64: ${text.substring(0, 50)}...`);
      }
    }
  } else {
    // Binary response - read as arrayBuffer
    const otsData = await response.arrayBuffer();
    otsProofBytes = new Uint8Array(otsData);
    logger.log(`[OpenTimestamps] ${server} returned binary response (${otsProofBytes.length} bytes)`);
  }
  
  const first16Hex = Array.from(otsProofBytes.slice(0, Math.min(16, otsProofBytes.length)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  logger.log(`[OpenTimestamps] ${server} OTS proof first 16 bytes (hex): ${first16Hex}`);

  return {
    otsFile: otsProofBytes, // OTS proof bytes (should have magic header)
    server,
  };
}

/**
 * Stamp a Merkle root using OpenTimestamps backend proxy
 * @param {string} merkleRootHex - 64-character hex string (32 bytes)
 * @param {string[]} calendarServers - Optional calendar servers (backend handles selection)
 * @returns {Promise<{otsFile: Uint8Array, server: string}>}
 */
export async function stampHash(merkleRootHex, calendarServers = null) {
  // Normalize merkle root
  const cleanRoot = merkleRootHex.startsWith('0x') ? merkleRootHex.slice(2) : merkleRootHex;
  if (cleanRoot.length !== 64) {
    throw new Error('Merkle root must be 64 hex characters (32 bytes)');
  }

  logger.log(`[OpenTimestamps] Calling backend to stamp ${cleanRoot.slice(0, 16)}...`);

  try {
    const result = await retryBackendOperation(async () => {
      const response = await fetch(`${BACKEND_URL}/api/stamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merkleRootHex: cleanRoot })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Backend stamp failed: ${error.error}`);
      }

      return await response.json();
    });

    // Convert back to Uint8Array
    const otsFile = new Uint8Array(result.otsFile);

    logger.log(`[OpenTimestamps] ✓ Backend stamp successful, OTS file: ${otsFile.length} bytes`);

    return {
      otsFile,
      server: result.server,
    };

  } catch (error) {
    console.error('[OpenTimestamps] Backend stamp failed:', error);
    
    // Detect connection errors
    const isConnectionError = error.message?.includes('Failed to fetch') || 
                             error.message?.includes('ERR_CONNECTION_REFUSED') ||
                             error.message?.includes('NetworkError') ||
                             error.name === 'TypeError' && error.message?.includes('fetch');
    
    if (isConnectionError) {
      const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const errorMessage = isProduction 
        ? `Backend server unavailable. Please contact support if this issue persists. Backend URL: ${backendUrl}`
        : 'Backend server unavailable. Please ensure the backend is running.';
      const connectionError = new Error(errorMessage);
      connectionError.status = 'backend_unavailable';
      throw connectionError;
    }
    
    throw error;
  }
}

/**
 * Check if timestamp has been upgraded by polling GET /timestamp/{commitment}
 * @param {string} commitment - Commitment hash (hex string)
 * @param {string} calendarServer - Calendar server URL
 * @returns {Promise<{upgraded: boolean, otsFile?: Uint8Array, status: 'pending' | 'upgraded' | 'error'}>}
 */
async function checkTimestampUpgrade(commitment, calendarServer) {
  const commitmentUrl = `${calendarServer}/timestamp/${commitment}`;
  logger.log(`[OpenTimestamps] Polling GET ${commitmentUrl}`);
  logger.log(`[OpenTimestamps] Commitment hex: ${commitment}`);
  
  try {
    const response = await fetch(commitmentUrl, {
      method: 'GET',
    });
    
    logger.log(`[OpenTimestamps] ${calendarServer} /timestamp/{commitment} response: ${response.status} ${response.statusText}`);
    
    if (response.status === 404) {
      // 404 = pending (commitment known but not yet anchored)
      logger.log(`[OpenTimestamps] ${calendarServer} - Commitment pending (404) - calendar server knows about commitment but hasn't anchored it yet`);
      return {
        upgraded: false,
        status: 'pending',
      };
    }
    
    if (response.status === 200) {
      // 200 = upgraded (commitment found and anchored)
      // Read response as binary (OTS proof file)
      const contentType = response.headers.get('content-type') || '';
      logger.log(`[OpenTimestamps] ${calendarServer} upgrade response content-type: ${contentType}`);
      
      let upgradedOtsProofBytes;
      
      // Check if response is text (hex-encoded) or binary
      if (contentType.includes('text') || contentType.includes('application/json')) {
        // Response might be hex-encoded text - read as text first
        const text = await response.text();
        logger.log(`[OpenTimestamps] ${calendarServer} upgrade returned text response (${text.length} chars), first 100 chars: ${text.substring(0, 100)}`);
        
        // Check if it's hex-encoded
        const cleanText = text.trim();
        if (/^[0-9a-fA-F]+$/.test(cleanText) && cleanText.length % 2 === 0) {
          // It's hex - decode it properly (do NOT use TextEncoder)
          logger.log(`[OpenTimestamps] ${calendarServer} upgrade response is hex-encoded, decoding...`);
          upgradedOtsProofBytes = hexToBytes(cleanText);
        } else {
          // Try to decode as base64
          try {
            const binaryString = atob(cleanText);
            upgradedOtsProofBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              upgradedOtsProofBytes[i] = binaryString.charCodeAt(i);
            }
            logger.log(`[OpenTimestamps] ${calendarServer} upgrade response decoded as base64`);
          } catch (e) {
            throw new Error(`Calendar server returned text response that is neither hex nor base64: ${text.substring(0, 50)}...`);
          }
        }
      } else {
        // Binary response - read as arrayBuffer
        const upgradedOtsData = await response.arrayBuffer();
        upgradedOtsProofBytes = new Uint8Array(upgradedOtsData);
        logger.log(`[OpenTimestamps] ${calendarServer} upgrade returned binary response (${upgradedOtsProofBytes.length} bytes)`);
      }
      
      const first16Hex = Array.from(upgradedOtsProofBytes.slice(0, Math.min(16, upgradedOtsProofBytes.length)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      logger.log(`[OpenTimestamps] ${calendarServer} upgraded OTS proof first 16 bytes (hex): ${first16Hex}`);
      
      // Validate upgraded OTS proof
      const validation = validateOtsProof(upgradedOtsProofBytes);
      if (!validation.valid) {
        console.error(`[OpenTimestamps] ✗ Invalid upgraded OTS proof from ${calendarServer}: ${validation.error}`);
        return {
          upgraded: false,
          status: 'error',
        };
      }
      
      logger.log(`[OpenTimestamps] ✓ ${calendarServer} - Commitment upgraded! Received valid OTS proof (${upgradedOtsProofBytes.length} bytes)`);
      
      // Check if upgraded file has Bitcoin attestation
      const bitcoinCheck = await hasBitcoinAttestation(upgradedOtsProofBytes);
      logger.log(`[OpenTimestamps] Upgraded file Bitcoin attestation check: hasAttestation=${bitcoinCheck.hasAttestation}, blockHeight=${bitcoinCheck.blockHeight || 'N/A'}`);
      
      return {
        upgraded: true,
        otsFile: upgradedOtsProofBytes, // Validated OTS proof bytes
        status: 'upgraded',
      };
    }
    
    // Other status codes
    console.warn(`[OpenTimestamps] ${calendarServer} - Unexpected status ${response.status} ${response.statusText}`);
    return {
      upgraded: false,
      status: 'error',
    };
  } catch (error) {
    console.warn(`[OpenTimestamps] Failed to check upgrade on ${calendarServer}:`, error.message);
    console.warn(`[OpenTimestamps] Error details:`, error);
    return {
      upgraded: false,
      status: 'error',
    };
  }
}

/**
 * Merge two OTS files, combining attestations
 * This is a simplified merge - full implementation would use OpenTimestamps library
 * @param {Uint8Array} originalOts - Original OTS file
 * @param {Uint8Array} upgradedOts - Upgraded OTS file from calendar server
 * @returns {Uint8Array} Merged OTS file
 */
function mergeOtsFiles(originalOts, upgradedOts) {
  // For now, return the upgraded OTS file as it should contain all attestations
  // Full merge would require proper OTS library to combine attestations correctly
  logger.log(`[OpenTimestamps] Merging OTS files: original=${originalOts.length} bytes, upgraded=${upgradedOts.length} bytes`);
  logger.log(`[OpenTimestamps] Using upgraded OTS file (should contain all attestations)`);
  return upgradedOts;
}

/**
 * Check if OTS file contains Bitcoin block attestation
 * @param {Uint8Array} otsFile - OTS file bytes
 * @returns {Promise<{hasAttestation: boolean, txid?: string, blockHeight?: number}>}
 */
async function hasBitcoinAttestation(otsFile) {
  try {
    // Parse OTS file to look for Bitcoin block attestation (type 0x05)
    let pos = 0;
    
    // Skip magic bytes and version
    const magicLength = 15;
    if (otsFile.length < magicLength + 1) {
      return { hasAttestation: false };
    }
    pos = magicLength + 1; // Skip magic + version
    
    // Parse attestations
    while (pos < otsFile.length) {
      if (pos + 1 > otsFile.length) break;
      
      const attestationType = otsFile[pos++];
      
      if (attestationType === 0x05) {
        // Bitcoin block attestation found
        // Format: 0x05 + block height (varint) + merkle root (32 bytes)
        logger.log(`[OpenTimestamps] Found Bitcoin block attestation at position ${pos - 1}`);
        
        // Extract block height (varint encoding)
        let blockHeight = 0;
        let shift = 0;
        while (pos < otsFile.length) {
          const byte = otsFile[pos++];
          blockHeight |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        
        // Merkle root (32 bytes) - this is the commitment that was included in Bitcoin block
        if (pos + 32 <= otsFile.length) {
          const merkleRootBytes = otsFile.slice(pos, pos + 32);
          const merkleRootHex = bytesToHex(merkleRootBytes);
          logger.log(`[OpenTimestamps] Bitcoin attestation - Block height: ${blockHeight}, Merkle root: ${merkleRootHex.slice(0, 16)}...`);
          
          return {
            hasAttestation: true,
            blockHeight: blockHeight,
            // Note: txid would need to be extracted from the Bitcoin transaction that includes this merkle root
            // This requires querying the blockchain or having it in the OTS file structure
          };
        }
      } else if (attestationType === 0x00) {
        // Calendar attestation - skip URL and commitment
        if (pos + 1 > otsFile.length) break;
        const urlLength = otsFile[pos++];
        if (pos + urlLength + 32 > otsFile.length) break;
        pos += urlLength + 32; // Skip URL + commitment
      } else {
        // Unknown type, try to continue or break
        break;
      }
    }
    
    return { hasAttestation: false };
  } catch (error) {
    console.error(`[OpenTimestamps] Error checking Bitcoin attestation:`, error);
    return { hasAttestation: false };
  }
}

/**
 * Upgrade a timestamp by checking calendar server for Bitcoin block attestation
 * Uses backend proxy to avoid CORS issues
 * @param {Uint8Array} otsFile - Current OTS file
 * @param {string[]} calendarServers - Optional calendar servers (backend handles selection)
 * @returns {Promise<{otsFile: Uint8Array, upgraded: boolean, blockInfo?: {height: number, hash: string, timestamp: number}, status?: string, txHash?: string, server?: string}>}
 */
export async function upgradeTimestamp(otsFile, calendarServers = null) {
  logger.log(`[OpenTimestamps] Calling backend to upgrade OTS file (${otsFile.length} bytes)`);
  
  try {
    const result = await retryBackendOperation(async () => {
      const response = await fetch(`${BACKEND_URL}/api/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          otsFile: Array.from(otsFile) // Convert Uint8Array to regular array for JSON
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Backend upgrade failed: ${error.error}`);
      }

      return await response.json();
    });

    // Convert back to Uint8Array
    const upgradedOtsFile = new Uint8Array(result.otsFile);

    logger.log(`[OpenTimestamps] ✓ Backend upgrade successful, upgraded: ${result.upgraded}, status: ${result.status}`);

    // If upgraded and has block height, extract block info
    let blockInfo = null;
    if (result.upgraded && result.blockHeight) {
      blockInfo = await extractBlockInfo(upgradedOtsFile);
    }

    return {
      otsFile: upgradedOtsFile,
      upgraded: result.upgraded || false,
      blockHeight: result.blockHeight,
      blockInfo,
      status: result.status || (result.upgraded ? 'anchored' : 'pending'),
    };

  } catch (error) {
    console.error(`[OpenTimestamps] Backend upgrade error:`, error);
    
    // Detect connection errors
    const isConnectionError = error.message?.includes('Failed to fetch') || 
                             error.message?.includes('ERR_CONNECTION_REFUSED') ||
                             error.message?.includes('NetworkError') ||
                             error.name === 'TypeError' && error.message?.includes('fetch');
    
    if (isConnectionError) {
      const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const errorMessage = isProduction 
        ? `Backend server unavailable. Please contact support if this issue persists. Backend URL: ${backendUrl}`
        : 'Backend server unavailable. Please ensure the backend is running.';
      return {
        otsFile,
        upgraded: false,
        status: 'backend_unavailable',
        error: errorMessage,
      };
    }
    
    return {
      otsFile,
      upgraded: false,
      status: 'error',
      error: error.message,
    };
  }
}


/**
 * Get timestamp status from calendar server
 * Uses correct protocol: parse OTS, extract commitments, poll GET /timestamp/{commitment}
 * @param {Uint8Array} otsFile - Current OTS file
 * @param {string[]} calendarServers - Array of calendar server URLs
 * @returns {Promise<{status: string, server?: string, upgraded: boolean, txHash?: string, error?: string, otsFile?: Uint8Array, blockInfo?: any}>}
 */
/**
 * Extract Bitcoin block information from upgraded OTS file
 * Parses OTS file to extract Bitcoin block attestation details
 * @param {Uint8Array} otsFile - Upgraded OTS file
 * @returns {Promise<{height: number, hash: string, timestamp: number, txid?: string} | null>}
 */
async function extractBlockInfo(otsFile) {
  try {
    const bitcoinCheck = await hasBitcoinAttestation(otsFile);
    
    if (bitcoinCheck.hasAttestation && bitcoinCheck.blockHeight) {
      logger.log(`[OpenTimestamps] Extracted block info: height=${bitcoinCheck.blockHeight}`);
      return {
        height: bitcoinCheck.blockHeight,
        hash: '', // Would need to query blockchain or extract from OTS file
        timestamp: Date.now(), // Would need to query blockchain for actual timestamp
        txid: bitcoinCheck.txid,
      };
    }
    
    return null;
  } catch (error) {
    console.warn('[OpenTimestamps] Could not extract block info:', error);
    return null;
  }
}

// Tip height cache with TTL
let tipHeightCache = null;
let tipHeightCacheTime = null;
const TIP_HEIGHT_CACHE_TTL = 45 * 1000; // 45 seconds TTL (between 30-60s)

/**
 * Check Bitcoin confirmations using block height
 * Formula: confirmations = tipHeight - blockHeight + 1
 * Uses multiple sources with Promise.any and timeouts for reliability
 * Includes tip-height caching to avoid hammering public APIs
 * @param {number} blockHeight - Bitcoin block height
 * @returns {Promise<{confirmations: number, tipHeight: number, available: boolean}>}
 */
export async function checkConfirmationsByHeight(blockHeight) {
  const TIMEOUT_MS = 5000; // 5 second timeout per source

  // Check cache first
  const now = Date.now();
  if (tipHeightCache !== null && tipHeightCacheTime !== null) {
    const cacheAge = now - tipHeightCacheTime;
    if (cacheAge < TIP_HEIGHT_CACHE_TTL) {
      // Use cached tip height
      const confirmations = Math.max(0, tipHeightCache - blockHeight + 1);
      logger.log(`[OpenTimestamps] Using cached tip height: ${tipHeightCache} (age: ${Math.round(cacheAge / 1000)}s)`);
      return {
        confirmations,
        tipHeight: tipHeightCache,
        available: true,
      };
    }
  }

  // Multiple tip height sources
  const tipHeightSources = [
    async () => {
      const response = await fetch('https://mempool.space/api/blocks/tip/height');
      if (!response.ok) throw new Error(`mempool.space: ${response.status}`);
      const text = await response.text();
      const tipHeight = parseInt(text.trim(), 10);
      if (isNaN(tipHeight)) throw new Error('Invalid tip height');
      return { source: 'mempool.space', tipHeight };
    },
    async () => {
      const response = await fetch('https://blockstream.info/api/blocks/tip/height');
      if (!response.ok) throw new Error(`blockstream.info: ${response.status}`);
      const text = await response.text();
      const tipHeight = parseInt(text.trim(), 10);
      if (isNaN(tipHeight)) throw new Error('Invalid tip height');
      return { source: 'blockstream.info', tipHeight };
    },
    async () => {
      // Fallback: Get tip height from block hash endpoint
      const response = await fetch('https://mempool.space/api/blocks/tip/hash');
      if (!response.ok) throw new Error(`mempool.space hash: ${response.status}`);
      const blockHash = await response.text().then(t => t.trim());
      const blockResponse = await fetch(`https://mempool.space/api/block/${blockHash}`);
      if (!blockResponse.ok) throw new Error(`mempool.space block: ${blockResponse.status}`);
      const blockData = await blockResponse.json();
      return { source: 'mempool.space (via block)', tipHeight: blockData.height };
    },
  ];

  // Add timeout wrapper
  const withTimeout = (promise, timeoutMs) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);
  };

  try {
    // Try all sources in parallel, use first successful result
    const results = await Promise.any(
      tipHeightSources.map(source => withTimeout(source(), TIMEOUT_MS))
    );

    const tipHeight = results.tipHeight;
    const confirmations = Math.max(0, tipHeight - blockHeight + 1);

    // Cache tip height for future requests
    tipHeightCache = tipHeight;
    tipHeightCacheTime = Date.now();

    logger.log(`[OpenTimestamps] Confirmations check successful via ${results.source}: ${confirmations} confirmations`);

    return {
      confirmations,
      tipHeight,
      available: true,
    };
  } catch (error) {
    console.warn(`[OpenTimestamps] All confirmation sources failed:`, error);
    // Graceful fallback: keep status as 'anchored', show "confirmations unavailable"
    return {
      confirmations: null, // null indicates unavailable
      tipHeight: null,
      available: false,
    };
  }
}

/**
 * Download OTS file as blob
 * @param {Uint8Array} otsFile - OTS file bytes
 * @param {string} filename - Filename for download
 */
export function downloadOtsFile(otsFile, filename = 'timestamp.ots') {
  const blob = new Blob([otsFile], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create a JSON proof file that includes OTS file as base64
 * This provides a consistent format with Ethereum proofs
 * @param {Uint8Array} otsFile - OTS file bytes
 * @param {string} merkleRoot - Merkle root hex string
 * @param {Object} metadata - Additional metadata
 * @returns {Object} JSON proof object
 */
/**
 * Get timestamp status - call backend upgrade and check confirmations
 * @param {Uint8Array} otsFile - OTS proof file bytes
 * @param {string[]} calendarServers - Optional calendar servers (backend handles selection)
 * @returns {Promise<{status: string, upgraded: boolean, otsFile: Uint8Array, blockInfo?: object}>}
 */
export async function getTimestampStatus(otsFile, calendarServers = null) {
  logger.log(`[OpenTimestamps] Getting timestamp status...`);

  // Call backend to upgrade/check status
  const upgradeResult = await upgradeTimestamp(otsFile, calendarServers);

  if (upgradeResult.upgraded && upgradeResult.blockHeight) {
    // Has Bitcoin attestation - check confirmations
    logger.log(`[OpenTimestamps] ✓ Has Bitcoin attestation at block ${upgradeResult.blockHeight}`);

    const confirmations = await checkConfirmationsByHeight(upgradeResult.blockHeight);

    // Handle unavailable confirmations gracefully
    const status = confirmations.available && confirmations.confirmations >= 3
      ? 'confirmed'
      : 'anchored';

    return {
      status,
      upgraded: true,
      otsFile: upgradeResult.otsFile,
      blockInfo: {
        height: upgradeResult.blockHeight,
        confirmations: confirmations.confirmations, // null if unavailable
        confirmationsAvailable: confirmations.available,
      },
    };
  }

  // Not upgraded or no Bitcoin attestation yet
  logger.log(`[OpenTimestamps] Status: ${upgradeResult.status}`);
  return {
    status: upgradeResult.status,
    upgraded: upgradeResult.upgraded,
    otsFile: upgradeResult.otsFile,
  };
}

