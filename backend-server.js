// Backend proxy server for OpenTimestamps operations
// This server handles OpenTimestamps library calls that require Node.js

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenTimestamps from 'opentimestamps';

const app = express();
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 3001;

// Environment variable validation
const portNum = parseInt(PORT, 10);
if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
  console.error(`[Backend] Invalid PORT: ${PORT}. Must be a number between 1 and 65535.`);
  process.exit(1);
}

// CORS configuration - restrict in production
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // In development, allow all origins
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [];
    
    if (allowedOrigins.length === 0) {
      console.warn('[Backend] WARNING: CORS_ORIGIN not set in production. Allowing all origins.');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Limit request size to 1MB

// Rate limiting - different limits for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const stampLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit stamp requests to 20 per 15 minutes
  message: 'Too many stamp requests, please try again later.',
});

const upgradeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit upgrade requests to 30 per minute
  message: 'Too many upgrade requests, please try again later.',
});


// Apply general rate limiting to all routes
app.use('/api/', generalLimiter);

// Request timeout middleware (30 seconds)
const timeout = (ms) => {
  return (req, res, next) => {
    req.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout' });
      }
    });
    next();
  };
};

// Error sanitization function
function sanitizeError(error, isProduction) {
  if (isProduction) {
    // In production, don't expose internal error details
    if (error instanceof Error) {
      // Return generic message for 500 errors
      return 'An internal server error occurred. Please try again later.';
    }
    return String(error);
  }
  // In development, return full error message
  return error instanceof Error ? error.message : String(error);
}

// Utility functions
function hexToBytes(hex) {
  return OpenTimestamps.Utils.hexToBytes(hex);
}

function bytesToHex(bytes) {
  return OpenTimestamps.Utils.bytesToHex(bytes);
}

function arraysEqual(a, b) {
  return OpenTimestamps.Utils.arrEq(a, b);
}

// Input validation functions
function validateHexString(hex, expectedLength = null) {
  if (typeof hex !== 'string') {
    throw new Error('Invalid input: must be a string');
  }
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error('Invalid hex string: contains non-hexadecimal characters');
  }
  if (expectedLength && cleanHex.length !== expectedLength) {
    throw new Error(`Invalid hex string length: expected ${expectedLength} characters, got ${cleanHex.length}`);
  }
  return cleanHex;
}

function validateOtsFileSize(otsFileArray) {
  if (!Array.isArray(otsFileArray)) {
    throw new Error('Invalid input: otsFile must be an array');
  }
  const maxSize = 1024 * 1024; // 1MB
  if (otsFileArray.length > maxSize) {
    throw new Error(`OTS file too large: ${otsFileArray.length} bytes (max ${maxSize} bytes)`);
  }
  // Validate array contains only numbers
  for (let i = 0; i < Math.min(100, otsFileArray.length); i++) {
    const val = otsFileArray[i];
    if (typeof val !== 'number' || val < 0 || val > 255 || !Number.isInteger(val)) {
      throw new Error(`Invalid byte value at index ${i}: must be integer between 0-255`);
    }
  }
}

// Validation function
function validateOtsProof(otsBytes, strict = true) {
  if (!otsBytes || otsBytes.length < 16) {
    const error = `Invalid OTS proof: too short (${otsBytes?.length || 0} bytes)`;
    if (strict) throw new Error(error);
    if (NODE_ENV === 'development') {
      console.warn(`[OpenTimestamps] ${error}`);
    }
    return;
  }

  // Check magic bytes: 0x00 + "OpenTimestamps" (mixed case, not uppercase)
  // Full header: \x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94
  // We check the first 15 bytes: 0x00 + "OpenTimestamps"
  const magic = [0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73];

  if (otsBytes[0] !== 0x00) {
    const error = `Invalid OTS proof: first byte is 0x${otsBytes[0].toString(16)}, expected 0x00`;
    if (strict) throw new Error(error);
    if (NODE_ENV === 'development') {
      console.warn(`[OpenTimestamps] ${error} (library deserialize succeeded, treating as warning)`);
    }
    return;
  }

  // Check magic bytes (first 15 bytes: 0x00 + "OpenTimestamps")
  for (let i = 0; i < magic.length; i++) {
    if (otsBytes[i] !== magic[i]) {
      const error = `Invalid OTS proof: magic bytes mismatch at position ${i}`;
      if (strict) throw new Error(error);
      if (NODE_ENV === 'development') {
        console.warn(`[OpenTimestamps] ${error} (library deserialize succeeded, treating as warning)`);
      }
      return;
    }
  }

  if (NODE_ENV === 'development') {
    console.log(`[OpenTimestamps] ✓ OTS proof validation passed (${otsBytes.length} bytes)`);
  }
}

// Bitcoin attestation checker
function hasBitcoinAttestation(detached) {
  const timestamp = detached.timestamp;
  const allAttestations = timestamp.allAttestations();

  const BitcoinAttestationClass = OpenTimestamps.Notary.BitcoinBlockHeaderAttestation;

  for (const [msg, attestation] of allAttestations) {
    // instanceof check
    if (BitcoinAttestationClass && attestation instanceof BitcoinAttestationClass) {
      return {
        hasAttestation: true,
        blockHeight: attestation.height,
      };
    }

    // Strong fallback: multiple indicators (blockHash OR header) AND height
    const hasBlockHash = attestation.blockHash &&
      (attestation.blockHash.length === 32 ||
       (typeof attestation.blockHash === 'string' && /^[0-9a-fA-F]{64}$/.test(attestation.blockHash)));

    const hasHeader = attestation.header && attestation.header.length === 80;

    const hasIntegerHeight = attestation.height !== undefined &&
      typeof attestation.height === 'number' &&
      Number.isInteger(attestation.height) &&
      attestation.height > 0;

    // Require multiple strong indicators
    const hasStrongBitcoinIndicators = hasIntegerHeight && (hasBlockHash || hasHeader);

    // Check stable type tag
    const hasStableTypeTag = attestation.type === 'BitcoinBlockHeaderAttestation';

    if (hasStableTypeTag || hasStrongBitcoinIndicators) {
      return {
        hasAttestation: true,
        blockHeight: attestation.height,
      };
    }
  }

  return { hasAttestation: false };
}

