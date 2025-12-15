import { useMemo, useState } from "react";
import {
  buildMerkleTreeFromLeafHashes,
  computeRootFromProof,
  hexToBytes,
  humanBytes,
  isHex256,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";

/** ---------------- helpers ---------------- **/

function normalizePath(p) {
  return String(p || "").replace(/\\/g, "/");
}
function baseName(p) {
  const s = normalizePath(p);
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}
function isHiddenPath(path) {
  return normalizePath(path)
    .split("/")
    .some((seg) => seg.startsWith("."));
}

// A permissive fallback policy if JSON doesn't include one
function defaultPolicy() {
  return {
    includeHidden: true,
    ignoreJunk: false,
    ignoreNames: [],
    ignorePrefixes: [],
    ignorePathPrefixes: [],
  };
}

function shouldIgnoreFile(file, relPath, policy, jsonFilename) {
  const p = normalizePath(relPath || file?.webkitRelativePath || file?.name || "");
  const name = baseName(p);

  // Always ignore proof file(s) if they live inside the folder
  if (name === "merkle-tree.json" || name === jsonFilename) return true;

  // Hidden files
  if (!policy?.includeHidden && (name.startsWith(".") || isHiddenPath(p))) return true;

  // Junk rules (optional)
  if (policy?.ignoreJunk) {
    if ((policy.ignoreNames || []).includes(name)) return true;
    if ((policy.ignorePrefixes || []).some((pref) => name.startsWith(pref))) return true;
    if ((policy.ignorePathPrefixes || []).some((pref) => p.startsWith(pref))) return true;
  }

  return false;
}

// Build Merkle proof from stored levels and leaf index
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

// Read directory handle recursively into an array of { file, relPath }
async function listFilesFromDirectoryHandle(dirHandle) {
  const out = [];

  async function walk(handle, prefix = "") {
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "file") {
        const f = await entry.getFile();
        out.push({ file: f, relPath: rel });
      } else if (entry.kind === "directory") {
        await walk(entry, rel);
      }
    }
  }

  await walk(dirHandle, "");
  return out;
}

/** ---------------- component ---------------- **/

