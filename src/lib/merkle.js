/**
 * Normalize relative path (convert backslashes, remove leading ./ and duplicate slashes)
 * @param {string} p - Path to normalize
 * @returns {string} Normalized path
 */
export function normalizeRelPath(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

/**
 * Check if a path is hidden (contains segments starting with ".")
 * @param {string} relPath - Relative path to check
 * @returns {boolean} True if path is hidden
 */
export function isHiddenPath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((seg) => seg.startsWith("."));
}

/**
 * Recursively list all files from a directory handle
 * @param {FileSystemDirectoryHandle} dirHandle - Directory handle
 * @returns {Promise<Array<{file: File, relPath: string}>>} Array of file objects with relative paths
 */
export async function listFilesFromDirectoryHandle(dirHandle) {
  const out = [];

  async function walk(handle, prefix) {
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "file") {
        const file = await entry.getFile();
        out.push({
          file,
          relPath: normalizeRelPath(rel),
        });
      } else if (entry.kind === "directory") {
        await walk(entry, rel);
      }
    }
  }

  await walk(dirHandle, "");
  return out;
}

/**
 * Compute SHA-256 hash of input bytes
 * @param {ArrayBuffer|Uint8Array|TypedArray} input - Input data
 * @returns {Promise<Uint8Array>} SHA-256 hash as bytes
 */
export async function sha256Bytes(input) {
  const data = input instanceof ArrayBuffer
    ? input
    : input?.buffer?.slice(input.byteOffset, input.byteOffset + input.byteLength);

  if (!data) throw new Error("Invalid input");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/**
 * Compute SHA-256 hash of a file using incremental streaming (for large files)
 * Processes file in chunks without accumulating entire file in memory
 * @param {File} file - File object to hash
 * @param {Function} [onProgress] - Optional progress callback: (bytesProcessed, totalBytes) => void
 * @returns {Promise<Uint8Array>} SHA-256 hash as bytes
 */
export async function sha256Stream(file, onProgress) {
  // Use hash-wasm for incremental hashing to avoid memory issues
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256();
  
  const stream = file.stream();
  const reader = stream.getReader();
  const totalBytes = file.size;
  let bytesProcessed = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Ensure final progress update shows 100% - always call even if bytesProcessed equals totalBytes
        // This handles edge cases where the last chunk might not trigger a callback
        if (onProgress) {
          onProgress(totalBytes, totalBytes);
        }
        break;
      }
      
      // Update hash incrementally with each chunk
      // This doesn't accumulate the entire file in memory
      hasher.update(value);
      
      // Update progress - accumulate bytes BEFORE calling callback
      bytesProcessed += value.length;
      if (onProgress) {
        // Call progress callback for every chunk to ensure frequent updates
        onProgress(bytesProcessed, totalBytes);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Get final digest as binary (Uint8Array)
  const digest = hasher.digest('binary');
  // hash-wasm returns Uint8Array for 'binary' format
  return digest instanceof Uint8Array ? digest : new Uint8Array(digest);
}

/**
 * Concatenate multiple byte arrays into one
 * @param {...Uint8Array} parts - Byte arrays to concatenate
 * @returns {Uint8Array} Concatenated bytes
 */
export function concatBytes(...parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Convert bytes to hexadecimal string
 * @param {Uint8Array} bytes - Bytes to convert
 * @returns {string} Hexadecimal string (lowercase, no 0x prefix)
 */
export function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Convert hexadecimal string to bytes
 * @param {string} hex - Hexadecimal string (with or without 0x prefix)
 * @returns {Uint8Array} Bytes
 * @throws {Error} If hex string is invalid
 */
export function hexToBytes(hex) {
  const clean = String(hex || "").startsWith("0x") ? String(hex).slice(2) : String(hex || "");
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error("Invalid hex characters");

  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Format bytes as human-readable string (B, KB, MB, GB, TB)
 * @param {number} n - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
export function humanBytes(n) {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Compute SHA-256 hash of file content
 * @param {File} file - File object
 * @returns {Promise<string>} Hexadecimal hash (lowercase, no 0x prefix)
 */
/**
 * Compute SHA-256 hash of file content
 * Uses streaming for large files to avoid memory issues
 * @param {File} file - File object
 * @returns {Promise<string>} Hexadecimal hash (lowercase, no 0x prefix)
 */
export async function computeFileContentHashHex(file) {
  // Use streaming for large files (>100MB)
  const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
  const digest = file.size > LARGE_FILE_THRESHOLD
    ? await sha256Stream(file)
    : await sha256Bytes(await file.arrayBuffer());
  return toHex(digest);
}

/**
 * Compute leaf hash: SHA256("leaf\0" + contentHashBytes)
 * @param {Uint8Array} contentHashBytes - Content hash bytes
 * @returns {Promise<Uint8Array>} Leaf hash bytes
 */
export async function computeLeafHashBytes(contentHashBytes) {
  const enc = new TextEncoder();
  return sha256Bytes(concatBytes(enc.encode("leaf\0"), contentHashBytes));
}

/**
 * Build Merkle tree from leaf hashes
 * Uses SHA256("node\0" + left + right) for internal nodes
 * @param {Array<Uint8Array>} leafHashesBytes - Array of leaf hash bytes
 * @returns {Promise<{root: Uint8Array, levels: Array<Array<Uint8Array>>}>} Root hash and all tree levels
 * @throws {Error} If no leaves provided
 */
export async function buildMerkleTreeFromLeafHashes(leafHashesBytes) {
  if (!Array.isArray(leafHashesBytes) || leafHashesBytes.length === 0) {
    throw new Error("Cannot build Merkle tree with 0 leaves.");
  }

  const levels = [leafHashesBytes.map(h => h instanceof Uint8Array ? h : new Uint8Array(h))];
  const nodePrefix = new TextEncoder().encode("node\0");

  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];

    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] || prev[i];
      const node = await sha256Bytes(concatBytes(nodePrefix, left, right));
      next.push(node);
    }

    levels.push(next);
  }

  return { root: levels[levels.length - 1][0], levels };
}