// API Endpoints

// POST /api/stamp
app.post('/api/stamp', stampLimiter, timeout(30000), async (req, res) => {
  try {
    const { merkleRootHex } = req.body;

    if (!merkleRootHex) {
      return res.status(400).json({ error: 'merkleRootHex is required' });
    }

    // Validate and normalize merkle root
    let cleanRoot;
    try {
      cleanRoot = validateHexString(merkleRootHex, 64);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Convert to digest bytes (32 bytes SHA-256)
    const digestBytes = hexToBytes(cleanRoot);

    // Use documented digest constructor - no double-hashing
    const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
      new OpenTimestamps.Ops.OpSHA256(),
      digestBytes
    );

    // Use pool servers for faster aggregation (these aggregate multiple submissions)
    // Pool servers are recommended for stamping as they batch submissions efficiently
    const poolServers = [
      'https://a.pool.opentimestamps.org',
      'https://b.pool.opentimestamps.org',
      'https://a.pool.eternitywall.com',
      'https://ots.btc.catallaxy.com',
    ];

    // Stamp with pool servers (m=2 means at least 2 servers must reply)
    await OpenTimestamps.stamp(detached, {
      calendars: poolServers,
      m: 2 // Require at least 2 pool servers to respond for redundancy
    });

    // Serialize to bytes
    const otsBytes = detached.serializeToBytes();
    const otsFile = new Uint8Array(otsBytes);

    // Validate OTS proof format (strict in backend)
    validateOtsProof(otsFile, true);

    if (NODE_ENV === 'development') {
      console.log(`[Backend] Successfully stamped ${cleanRoot.slice(0, 16)}...`);
    }

    res.json({
      otsFile: Array.from(otsFile), // Convert to regular array for JSON
      server: 'calendar-managed',
    });

  } catch (error) {
    console.error('[Backend] Stamp error:', error);
    const sanitizedError = sanitizeError(error, NODE_ENV === 'production');
    res.status(500).json({ error: sanitizedError });
  }
});

// POST /api/upgrade
app.post('/api/upgrade', upgradeLimiter, timeout(30000), async (req, res) => {
  try {
    const { otsFile: otsFileArray } = req.body;

    if (!otsFileArray) {
      return res.status(400).json({ error: 'otsFile array is required' });
    }

    // Validate OTS file size and format
    try {
      validateOtsFileSize(otsFileArray);
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Convert back to Uint8Array
    const otsFile = new Uint8Array(otsFileArray);

    // Deserialize OTS proof
    const detached = OpenTimestamps.DetachedTimestampFile.deserialize(otsFile);

    // Store original bytes for comparison
    const originalBytes = otsFile;

    // Use calendar servers for upgrade checks (these are different from pool servers)
    // Calendar servers handle /timestamp/{commitment} endpoints for upgrades
    const calendarServers = [
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
      'https://finney.calendar.eternitywall.com',
      'https://ots.btc.catallaxy.com',
    ];

    // Upgrade with calendar servers (checks for Bitcoin attestations)
    await OpenTimestamps.upgrade(detached, {
      calendars: calendarServers
    });

    // Serialize upgraded proof
    const upgradedBytes = detached.serializeToBytes();
    const upgradedOtsFile = new Uint8Array(upgradedBytes);

    // Validate only if bytes changed
    if (!arraysEqual(originalBytes, upgradedOtsFile)) {
      validateOtsProof(upgradedOtsFile, true);
    }

    // Check for Bitcoin attestation
    const bitcoinCheck = hasBitcoinAttestation(detached);

    if (NODE_ENV === 'development') {
      console.log(`[Backend] Upgrade completed, Bitcoin attestation: ${bitcoinCheck.hasAttestation}`);
    }

    res.json({
      otsFile: Array.from(upgradedOtsFile),
      upgraded: bitcoinCheck.hasAttestation,
      status: bitcoinCheck.hasAttestation ? 'anchored' : 'pending',
      blockHeight: bitcoinCheck.blockHeight,
    });

  } catch (error) {
    console.error('[Backend] Upgrade error:', error);
    const sanitizedError = sanitizeError(error, NODE_ENV === 'production');
    res.status(500).json({ error: sanitizedError });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('[Backend] Request error:', err);
  const sanitizedError = sanitizeError(err, NODE_ENV === 'production');
  res.status(err.status || 500).json({ error: sanitizedError });
});

// Start server
app.listen(portNum, () => {
  console.log(`OpenTimestamps backend proxy running on http://localhost:${portNum}`);
  console.log(`Environment: ${NODE_ENV}`);
  if (NODE_ENV === 'production') {
    console.log(`CORS origins: ${process.env.CORS_ORIGIN || 'WARNING: Not configured'}`);
  }
  console.log('Available endpoints:');
  console.log('  POST /api/stamp - Stamp a Merkle root');
  console.log('  POST /api/upgrade - Upgrade an OTS file');
  console.log('  POST /api/parse-ots - Parse an OTS file and extract attestations');
  console.log('  GET /api/health - Health check');
});

// Process-level error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[Backend] Uncaught Exception:', error);
  // Don't exit - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Backend] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});
