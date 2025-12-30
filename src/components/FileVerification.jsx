import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildMerkleTreeFromLeafHashes,
  computeLeafHashBytes,
  computeRootFromProof,
  hexToBytes,
  humanBytes,
  isHex256,
  listFilesFromDirectoryHandle,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";
import {
  ProgressBar,
  readFileWithErrorHandling,
  shouldIgnoreRelPath,
} from "../lib/utils.jsx";
import { PROGRESS_UPDATE_THROTTLE_MS } from "../lib/constants.js";
import { getErrorMessage, logError } from "../lib/errorHandler.js";

/**
 * Verification supports:
 * 1) Open merkle-tree.json (via showOpenFilePicker)
 * 2) Verify folder (via showDirectoryPicker) → recompute root bytes-only
 * 3) Verify single file (via showOpenFilePicker) → membership proof against JSON
 */



function buildProof(levels, idx) {
  const proof = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const nodes = levels[l];
    const isRight = idx % 2 === 1;
    const sib = nodes[isRight ? idx - 1 : idx + 1] || nodes[idx];
    proof.push({
      position: isRight ? "left" : "right",
      hash: toHex(sib),
    });
    idx = Math.floor(idx / 2);
  }
  return proof;
}


export default function FileVerification() {
  const hasDir = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const hasOpen = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const [json, setJson] = useState(null);
  const [jsonName, setJsonName] = useState("merkle-tree.json");

  const [status, setStatus] = useState("Idle.");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProgressUpdate = useRef(0);

  // Throttle progress updates to avoid excessive re-renders
  const updateProgressThrottled = useCallback((done, total) => {
    const now = Date.now();
    if (now - lastProgressUpdate.current > PROGRESS_UPDATE_THROTTLE_MS) {
      setProgress({ done, total });
      lastProgressUpdate.current = now;
    }
  }, []);

  const [folderResult, setFolderResult] = useState(null);
  const [fileResult, setFileResult] = useState(null);

  // Should verification apply the JSON's folder policy?
  // (recommended: ON)
  const [useJsonPolicy, setUseJsonPolicy] = useState(true);

  const pct = useMemo(
    () => (progress.total ? Math.round((progress.done / progress.total) * 100) : 0),
    [progress]
  );

  function resetResults() {
    setError("");
    setFolderResult(null);
    setFileResult(null);
    setProgress({ done: 0, total: 0 });
  }

  async function openJson() {
    resetResults();
    if (!hasOpen) return;

    try {
      setStatus("Choosing JSON…");
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Merkle JSON",
            accept: { "application/json": [".json"] },
          },
        ],
      });

      const f = await handle.getFile();
      setJsonName(f.name || "merkle-tree.json");

      const parsed = JSON.parse(await f.text());

      const schema = String(parsed.schema || "");
      if (!schema.startsWith("merkle-")) throw new Error(`Unsupported schema: "${schema || "(missing)"}"`);
      if (!isHex256(parsed.root)) throw new Error("Invalid root in JSON.");
      if (!Array.isArray(parsed.leaves) || parsed.leaves.length === 0) throw new Error("Invalid leaves array.");
      if (!parsed.tree?.levels || !Array.isArray(parsed.tree.levels) || parsed.tree.levels.length === 0) {
        throw new Error("Invalid tree.levels in JSON.");
      }

      // require policy for folder verification consistency
      if (!parsed.folderPolicy) {
        throw new Error('This JSON is missing "folderPolicy". Please regenerate using the current Generator.');
      }

      setJson(parsed);
      setStatus("JSON loaded.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      logError(e, "FileVerification.openJson");
      setError(getErrorMessage(e));
      setStatus("Idle.");
    }
  }

  async function verifyFolder() {
    if (!json) return;
    if (!hasDir) return;

    resetResults();
    setIsProcessing(true);

    try {
      setStatus("Requesting folder permission…");
      const dir = await window.showDirectoryPicker();

      setStatus("Scanning folder…");
      const pairs = await listFilesFromDirectoryHandle(dir);

      // apply policy
      const policy = useJsonPolicy ? json.folderPolicy : { includeHidden: true, ignoreJunk: false, ignoreNames: [], ignorePrefixes: [], ignorePathPrefixes: [] };

      // Always ignore the proof file if it exists inside the folder
      const filtered = pairs
        .filter((p) => p.relPath !== "merkle-tree.json" && p.relPath !== jsonName)
        .filter((p) => !shouldIgnoreRelPath(p.relPath, policy));

      if (filtered.length === 0) throw new Error("No files left after applying folderPolicy.");

      const totalBytes = filtered.reduce((a, p) => a + (p.file.size || 0), 0);

      setStatus("Hashing files locally…");
      setProgress({ done: 0, total: filtered.length });

      // Store file data with hashes for both exact and subset verification
      const fileData = [];
      const enc = new TextEncoder();
      
      for (let i = 0; i < filtered.length; i++) {
        const { file, relPath } = filtered[i];
        
        // For very large files, use streaming hash directly instead of reading entire file
        const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
        let contentHashBytes;
        
        if (file.size > LARGE_FILE_THRESHOLD) {
          // Use streaming hash for large files (doesn't load entire file into memory)
          const { sha256Stream } = await import("../lib/merkle.js");
          contentHashBytes = await sha256Stream(file);
        } else {
          // Use regular approach for smaller files
          const bytes = await readFileWithErrorHandling(file);
          contentHashBytes = await sha256Bytes(bytes);
        }
        const contentHashHex = toHex(contentHashBytes).toLowerCase();
        const leafHashBytes = await computeLeafHashBytes(contentHashBytes);
        
        fileData.push({
          relPath,
          contentHashHex,
          leafHashBytes,
          contentHashBytes
        });
        
        updateProgressThrottled(i + 1, filtered.length);
      }

      // Ensure final progress is shown
      setProgress({ done: filtered.length, total: filtered.length });

      // Try exact match first: canonical ordering and build tree
      const leafHashes = fileData.map(f => f.leafHashBytes);
      leafHashes.sort((a, b) => (toHex(a) < toHex(b) ? -1 : 1));

      setStatus("Building Merkle tree…");
      const { root } = await buildMerkleTreeFromLeafHashes(leafHashes);
      const computed = toHex(root);
      const expected = String(json.root || "");

      const exactMatch = computed.toLowerCase() === expected.toLowerCase();

      let verificationMode = "exact";
      let filesVerified = [];
      let filesMissing = [];
      let verificationRate = 0;

      if (exactMatch) {
        // Exact match - all files verified
        filesVerified = fileData.map(f => f.relPath);
        verificationRate = 100;
      } else {
        // Fall back to subset verification
        verificationMode = "subset";
        setStatus("Verifying files individually…");
        
        // Create lookup map: contentHash -> array of leaf indices
        const contentHashMap = new Map();
        for (let i = 0; i < json.leaves.length; i++) {
          const leaf = json.leaves[i];
          const hash = String(leaf.contentHash || "").toLowerCase();
          if (!contentHashMap.has(hash)) {
            contentHashMap.set(hash, []);
          }
          contentHashMap.get(hash).push(i);
        }

        // Prepare tree levels for proof verification
        const levels = json.tree.levels.map((lvl) => lvl.map(hexToBytes));

        // Verify each file individually
        let verifiedCount = 0;
        for (let i = 0; i < fileData.length; i++) {
          const file = fileData[i];
          updateProgressThrottled(i + 1, fileData.length);

          const candidateIndices = contentHashMap.get(file.contentHashHex) || [];
          
          if (candidateIndices.length === 0) {
            filesMissing.push(file.relPath);
            continue;
          }

          // Try to verify membership for each candidate
          let verified = false;
          for (const idx of candidateIndices) {
            const leaf = json.leaves[idx];
            const leafHashHex = String(leaf.leafHash || "").toLowerCase();
            
            if (toHex(file.leafHashBytes).toLowerCase() !== leafHashHex) {
              continue;
            }

            // Build proof and verify
            const proof = buildProof(levels, idx);
            const computedRoot = toHex(await computeRootFromProof(file.leafHashBytes, proof));

            if (computedRoot.toLowerCase() === expected.toLowerCase()) {
              verified = true;
              break;
            }
          }

          if (verified) {
            filesVerified.push(file.relPath);
            verifiedCount++;
          } else {
            filesMissing.push(file.relPath);
          }
        }

        verificationRate = fileData.length > 0 
          ? Math.round((verifiedCount / fileData.length) * 100) 
          : 0;
      }

      const ok = exactMatch || (verificationMode === "subset" && filesVerified.length > 0 && filesMissing.length === 0);

      setFolderResult({
        ok,
        verificationMode,
        expected,
        computed: exactMatch ? computed : null,
        jsonLeafCount: json.summary?.fileCount ?? json.leaves.length,
        selectedCount: pairs.length,
        filteredCount: filtered.length,
        policyUsed: useJsonPolicy ? "json.folderPolicy" : "no policy",
        filesVerified,
        filesMissing,
        verificationRate,
        verifiedCount: filesVerified.length,
        totalFiles: fileData.length,
      });

      setStatus("Done.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      logError(e, "FileVerification.verifyFolder");
      setError(getErrorMessage(e));
      setStatus("Idle.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function verifySingleFile() {
    if (!json) return;
    if (!hasOpen) return;

    resetResults();
    setIsProcessing(true);

    try {
      setStatus("Choosing file…");
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const file = await handle.getFile();


      setStatus("Hashing file locally…");
      
      // For very large files, use streaming hash directly instead of reading entire file
      const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
      let contentHashBytes;
      
      if (file.size > LARGE_FILE_THRESHOLD) {
        // Use streaming hash for large files (doesn't load entire file into memory)
        const { sha256Stream } = await import("../lib/merkle.js");
        contentHashBytes = await sha256Stream(file);
      } else {
        // Use regular approach for smaller files
        const bytes = await readFileWithErrorHandling(file);
        contentHashBytes = await sha256Bytes(bytes);
      }

      const enc = new TextEncoder();
      const contentHashHex = toHex(contentHashBytes).toLowerCase();

      const leafHashBytes = await computeLeafHashBytes(contentHashBytes);
      const leafHashHex = toHex(leafHashBytes).toLowerCase();

      // quick filter by content hash
      const candidateIdx = [];
      for (let i = 0; i < json.leaves.length; i++) {
        if (String(json.leaves[i].contentHash || "").toLowerCase() === contentHashHex) {
          candidateIdx.push(i);
        }
      }

      if (candidateIdx.length === 0) {
        setFileResult({ ok: false, reason: "Not found: this file’s bytes are not present in the committed set." });
        setStatus("Done.");
        return;
      }

      // verify membership using stored levels
      const levels = json.tree.levels.map((lvl) => lvl.map(hexToBytes));

      for (const idx of candidateIdx) {
        const leaf = json.leaves[idx];
        if (String(leaf.leafHash || "").toLowerCase() !== leafHashHex) continue;

        const proof = buildProof(levels, idx);
        const computedRoot = toHex(await computeRootFromProof(leafHashBytes, proof));

        if (computedRoot.toLowerCase() === String(json.root || "").toLowerCase()) {
          setFileResult({ ok: true });
          setStatus("Done.");
          return;
        }
      }

      setFileResult({
        ok: false,
        reason: "Content hash matched a candidate, but membership proof did not validate against the stored root.",
      });
      setStatus("Done.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      logError(e, "FileVerification.verifySingleFile");
      setError(getErrorMessage(e));
      setStatus("Idle.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>File Verification</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button 
            style={button} 
            onClick={openJson} 
            disabled={!hasOpen}
            aria-label="Open merkle tree JSON file for verification"
          >
            Open merkle-tree.json
          </button>
        </div>

        {json && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Loaded: <span style={monoInline}>{jsonName}</span>
            </div>
            <div style={{ marginTop: 8, opacity: 0.8 }}>Root:</div>
            <div style={mono}>{json.root}</div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={useJsonPolicy}
                onChange={(e) => setUseJsonPolicy(e.target.checked)}
              />
              Use JSON folderPolicy (recommended)
            </label>

            <div style={hint}>
              If folder verification mismatches, toggle this OFF to debug what’s in the raw folder.
            </div>
          </div>
        )}

        {!hasOpen && (
          <div style={hint}>
            This browser doesn’t support File System Access API. Use Chrome/Brave/Edge on https or localhost.
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{ ...button, ...(isProcessing ? buttonDisabled : {}) }}
            onClick={verifyFolder}
            disabled={!json || !hasDir || isProcessing}
            aria-label="Verify folder against loaded Merkle tree"
            aria-busy={isProcessing}
          >
            {isProcessing ? "Verifying..." : "Verify Folder"}
          </button>
          <button
            style={{ ...button, ...(isProcessing ? buttonDisabled : {}) }}
            onClick={verifySingleFile}
            disabled={!json || !hasOpen || isProcessing}
            aria-label="Verify single file against loaded Merkle tree"
            aria-busy={isProcessing}
          >
            {isProcessing ? "Verifying..." : "Verify Single File"}
          </button>
        </div>

        {!hasDir && (
          <div style={hint}>
            Folder verification requires <span style={monoInline}>showDirectoryPicker()</span>.
          </div>
        )}
      </div>

      {progress.total > 0 && <ProgressBar done={progress.done} total={progress.total} />}

      {folderResult && (
        <div style={{ ...card, borderColor: folderResult.ok ? "#2ecc71" : "#e74c3c" }}>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: folderResult.ok ? "#2ecc71" : "#e74c3c",
            marginBottom: 12
          }}>
            {folderResult.ok ? "Folder Verified Successfully" : "Folder Verification Failed"}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.88, lineHeight: 1.6 }}>
            <div>Verification mode: <span style={monoInline}>{folderResult.verificationMode === "exact" ? "Exact Match" : "Subset Verification"}</span></div>
            <div>Selected by picker: <span style={monoInline}>{folderResult.selectedCount}</span></div>
            <div>After filtering: <span style={monoInline}>{folderResult.filteredCount}</span></div>
            <div>JSON leaf count: <span style={monoInline}>{folderResult.jsonLeafCount}</span></div>
            <div>Policy used: <span style={monoInline}>{folderResult.policyUsed}</span></div>
            
            {folderResult.verificationMode === "subset" && (
              <>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <div>Files verified: <span style={monoInline}>{folderResult.verifiedCount}</span> / <span style={monoInline}>{folderResult.totalFiles}</span></div>
                  <div>Verification rate: <span style={monoInline}>{folderResult.verificationRate}%</span></div>
                </div>
              </>
            )}
          </div>

          {folderResult.verificationMode === "exact" && !folderResult.ok && (
            <>
              <div style={{ marginTop: 12, opacity: 0.8 }}>Expected root:</div>
              <div style={mono}>{folderResult.expected}</div>

              <div style={{ marginTop: 12, opacity: 0.8 }}>Computed root:</div>
              <div style={mono}>{folderResult.computed}</div>
            </>
          )}

          {folderResult.verificationMode === "subset" && folderResult.filesMissing && folderResult.filesMissing.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>Missing files ({folderResult.filesMissing.length}):</div>
              <div style={{
                maxHeight: 200,
                overflowY: "auto",
                padding: 8,
                background: "rgba(255, 107, 107, 0.05)",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
              }}>
                {folderResult.filesMissing.map((path, idx) => (
                  <div key={idx} style={{ marginBottom: 4, color: "#ff6b6b" }}>{path}</div>
                ))}
              </div>
            </div>
          )}

          {folderResult.verificationMode === "subset" && folderResult.ok && (
            <div style={{ marginTop: 12, padding: 10, background: "rgba(46, 204, 113, 0.1)", borderRadius: 8, fontSize: 13, color: "#2ecc71" }}>
              All {folderResult.verifiedCount} file{folderResult.verifiedCount !== 1 ? 's' : ''} in the selected folder are verified to be part of the original Merkle tree.
            </div>
          )}
        </div>
      )}

      {fileResult && (
        <div style={{ ...card, borderColor: fileResult.ok ? "#2ecc71" : "#e74c3c" }}>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: fileResult.ok ? "#2ecc71" : "#e74c3c",
            marginBottom: fileResult.ok ? 0 : 12
          }}>
            {fileResult.ok ? "File Verified Successfully" : "File Verification Failed"}
          </div>
          {!fileResult.ok && fileResult.reason && (
            <div style={{
              fontSize: 14,
              opacity: 0.9,
              lineHeight: 1.5,
              padding: 8,
              background: "rgba(231, 76, 60, 0.05)",
              borderRadius: 6
            }}>
              {fileResult.reason}
            </div>
          )}
        </div>
      )}

      <div style={{
        marginTop: 12,
        padding: 8,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 8,
        fontSize: 14,
        opacity: 0.9
      }}>
        Status: {status}{progress.total ? ` · ${pct}%` : ""}
      </div>

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
    </div>
  );
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