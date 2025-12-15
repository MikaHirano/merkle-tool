import { useMemo, useState } from "react";
import {
  buildMerkleTreeFromLeafHashes,
  computeFileContentHashHex,
  humanBytes,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";

/**
 * Bytes-only Merkle commitment:
 * - contentHash = SHA256(fileBytes)
 * - leafHash    = SHA256("leaf\0" + contentHashBytes)
 * - nodes       = SHA256("node\0" + left + right)
 * - ordering    = leafHash hex asc
 */

const DEFAULT_POLICY = {
  includeHidden: false,
  ignoreJunk: true,

  // common junk (especially macOS)
  ignoreNames: [".DS_Store", "Thumbs.db", "desktop.ini"],
  ignorePrefixes: ["._"], // AppleDouble
  ignorePathPrefixes: [".git/", "node_modules/", ".Spotlight-V100/", ".Trashes/"],
};

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
function shouldIgnoreRelPath(relPath, policy) {
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

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={barTrack}>
        <div style={{ ...barFill, width: `${pct}%` }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        {done}/{total} files ({pct}%)
      </div>
    </div>
  );
}

export default function MerkleRootGenerator({ limits }) {
  const hasDir = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const hasOpen = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const [policy, setPolicy] = useState(DEFAULT_POLICY);

  const [status, setStatus] = useState("Idle.");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });

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

  function resetAll() {
    setError("");
    setStatus("Idle.");
    setProgress({ done: 0, total: 0 });

    setRoot("");
    setJson(null);

    setFileHash("");
    setFileName("");
    setFileSize(0);
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

    try {
      setStatus("Requesting folder permission…");
      const dir = await window.showDirectoryPicker();

      setStatus("Scanning folder…");
      const pairs = await listFilesFromDirectoryHandle(dir);

      // apply policy
      const filtered = pairs.filter((p) => !shouldIgnoreRelPath(p.relPath, policy));
      if (filtered.length === 0) throw new Error("No files left after applying Folder Policy.");

      // limits
      const totalBytes = filtered.reduce((a, p) => a + (p.file.size || 0), 0);
      const biggest = Math.max(...filtered.map((p) => p.file.size || 0));
      if (biggest > limits.maxFileBytes) {
        throw new Error(
          `A file exceeds max file size (${humanBytes(limits.maxFileBytes)}). Largest is ${humanBytes(biggest)}.`
        );
      }
      if (totalBytes > limits.maxTotalBytes) {
        throw new Error(
          `Folder exceeds max total size (${humanBytes(limits.maxTotalBytes)}). Total is ${humanBytes(totalBytes)}.`
        );
      }

      setStatus("Hashing files locally (SHA-256)…");
      setProgress({ done: 0, total: filtered.length });

      const enc = new TextEncoder();
      const leafHashes = [];
      const leaves = [];

      for (let i = 0; i < filtered.length; i++) {
        const { file } = filtered[i];

        let bytes;
        try {
          bytes = await file.arrayBuffer();
        } catch {
          throw new Error(`Failed to read "${file.name}". Permission may have been revoked or it moved.`);
        }

        const contentHashBytes = await sha256Bytes(bytes);
        const contentHashHex = toHex(contentHashBytes);

        const leafHashBytes = await sha256Bytes(
          new Uint8Array([...enc.encode("leaf\0"), ...contentHashBytes])
        );

        leafHashes.push(leafHashBytes);
        leaves.push({
          contentHash: contentHashHex,
          leafHash: toHex(leafHashBytes),
          size: file.size,
          lastModified: file.lastModified,
        });

        setProgress({ done: i + 1, total: filtered.length });
      }

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
        limits,
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
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  async function chooseFileAndHash() {
    resetAll();
    if (!hasOpen) return;

    try {
      setStatus("Choosing file…");
      const [handle] = await window.showOpenFilePicker({ multiple: false });
      const f = await handle.getFile();

      setStatus("Hashing file locally (SHA-256)…");
      setFileName(f.name);
      setFileSize(f.size);

      if (f.size > limits.maxFileBytes) {
        throw new Error(
          `File exceeds max file size (${humanBytes(limits.maxFileBytes)}). File is ${humanBytes(f.size)}.`
        );
      }

      const hex = await computeFileContentHashHex(f);
      setFileHash(hex);
      setStatus("Done.");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Merkle Root Generator</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={button} onClick={chooseFolderAndGenerate} disabled={!hasDir}>
            Folder → Merkle Tree
          </button>

          <button style={button} onClick={chooseFileAndHash} disabled={!hasOpen}>
            Single File → SHA-256
          </button>
        </div>

        {(!hasDir || !hasOpen) && (
          <div style={hint}>
            Your browser must support the File System Access API. Use Chrome/Brave/Edge on a secure context (https or localhost).
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Folder Policy</h2>

        <label style={row}>
          <input
            type="checkbox"
            checked={policy.includeHidden}
            onChange={(e) => setPolicy((p) => ({ ...p, includeHidden: e.target.checked }))}
          />
          Include hidden files/folders (names starting with ".")
        </label>

        <label style={row}>
          <input
            type="checkbox"
            checked={policy.ignoreJunk}
            onChange={(e) => setPolicy((p) => ({ ...p, ignoreJunk: e.target.checked }))}
          />
          Ignore junk/system files (recommended)
        </label>

        <div style={hint}>
          Ignored by default: <span style={monoInline}>.DS_Store</span>, <span style={monoInline}>._*</span>,{" "}
          <span style={monoInline}>.Spotlight-V100/</span>, <span style={monoInline}>.Trashes/</span>,{" "}
          <span style={monoInline}>.git/</span>, <span style={monoInline}>node_modules/</span>
        </div>
      </div>

      {progress.total > 0 && <ProgressBar done={progress.done} total={progress.total} />}

      {json && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Folder Result</h2>
          <div style={{ opacity: 0.8, marginBottom: 6 }}>Merkle root:</div>
          <div style={mono}>{root}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button style={button} onClick={downloadMerkleJson}>
              Download merkle-tree.json
            </button>
            <button style={button} onClick={() => navigator.clipboard.writeText(root)}>
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
            <button style={button} onClick={() => navigator.clipboard.writeText(fileHash)}>
              Copy hash
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ marginTop: 10, color: "#ff6b6b" }}>Error: {error}</div>}
      <div style={{ marginTop: 10, opacity: 0.9 }}>Status: {status}{progress.total ? ` · ${pct}%` : ""}</div>
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