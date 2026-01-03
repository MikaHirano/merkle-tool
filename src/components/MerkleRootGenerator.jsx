import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildMerkleTreeFromLeafHashes,
  computeFileContentHashHex,
  computeLeafHashBytes,
  humanBytes,
  listFilesFromDirectoryHandle,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";
import {
  ProgressBar,
  readFileWithErrorHandling,
  shouldIgnoreRelPath,
} from "../lib/utils.jsx";
import { PROGRESS_UPDATE_THROTTLE_MS, DEFAULT_FOLDER_POLICY } from "../lib/constants.js";
import { getErrorMessage, logError } from "../lib/errorHandler.js";
import FolderPolicy from "./FolderPolicy.jsx";

/**
 * Bytes-only Merkle commitment:
 * - contentHash = SHA256(fileBytes)
 * - leafHash    = SHA256("leaf\0" + contentHashBytes)
 * - nodes       = SHA256("node\0" + left + right)
 * - ordering    = leafHash hex asc
 */

// Use default policy from constants
const DEFAULT_POLICY = DEFAULT_FOLDER_POLICY;

export default function MerkleRootGenerator() {
  const hasDir = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const hasOpen = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const [policy, setPolicy] = useState(DEFAULT_POLICY);

  const [status, setStatus] = useState("Idle.");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [copyFeedback, setCopyFeedback] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProgressUpdate = useRef(0);
  const [currentFile, setCurrentFile] = useState(null);
  const [currentFileProgress, setCurrentFileProgress] = useState({
    bytesProcessed: 0,
    totalBytes: 0
  });
  const abortControllerRef = useRef(null);
  const [isStopping, setIsStopping] = useState(false);
  
  // Time estimation state
  const [processingStartTime, setProcessingStartTime] = useState(null);
  const [bytesProcessed, setBytesProcessed] = useState(0);
  const [totalBytesToProcess, setTotalBytesToProcess] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(null);
  const processingSpeedRef = useRef(null); // bytes/second (exponential moving average)
  const lastSpeedUpdateTime = useRef(null);
  const lastBytesProcessed = useRef(0);

  const updateProgressThrottled = useCallback((done, total) => {
    const now = Date.now();
    if (now - lastProgressUpdate.current > PROGRESS_UPDATE_THROTTLE_MS) {
      setProgress({ done, total });
      lastProgressUpdate.current = now;
    }
  }, []);

  // folder outputs
  const [root, setRoot] = useState("");
  const [json, setJson] = useState(null);

  // single file output
  const [fileHash, setFileHash] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);

  const pct = useMemo(
    () => (progress.total ? Math.round((progress.done / progress.total) * 100) : 0),
    [progress]
  );

  // Format time remaining for display
  function formatTimeRemaining(seconds) {
    if (seconds < 5) return "< 5 sec";
    if (seconds < 60) return `~${Math.round(seconds)} sec`;
    if (seconds < 3600) {
      const minutes = Math.round(seconds / 60);
      return `~${minutes} min`;
    }
    const hours = Math.round(seconds / 3600);
    return `~${hours} hr`;
  }

  // Update time estimation based on current progress
  function updateTimeEstimation(currentBytesProcessed, totalBytes) {
    const now = Date.now();
    
    // Initialize start time if not set
    if (!processingStartTime) {
      setProcessingStartTime(now);
      lastSpeedUpdateTime.current = now;
      lastBytesProcessed.current = currentBytesProcessed;
      return;
    }

    // Don't estimate until at least 1 second has passed
    const elapsedSeconds = (now - processingStartTime) / 1000;
    if (elapsedSeconds < 1) {
      return;
    }

    // Calculate current speed (bytes per second)
    const timeSinceLastUpdate = (now - lastSpeedUpdateTime.current) / 1000;
    if (timeSinceLastUpdate >= 0.5) { // Update speed every 500ms
      const bytesSinceLastUpdate = currentBytesProcessed - lastBytesProcessed.current;
      const currentSpeed = bytesSinceLastUpdate / timeSinceLastUpdate;
      
      // Exponential moving average (alpha = 0.3)
      const alpha = 0.3;
      if (processingSpeedRef.current === null) {
        processingSpeedRef.current = currentSpeed;
      } else {
        processingSpeedRef.current = alpha * currentSpeed + (1 - alpha) * processingSpeedRef.current;
      }
      
      lastSpeedUpdateTime.current = now;
      lastBytesProcessed.current = currentBytesProcessed;
    }

    // Calculate estimated time remaining
    if (processingSpeedRef.current && processingSpeedRef.current > 0) {
      const remainingBytes = totalBytes - currentBytesProcessed;
      const estimatedSeconds = remainingBytes / processingSpeedRef.current;
      setEstimatedTimeRemaining(formatTimeRemaining(estimatedSeconds));
    }
  }

  function resetAll() {
    // Cancel any ongoing processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setError("");
    setStatus("Idle.");
    setProgress({ done: 0, total: 0 });
    setCurrentFile(null);
    setCurrentFileProgress({ bytesProcessed: 0, totalBytes: 0 });
    setIsStopping(false);

    setRoot("");
    setJson(null);

    setFileHash("");
    setFileName("");
    setFileSize(0);
  }

  function cancelProcessing() {
    setIsStopping(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  async function copyToClipboard(text, successMessage = "Copied!") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(successMessage);
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      setCopyFeedback("Copy failed");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  }

  function downloadMerkleJson() {
    if (!json) return;
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merkle-tree.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function chooseFolderAndGenerate() {
    resetAll();
    if (!hasDir) return;

    // Create new AbortController for this operation
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsProcessing(true);
    try {
      setStatus("Selecting folder…");
      const dir = await window.showDirectoryPicker();

      if (signal.aborted) {
        throw new Error("Processing cancelled");
      }

      setStatus("Scanning files…");
      const pairs = await listFilesFromDirectoryHandle(dir);

      // apply policy
      const filtered = pairs.filter((p) => !shouldIgnoreRelPath(p.relPath, policy));
      if (filtered.length === 0) throw new Error("No files left after applying Folder Policy.");

      const totalBytes = filtered.reduce((a, p) => a + (p.file.size || 0), 0);
      
      // Initialize time estimation for folder processing
      setTotalBytesToProcess(totalBytes);
      setBytesProcessed(0);
      setProcessingStartTime(Date.now());
      processingSpeedRef.current = null;
      lastSpeedUpdateTime.current = null;
      lastBytesProcessed.current = 0;

      setStatus("Computing file hashes…");
      setProgress({ done: 0, total: filtered.length });

      const enc = new TextEncoder();
      const leafHashes = [];
      const leaves = [];

      for (let i = 0; i < filtered.length; i++) {
        // Check for cancellation
        if (signal.aborted) {
          throw new Error("Processing cancelled");
        }

        const { file, relPath } = filtered[i];

        // Update progress BEFORE processing to show current file being processed
        updateProgressThrottled(i + 1, filtered.length);
        
        // For very large files, use streaming hash directly instead of reading entire file
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
        const SHOW_PROGRESS_THRESHOLD = 50 * 1024 * 1024; // 50 MB - show progress for files larger than this
        let contentHashBytes;
        
        if (file.size > LARGE_FILE_THRESHOLD) {
          // Use streaming hash for large files (doesn't load entire file into memory)
          const { sha256Stream } = await import("../lib/merkle.js");
          
          // Set up per-file progress tracking for large files
          if (file.size > SHOW_PROGRESS_THRESHOLD) {
            setCurrentFile(relPath);
            setCurrentFileProgress({ bytesProcessed: 0, totalBytes: file.size });
          }
          
          contentHashBytes = await sha256Stream(file, (bytesProcessed, totalBytes) => {
            if (file.size > SHOW_PROGRESS_THRESHOLD) {
              // Use functional state update to ensure we always have the latest values
              setCurrentFileProgress(prev => ({
                ...prev,
                bytesProcessed,
                totalBytes
              }));
            }
            
            // Update time estimation for folder processing
            // Calculate total bytes processed so far: sum of completed files + current file progress
            const completedFilesBytes = filtered.slice(0, i).reduce((sum, p) => sum + (p.file.size || 0), 0);
            const totalBytesProcessed = completedFilesBytes + bytesProcessed;
            setBytesProcessed(totalBytesProcessed);
            // Use the totalBytes variable from the outer scope, not state
            updateTimeEstimation(totalBytesProcessed, totalBytes);
          });
          
          // Final progress update should already be at 100% from sha256Stream callback
          // But ensure it's set correctly before clearing
          if (file.size > SHOW_PROGRESS_THRESHOLD) {
            // Ensure final state shows 100% using functional update
            setCurrentFileProgress(prev => ({
              ...prev,
              bytesProcessed: file.size,
              totalBytes: file.size
            }));
            // Small delay to show 100% before clearing
            await new Promise(resolve => setTimeout(resolve, 150));
            setCurrentFile(null);
            setCurrentFileProgress({ bytesProcessed: 0, totalBytes: 0 });
          }
        } else {
          // Use regular approach for smaller files
        const bytes = await readFileWithErrorHandling(file);
          contentHashBytes = await sha256Bytes(bytes);
          
          // Update time estimation after file is processed
          const completedFilesBytes = filtered.slice(0, i + 1).reduce((sum, p) => sum + (p.file.size || 0), 0);
          setBytesProcessed(completedFilesBytes);
          // Use the totalBytes variable from the outer scope, not state
          updateTimeEstimation(completedFilesBytes, totalBytes);
        }
        
        const contentHashHex = toHex(contentHashBytes);

        const leafHashBytes = await computeLeafHashBytes(contentHashBytes);

        leafHashes.push(leafHashBytes);
        leaves.push({
          contentHash: contentHashHex,
          leafHash: toHex(leafHashBytes),
          size: file.size,
          lastModified: file.lastModified,
        });
      }

      // Ensure final progress is shown
      setProgress({ done: filtered.length, total: filtered.length });

      // canonical ordering: leafHash hex asc
      leafHashes.sort((a, b) => (toHex(a) < toHex(b) ? -1 : 1));
      leaves.sort((a, b) => (a.leafHash < b.leafHash ? -1 : 1));

      setStatus("Building Merkle tree…");
      const { root: rootBytes, levels } = await buildMerkleTreeFromLeafHashes(leafHashes);
      const rootHex = toHex(rootBytes);

      const out = {
        schema: "merkle-bytes-tree@1",
        generatedAt: new Date().toISOString(),
        algorithm: "SHA-256",
        folderPolicy: policy,
        canonicalization: {
          contentHash: "SHA256(fileBytes)",
          leaf: 'SHA256("leaf\\0" + contentHashBytes)',
          node: 'SHA256("node\\0" + left + right)',
          ordering: "leafHash hex asc",
          oddRule: "duplicate last",
        },
        summary: {
          fileCount: leaves.length,
          totalBytes,
          totalBytesHuman: humanBytes(totalBytes),
        },
        root: rootHex,
        tree: { levels: levels.map((lvl) => lvl.map((h) => toHex(h))) },
        leaves,
      };

      setRoot(rootHex);
      setJson(out);
      setStatus("Done.");
    } catch (e) {
      const errorMsg = getErrorMessage(e);
      if (errorMsg.includes("cancelled") || errorMsg.includes("Cancelled") || e?.name === "AbortError") {
        setStatus("Cancelled.");
        setError("");
      } else {
        logError(e, "MerkleRootGenerator.chooseFolderAndGenerate");
        setError(errorMsg);
      setStatus("Idle.");
      }
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      abortControllerRef.current = null;
    }
  }

  async function chooseFileAndHash() {
    resetAll();
    if (!hasOpen) return;

    setIsProcessing(true);
    try {
      setStatus("Choosing file…");
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const f = await handle.getFile();

      setStatus("Computing hash…");
      setFileName(f.name);
      setFileSize(f.size);

      // Initialize time estimation for single file processing
      setTotalBytesToProcess(f.size);
      setBytesProcessed(0);
      setProcessingStartTime(Date.now());
      processingSpeedRef.current = null;
      lastSpeedUpdateTime.current = null;
      lastBytesProcessed.current = 0;

      // For large files, use streaming with progress tracking
      const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
      let hex;
      
      if (f.size > LARGE_FILE_THRESHOLD) {
        // Use streaming hash for large files with progress tracking
        const { sha256Stream } = await import("../lib/merkle.js");
        setCurrentFile(f.name);
        setCurrentFileProgress({ bytesProcessed: 0, totalBytes: f.size });
        
        const digest = await sha256Stream(f, (bytesProcessed, totalBytes) => {
          setCurrentFileProgress({ bytesProcessed, totalBytes });
          setBytesProcessed(bytesProcessed);
          updateTimeEstimation(bytesProcessed, totalBytes);
        });
        
        hex = toHex(digest);
        setCurrentFile(null);
        setCurrentFileProgress({ bytesProcessed: 0, totalBytes: 0 });
      } else {
        // For small files, process directly (too fast to track progress meaningfully)
        hex = await computeFileContentHashHex(f);
        // Update time estimation after completion
        setBytesProcessed(f.size);
        updateTimeEstimation(f.size, f.size);
      }
      setFileHash(hex);
      setStatus("Done.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      logError(e, "MerkleRootGenerator.chooseFileAndHash");
      setError(getErrorMessage(e));
      setStatus("Idle.");
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      abortControllerRef.current = null;
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Merkle Root Generator</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{ ...button, ...(isProcessing ? buttonDisabled : {}) }}
            onClick={chooseFolderAndGenerate}
            disabled={!hasDir || isProcessing}
            aria-label="Select folder and generate Merkle tree"
            aria-busy={isProcessing}
          >
            {isProcessing ? "Processing..." : "Folder → Merkle Tree"}
          </button>

          <button
            style={{ ...button, ...(isProcessing ? buttonDisabled : {}) }}
            onClick={chooseFileAndHash}
            disabled={!hasOpen || isProcessing}
            aria-label="Select single file and compute SHA-256 hash"
            aria-busy={isProcessing}
          >
            {isProcessing ? "Processing..." : "Single File → SHA-256"}
          </button>
        </div>

        {(!hasDir || !hasOpen) && (
          <div style={hint}>
            Your browser must support the File System Access API. Use Chrome/Brave/Edge on a secure context (https or localhost).
          </div>
        )}
      </div>

      <FolderPolicy
        policy={policy}
        onChange={setPolicy}
        source="manual"
        editable={true}
        showSource={true}
      />

      {progress.total > 0 && (
        <div>
          <ProgressBar done={progress.done} total={progress.total} />
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              Hashing file {progress.done} of {progress.total}
              {estimatedTimeRemaining && (
                <span style={{ marginLeft: 8, opacity: 0.8 }}>· {estimatedTimeRemaining} remaining</span>
              )}
            </span>
            {isProcessing && (
              <button
                onClick={cancelProcessing}
                style={isStopping ? cancelButtonDisabled : cancelButton}
                aria-label="Stop processing"
                disabled={isStopping}
                onMouseEnter={(e) => {
                  if (!isStopping) {
                    e.target.style.background = "rgba(255, 107, 107, 0.2)";
                    e.target.style.borderColor = "rgba(255, 107, 107, 0.5)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isStopping) {
                    e.target.style.background = "rgba(255, 107, 107, 0.1)";
                    e.target.style.borderColor = "rgba(255, 107, 107, 0.3)";
                  }
                }}
              >
                {isStopping ? "Stopping Processing" : "Stop Processing"}
              </button>
            )}
          </div>
        </div>
      )}

      {isProcessing && progress.total === 0 && (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={cancelProcessing}
            style={isStopping ? cancelButtonDisabled : cancelButton}
            aria-label="Stop processing"
            disabled={isStopping}
            onMouseEnter={(e) => {
              if (!isStopping) {
                e.target.style.background = "rgba(255, 107, 107, 0.2)";
                e.target.style.borderColor = "rgba(255, 107, 107, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isStopping) {
                e.target.style.background = "rgba(255, 107, 107, 0.1)";
                e.target.style.borderColor = "rgba(255, 107, 107, 0.3)";
              }
            }}
          >
            {isStopping ? "Stopping Processing" : "Stop Processing"}
          </button>
        </div>
      )}

      {/* Per-file progress indicator for large files */}
      {currentFile && currentFileProgress.totalBytes > 0 && (
        <div style={fileProgressContainer}>
          <div style={fileProgressHeader}>
            <div style={fileProgressSpinner}></div>
            <span style={fileProgressLabel}>Hashing:</span>
            <span style={fileProgressFileName} title={currentFile}>
              {currentFile.length > 60 ? currentFile.substring(0, 57) + '...' : currentFile}
            </span>
          </div>
          <div style={fileProgressInfo}>
            {humanBytes(currentFileProgress.bytesProcessed)} / {humanBytes(currentFileProgress.totalBytes)} · {currentFileProgress.totalBytes > 0 ? Math.round((currentFileProgress.bytesProcessed / currentFileProgress.totalBytes) * 100) : 0}%
            {estimatedTimeRemaining && (
              <span style={{ marginLeft: 8 }}>· {estimatedTimeRemaining} remaining</span>
            )}
          </div>
        </div>
      )}

      {json && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Folder Result</h2>
          <div style={{ opacity: 0.8, marginBottom: 6 }}>Merkle root:</div>
          <div style={mono}>{root}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button 
              style={button} 
              onClick={downloadMerkleJson}
              aria-label="Download merkle tree JSON file"
            >
              Download merkle-tree.json
            </button>
            <button 
              style={button} 
              onClick={() => copyToClipboard(root, "Root copied!")}
              aria-label="Copy Merkle root to clipboard"
            >
              Copy root
            </button>
          </div>

          <details style={{ marginTop: 10 }}>
            <summary>Preview JSON</summary>
            <pre style={pre}>{JSON.stringify(json, null, 2)}</pre>
          </details>
        </div>
      )}

      {fileHash && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>File Result</h2>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {fileName} · {humanBytes(fileSize)}
          </div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>SHA-256:</div>
          <div style={mono}>{fileHash}</div>
          <div style={{ marginTop: 10 }}>
            <button 
              style={button} 
              onClick={() => copyToClipboard(fileHash, "Hash copied!")}
              aria-label="Copy file hash to clipboard"
            >
              Copy hash
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10,
          padding: 12,
          background: "rgba(255, 107, 107, 0.1)",
          border: "1px solid rgba(255, 107, 107, 0.3)",
          borderRadius: 8,
          color: "#ff6b6b"
        }}>
          WARNING: {error}
        </div>
      )}

      {copyFeedback && (
        <div style={{
          marginTop: 10,
          padding: 8,
          background: "rgba(46, 204, 113, 0.1)",
          border: "1px solid rgba(46, 204, 113, 0.3)",
          borderRadius: 8,
          color: "#2ecc71",
          fontSize: 14
        }}>
          ✓ {copyFeedback}
        </div>
      )}

      <div style={{
        marginTop: 10,
        padding: 8,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 8,
        fontSize: 14,
        opacity: 0.9,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
        {status.includes("Scanning") && (
          <div style={scanningSpinner}></div>
        )}
        Status: {status}{progress.total ? ` · ${pct}%` : ""}
        {estimatedTimeRemaining && !progress.total && (
          <span style={{ marginLeft: 8, opacity: 0.8 }}>· {estimatedTimeRemaining} remaining</span>
        )}
      </div>
    </div>
  );
}