/**
 * Build Merkle proof from tree levels for a given leaf index
 * @param {Array<Array<Uint8Array>>} levelsBytes - Tree levels (array of arrays of hash bytes)
 * @param {number} leafIndex - Index of the leaf in the first level
 * @returns {Array<{position: "left"|"right", hash: string}>} Proof steps (sibling hashes)
 */
export function buildProofFromLevels(levelsBytes, leafIndex) {
  const proof = [];
  let idx = leafIndex;

  for (let level = 0; level < levelsBytes.length - 1; level++) {
    const nodes = levelsBytes[level];
    const isRightNode = idx % 2 === 1;
    const siblingIndex = isRightNode ? idx - 1 : idx + 1;
    const sibling = nodes[siblingIndex] || nodes[idx];

    proof.push({
      position: isRightNode ? "left" : "right",
      hash: toHex(sibling),
    });

    idx = Math.floor(idx / 2);
  }

  return proof;
}

/**
 * Compute Merkle root from leaf hash and proof steps
 * @param {Uint8Array} leafHashBytes - Leaf hash bytes
 * @param {Array<{position: "left"|"right", hash: string}>} proofSteps - Proof steps
 * @returns {Promise<Uint8Array>} Computed root hash bytes
 * @throws {Error} If proof step position is invalid
 */
export async function computeRootFromProof(leafHashBytes, proofSteps) {
  const nodePrefix = new TextEncoder().encode("node\0");
  let running = leafHashBytes;

  for (const step of proofSteps) {
    const sib = hexToBytes(step.hash);

    if (step.position === "right") {
      running = await sha256Bytes(concatBytes(nodePrefix, running, sib));
    } else if (step.position === "left") {
      running = await sha256Bytes(concatBytes(nodePrefix, sib, running));
    } else {
      throw new Error("Invalid proof step position");
    }
  }

  return running;
}

/**
 * Check if a hex string is a valid 256-bit (32-byte) hash
 * @param {string} hex - Hexadecimal string (with or without 0x prefix)
 * @returns {boolean} True if valid 256-bit hash
 */
export function isHex256(hex) {
  if (typeof hex !== "string") return false;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}
