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


export default function FileVerification({ limits }) {
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
    if (now - lastProgressUpdate.current > 100) { // Update at most every 100ms
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
      setError(String(e?.message || e));
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

      // limits
      const totalBytes = filtered.reduce((a, p) => a + (p.file.size || 0), 0);
      const biggest = Math.max(...filtered.map((p) => p.file.size || 0));
      if (biggest > limits.maxFileBytes) {
        throw new Error(
          `Verification blocked: a file exceeds max file size (${humanBytes(limits.maxFileBytes)}). Largest is ${humanBytes(
            biggest
          )}.`
        );
      }
      if (totalBytes > limits.maxTotalBytes) {
        throw new Error(
          `Verification blocked: folder exceeds max total size (${humanBytes(limits.maxTotalBytes)}). Total is ${humanBytes(
            totalBytes
          )}.`
        );
      }

      setStatus("Hashing files locally…");
      setProgress({ done: 0, total: filtered.length });

      const enc = new TextEncoder();
      const leafHashes = [];

      for (let i = 0; i < filtered.length; i++) {
        const { file } = filtered[i];

        const bytes = await readFileWithErrorHandling(file);

        const contentHashBytes = await sha256Bytes(bytes);
        const leafHashBytes = await sha256Bytes(
          new Uint8Array([...enc.encode("leaf\0"), ...contentHashBytes])
        );

        leafHashes.push(leafHashBytes);
        updateProgressThrottled(i + 1, filtered.length);
      }

      // Ensure final progress is shown
      setProgress({ done: filtered.length, total: filtered.length });

      // canonical ordering
      leafHashes.sort((a, b) => (toHex(a) < toHex(b) ? -1 : 1));

      setStatus("Building Merkle tree…");
      const { root } = await buildMerkleTreeFromLeafHashes(leafHashes);
      const computed = toHex(root);
      const expected = String(json.root || "");

      const ok = computed.toLowerCase() === expected.toLowerCase();

      setFolderResult({
        ok,
        expected,
        computed,
        jsonLeafCount: json.summary?.fileCount ?? json.leaves.length,
        selectedCount: pairs.length,
        filteredCount: filtered.length,
        policyUsed: useJsonPolicy ? "json.folderPolicy" : "no policy",
      });

      setStatus("Done.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
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

      if (file.size > limits.maxFileBytes) {
        throw new Error(`File exceeds max file size (${humanBytes(limits.maxFileBytes)}).`);
      }

      setStatus("Hashing file locally…");
      const bytes = await readFileWithErrorHandling(file);

      const enc = new TextEncoder();
      const contentHashBytes = await sha256Bytes(bytes);
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
      setError(String(e?.message || e));
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
          <button style={button} onClick={openJson} disabled={!hasOpen}>
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
          >
            {isProcessing ? "Verifying..." : "Verify Folder"}
          </button>
          <button
            style={{ ...button, ...(isProcessing ? buttonDisabled : {}) }}
            onClick={verifySingleFile}
            disabled={!json || !hasOpen || isProcessing}
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
            {folderResult.ok ? "✅ Folder Verified Successfully" : "❌ Folder Verification Failed"}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.88, lineHeight: 1.6 }}>
            <div>Selected by picker: <span style={monoInline}>{folderResult.selectedCount}</span></div>
            <div>After filtering: <span style={monoInline}>{folderResult.filteredCount}</span></div>
            <div>JSON leaf count: <span style={monoInline}>{folderResult.jsonLeafCount}</span></div>
            <div>Policy used: <span style={monoInline}>{folderResult.policyUsed}</span></div>
          </div>

          {!folderResult.ok && (
            <>
              <div style={{ marginTop: 12, opacity: 0.8 }}>Expected root:</div>
              <div style={mono}>{folderResult.expected}</div>

              <div style={{ marginTop: 12, opacity: 0.8 }}>Computed root:</div>
              <div style={mono}>{folderResult.computed}</div>
            </>
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
            {fileResult.ok ? "✅ File Verified Successfully" : "❌ File Verification Failed"}
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
          ⚠️ {error}
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