// Add CSS animations for spinner
if (typeof document !== "undefined" && !document.getElementById('merkle-file-progress-animations')) {
  const styleSheet = document.createElement("style");
  styleSheet.id = 'merkle-file-progress-animations';
  styleSheet.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

/** ---------------- styles ---------------- **/

const card = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 16,
  marginTop: 14,
  background: "rgba(0,0,0,0.25)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
};

const button = {
  padding: "12px 16px",
  borderRadius: 12,
  background: "#111",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const buttonDisabled = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const row = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginTop: 8,
};

const hint = {
  marginTop: 10,
  fontSize: 12,
  opacity: 0.75,
  lineHeight: 1.5,
};

const mono = {
  marginTop: 6,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  wordBreak: "break-all",
};

const monoInline = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

const pre = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.04)",
  overflowX: "auto",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
};

const barTrack = {
  width: "100%",
  height: 10,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const barFill = {
  height: "100%",
  borderRadius: 999,
  background: "rgba(255,255,255,0.85)",
};

const fileProgressContainer = {
  marginTop: 12,
  padding: 12,
  background: "rgba(255,255,255,0.03)",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.06)",
};

const fileProgressHeader = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
  fontSize: 12,
};

const fileProgressSpinner = {
  width: 12,
  height: 12,
  border: "2px solid rgba(102, 126, 234, 0.3)",
  borderTopColor: "rgba(102, 126, 234, 1)",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
  flexShrink: 0,
};

