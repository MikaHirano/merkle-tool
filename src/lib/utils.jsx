// Shared utility functions

export function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/");
}

export function baseName(p) {
  const s = normalizePath(p);
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}

export function isHiddenPath(path) {
  return normalizePath(path)
    .split("/")
    .some((seg) => seg.startsWith("."));
}

export function shouldIgnoreRelPath(relPath, policy) {
  const p = normalizePath(relPath);
  const name = baseName(p);

  if (!policy.includeHidden && (name.startsWith(".") || isHiddenPath(p))) return true;

  if (policy.ignoreJunk) {
    if ((policy.ignoreNames || []).includes(name)) return true;
    if ((policy.ignorePrefixes || []).some((pref) => name.startsWith(pref))) return true;
    if ((policy.ignorePathPrefixes || []).some((pref) => p.startsWith(pref))) return true;
  }

  return false;
}

export function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        width: "100%",
        height: 10,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden"
      }}>
        <div style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 999,
          background: "rgba(255,255,255,0.85)"
        }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        {done}/{total} files ({pct}%)
      </div>
    </div>
  );
}

/**
 * Read file with error handling, using streaming for large files
 * For files larger than 100MB, uses streaming to avoid memory issues
 * Note: This function still accumulates chunks for compatibility with existing code
 * For hashing large files, use sha256Stream from merkle.js instead
 * @param {File} file - File object to read
 * @returns {Promise<ArrayBuffer>} File contents as ArrayBuffer
 */
export async function readFileWithErrorHandling(file) {
  try {
    // Use streaming for large files (>100MB) to avoid memory issues
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
    
    if (file.size > LARGE_FILE_THRESHOLD) {
      // Use streaming approach for large files
      const stream = file.stream();
      const reader = stream.getReader();
      const chunks = [];
      let totalLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          totalLength += value.length;
        }
      } finally {
        reader.releaseLock();
      }

      // Combine chunks into single ArrayBuffer
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      return combined.buffer;
    } else {
      // Use arrayBuffer for smaller files (more efficient)
    return await file.arrayBuffer();
    }
  } catch (readError) {
    const errorMsg = readError?.name === 'NotAllowedError'
      ? `Permission denied reading "${file.name}". Please grant file access permission.`
      : readError?.name === 'NotFoundError'
      ? `File "${file.name}" not found or was moved/deleted.`
      : readError?.message?.includes('Array buffer allocation failed')
      ? `File "${file.name}" is too large to load into memory (${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB). Please use a file smaller than 2GB or ensure sufficient system memory.`
      : `Failed to read "${file.name}": ${readError?.message || 'Unknown error'}`;
    throw new Error(errorMsg);
  }
}