export default function FileVerification({ limits }) {
  const hasDirectoryPicker =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  const [json, setJson] = useState(null);
  const [jsonFilename, setJsonFilename] = useState("merkle-tree.json");

  const [status, setStatus] = useState("Idle.");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [folderResult, setFolderResult] = useState(null);
  const [fileResult, setFileResult] = useState(null);

  // Toggle: verify using same policy as JSON vs verify everything (debug)
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

  async function loadJson(e) {
    resetResults();
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      const parsed = JSON.parse(await f.text());

      const schema = String(parsed.schema || "");
      if (!schema.startsWith("merkle-")) {
        throw new Error(`Unsupported schema: "${schema || "(missing)"}"`);
      }
      if (!isHex256(parsed.root)) throw new Error("Invalid root.");
      if (!Array.isArray(parsed.leaves) || parsed.leaves.length === 0) throw new Error("Invalid leaves.");
      if (!parsed.tree?.levels || !Array.isArray(parsed.tree.levels) || parsed.tree.levels.length === 0) {
        throw new Error("Invalid tree.levels.");
      }

      if (!parsed.folderPolicy) parsed.folderPolicy = defaultPolicy();

      setJson(parsed);
      setJsonFilename(f.name || "merkle-tree.json");
      setStatus("JSON loaded.");
    } catch (err) {
      setError(String(err?.message || err));
      setStatus("Idle.");
    }
  }

  async function verifyFolder(filesOrPairs, sourceLabel) {
    if (!json) return;

    resetResults();
    setStatus("Verifying folder…");

    try {
      // Normalize input to {file, relPath}
      // - If "Upload" input: we get File objects with webkitRelativePath
      // - If directory handle: we already pass {file, relPath}
      const pairs = Array.isArray(filesOrPairs)
        ? filesOrPairs.map((x) => {
            if (x?.file instanceof File) return { file: x.file, relPath: x.relPath || x.file.name };
            if (x instanceof File) return { file: x, relPath: x.webkitRelativePath || x.name };
            return null;
          }).filter(Boolean)
        : [];

      if (pairs.length === 0) {
        throw new Error(
          "No files were returned by the folder picker.\n\nTry Folder (Upload) or pick a different folder."
        );
      }

      const policy = useJsonPolicy ? json.folderPolicy : defaultPolicy();

      const filtered = pairs.filter(({ file, relPath }) => {
        return !shouldIgnoreFile(file, relPath, policy, jsonFilename);
      });

      if (filtered.length === 0) {
        const sample = pairs
          .slice(0, 12)
          .map((p) => p.relPath)
          .join(", ");
        throw new Error(
          `No files left after filtering.\n\n` +
            `Selected: ${pairs.length}\n` +
            `After filtering: 0\n\n` +
            `Tip: uncheck "Use JSON folderPolicy" to debug.\n` +
            `Example picked paths: ${sample}`
        );
      }

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

      setProgress({ done: 0, total: filtered.length });

      // bytes-only leaves: leafHash = SHA256("leaf\0" + contentHashBytes)
      const enc = new TextEncoder();
      const leafHashes = [];

      for (let i = 0; i < filtered.length; i++) {
        const { file } = filtered[i];

        let bytes;
        try {
          bytes = await file.arrayBuffer();
        } catch {
          throw new Error(`Failed to read "${file.name}". Permission may have been revoked or it moved.`);
        }

        const contentHashBytes = await sha256Bytes(bytes);
        const leafHashBytes = await sha256Bytes(
          new Uint8Array([...enc.encode("leaf\0"), ...contentHashBytes])
        );

        leafHashes.push(leafHashBytes);
        setProgress({ done: i + 1, total: filtered.length });
      }

      // canonical ordering: sort by leaf hash hex asc
      leafHashes.sort((a, b) => (toHex(a) < toHex(b) ? -1 : 1));

      const { root } = await buildMerkleTreeFromLeafHashes(leafHashes);
      const computed = toHex(root);
      const expected = String(json.root || "");

      const ok = computed.toLowerCase() === expected.toLowerCase();

      setFolderResult({
        ok,
        expected,
        computed,
        selectedCount: pairs.length,
        filteredCount: filtered.length,
        jsonLeafCount: json.summary?.fileCount ?? json.leaves.length,
        usedPolicy: useJsonPolicy,
        sourceLabel,
      });

      setStatus("Done.");
    } catch (err) {
      setError(String(err?.message || err));
      setStatus("Idle.");
    }
  }

  async function pickFolderNoUpload() {
    if (!json) return;
    resetResults();
    setStatus("Requesting folder permission…");

    try {
      const dir = await window.showDirectoryPicker();
      setStatus("Scanning folder…");
      const pairs = await listFilesFromDirectoryHandle(dir);
      await verifyFolder(pairs, "Folder (No Upload)");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  function pickFolderUpload() {
    const el = document.getElementById("folderPickUpload");
    if (!el) return;
    el.value = "";
    el.click();
  }

  async function verifyFile(file) {
    if (!json) return;

    resetResults();
    setStatus("Verifying file…");

    try {
      if (!file) return;

      if (file.size > limits.maxFileBytes) {
        throw new Error(`File exceeds max file size (${humanBytes(limits.maxFileBytes)}).`);
      }

      let bytes;
      try {
        bytes = await file.arrayBuffer();
      } catch {
        throw new Error(`Failed to read "${file.name}". Permission may have been revoked.`);
      }

      const enc = new TextEncoder();
      const contentHashBytes = await sha256Bytes(bytes);
      const contentHashHex = toHex(contentHashBytes).toLowerCase();

      const leafHashBytes = await sha256Bytes(
        new Uint8Array([...enc.encode("leaf\0"), ...contentHashBytes])
      );
      const leafHashHex = toHex(leafHashBytes).toLowerCase();

      // Quick filter by contentHash
      const matches = (json.leaves || []).filter(
        (l) => String(l.contentHash || "").toLowerCase() === contentHashHex
      );

      if (matches.length === 0) {
        setFileResult({ ok: false, reason: "No matching content hash exists in the JSON commitment." });
        setStatus("Done.");
        return;
      }

      // Verify proof using stored tree levels
      const levels = json.tree.levels.map((lvl) => lvl.map(hexToBytes));

      for (let idx = 0; idx < json.leaves.length; idx++) {
        const leaf = json.leaves[idx];
        if (String(leaf.contentHash || "").toLowerCase() !== contentHashHex) continue;
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
        reason: "Content matched, but proof could not be constructed to the stored root.",
      });
      setStatus("Done.");
    } catch (err) {
      setError(String(err?.message || err));
      setStatus("Idle.");
    }
  }

  function pickFile() {
    const el = document.getElementById("filePick");
    if (!el) return;
    el.value = "";
    el.click();
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>File Verification</h1>

      <div style={card}>
        <label style={buttonLike}>
          Upload merkle-tree.json
          <input type="file" hidden accept=".json,application/json" onChange={loadJson} />
        </label>

        {json && (
          <div style={{ marginTop: 14 }}>
            <div style={{ opacity: 0.75, marginBottom: 6 }}>Root:</div>
            <div style={mono}>{json.root}</div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={useJsonPolicy}
                onChange={(e) => setUseJsonPolicy(e.target.checked)}
              />
              Use JSON folderPolicy (recommended)
            </label>

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              If folder verification mismatches or yields 0 files, uncheck to debug.
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={button} onClick={pickFolderNoUpload} disabled={!json || !hasDirectoryPicker}>
            Folder (No Upload)
          </button>
          <button style={button} onClick={pickFolderUpload} disabled={!json}>
            Folder (Upload)
          </button>
        </div>

        <input
          id="folderPickUpload"
          type="file"
          multiple
          webkitdirectory=""   // ✅ IMPORTANT
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            verifyFolder(files, "Folder (Upload)");
          }}
        />

        {!hasDirectoryPicker && (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            Folder (No Upload) not supported in this browser — use Folder (Upload).
          </div>
        )}
      </div>

      <div style={card}>
        <button style={button} onClick={pickFile} disabled={!json}>
          Verify Single File
        </button>
        <input
          id="filePick"
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            verifyFile(f);
          }}
        />
      </div>

      {progress.total > 0 && (
        <div style={{ marginTop: 10, opacity: 0.9 }}>
          Progress: {progress.done}/{progress.total} ({pct}%)
        </div>
      )}

      {folderResult && (
        <div style={card}>
          <div style={{ fontSize: 16 }}>
            Folder: {folderResult.ok ? "MATCH ✅" : "MISMATCH ❌"}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.88, lineHeight: 1.6 }}>
            <div>
              Selected: <span style={monoInline}>{folderResult.selectedCount}</span>
            </div>
            <div>
              After filtering: <span style={monoInline}>{folderResult.filteredCount}</span>
            </div>
            <div>
              JSON leaf count: <span style={monoInline}>{folderResult.jsonLeafCount}</span>
            </div>
            <div>
              Source: <span style={monoInline}>{folderResult.sourceLabel}</span>
            </div>
            <div>
              Policy: <span style={monoInline}>{folderResult.usedPolicy ? "json.folderPolicy" : "no filtering"}</span>
            </div>

            {!folderResult.ok && (
              <>
                <div style={{ marginTop: 10 }}>Expected:</div>
                <div style={mono}>{folderResult.expected}</div>
                <div style={{ marginTop: 10 }}>Computed:</div>
                <div style={mono}>{folderResult.computed}</div>
              </>
            )}
          </div>
        </div>
      )}

      {fileResult && (
        <div style={card}>
          <div style={{ fontSize: 16 }}>
            File: {fileResult.ok ? "MATCH ✅" : "NOT FOUND ❌"}
          </div>
          {!fileResult.ok && fileResult.reason && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
              {fileResult.reason}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, opacity: 0.9 }}>Status: {status}</div>

      {error && (
        <div style={{ marginTop: 10, color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
          Error: {error}
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
};

const buttonLike = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 12,
  background: "#111",
  color: "white",
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
  userSelect: "none",
};

const mono = {
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