const fileProgressLabel = {
  opacity: 0.7,
  fontWeight: 500,
  flexShrink: 0,
};

const fileProgressFileName = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11,
  opacity: 0.9,
};

const fileProgressInfo = {
  fontSize: 11,
  opacity: 0.8,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  marginBottom: 6,
};

const fileProgressBarContainer = {
  marginTop: 4,
};

const fileProgressBar = {
  width: "100%",
  height: 6,
  borderRadius: 3,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const fileProgressBarFill = {
  height: "100%",
  background: "linear-gradient(90deg, rgba(102, 126, 234, 0.8), rgba(102, 126, 234, 1))",
  transition: "width 0.2s ease",
  borderRadius: 3,
};

const scanningSpinner = {
  width: 14,
  height: 14,
  border: "2px solid rgba(255, 255, 255, 0.3)",
  borderTopColor: "rgba(255, 255, 255, 0.9)",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
  flexShrink: 0,
};

const cancelButton = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "rgba(255, 107, 107, 0.1)",
  color: "#ff6b6b",
  border: "1px solid rgba(255, 107, 107, 0.3)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
  transition: "all 0.2s ease",
  outline: "none",
};

const cancelButtonDisabled = {
  ...cancelButton,
  opacity: 0.6,
  cursor: "not-allowed",
};