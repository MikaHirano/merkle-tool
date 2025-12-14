// src/components/MerkleRootGenerator.jsx
import { useMemo, useRef, useState } from "react";
import {
  applyPathPolicy,
  buildMerkleTreeFromLeafHashes,
  computeFileContentHashHex,
  concatBytes,
  defaultPolicy,
  hexToBytes,
  humanBytes,
  isHiddenPath,
  listFilesFromDirectoryHandle,
  matchesIgnore,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";

const MODES = [
  { id: "folder_fs", label: "Folder (No Upload)" },
  { id: "folder_upload", label: "Folder (Upload)" },
  { id: "file_fs", label: "File (No Upload)" },
  { id: "file_upload", label: "File (Upload)" },
];

export default function MerkleRootGenerator({ limits }) {
  const folderUploadRef = useRef(null);
  const fileUploadRef = useRef(null);

  const hasDirectoryPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const hasOpenFilePicker = typeof window !== "undefined" && "showOpenFilePicker" in window;

  const [mode, setMode] = useState("folder_fs");
  const [policy, setPolicy] = useState(defaultPolicy());

  const [status, setStatus] = useState("Idle.");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  // Folder outputs (JSON)
  const [folderRoot, setFolderRoot] = useState("");
  const [folderJson, setFolderJson] = useState(null);

  // File outputs (SHA-256 only)
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [fileHash, setFileHash] = useState("");

  const progressPct = useMemo(() => {
    if (!progress.total) return 0;
    return Math.round((progress.done / progress.total) * 100);
  }, [progress]);

  function resetAll() {
    setError("");
    setStatus("Idle.");
    setProgress({ done: 0, total: 0 });
    setFolderRoot("");
    setFolderJson(null);
    setFileName("");
    setFileSize(0);
    setFileHash("");
  }

  function downloadMerkleJson() {
    if (!folderJson) return;
    const blob = new Blob([JSON.stringify(folderJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merkle-tree.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleGo() {
    resetAll();

    try {
      if (mode === "folder_fs") {
        if (!hasDirectoryPicker) throw new Error("Folder (No Upload) is not supported in this browser.");
        const dir = await window.showDirectoryPicker();
        const files = await listFilesFromDirectoryHandle(dir);
        await generateFolderJson(files, "File System Access API");
        return;
      }

      if (mode === "folder_upload") {
        folderUploadRef.current?.click();
        return;
      }

      if (mode === "file_fs") {
        if (!hasOpenFilePicker) throw new Error("File (No Upload) is not supported in this browser.");
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        const f = await handle.getFile();
        await hashSingleFile(f);
        return;
      }

      if (mode === "file_upload") {
        fileUploadRef.current?.click();
        return;
      }
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  async function onFolderUploadSelected(e) {
    const fileList = Array.from(e.target.files || []);
    e.target.value = "";
    if (!fileList.length) return;

    const files = fileList.map((f) => ({
      relativePath: (f.webkitRelativePath || f.name).replace(/\\/g, "/"),
      file: f,
      size: f.size,
      lastModified: f.lastModified,
    }));

    await generateFolderJson(files, "webkitdirectory fallback");
  }

  async function onFileUploadSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await hashSingleFile(f);
  }

  async function hashSingleFile(file) {
    setStatus("Hashing file locally (SHA-256)...");
    setFileName(file.name);
    setFileSize(file.size);

    if (file.size > limits.maxFileBytes) {
      throw new Error(
        `File exceeds per-file limit (${humanBytes(limits.maxFileBytes)}). File is ${humanBytes(file.size)}.`
      );
    }

    const hex = await computeFileContentHashHex(file);
    setFileHash(hex);
    setStatus("Done.");
  }

  // ✅ BYTES-ONLY folder commitment
  async function generateFolderJson(files, sourceLabel) {
    setError("");
    setStatus("Preparing file list...");

    // Policy still controls which files are included/excluded,
    // but the *commitment* is bytes-only (no paths in leaf hash).
    let cleaned = files
      .filter((x) => x?.file && typeof x.relativePath === "string")
      .map((x) => ({ ...x, relativePath: applyPathPolicy(x.relativePath, policy) }))
      .filter((x) => {
        const rel = x.relativePath;

        if (!policy.includeHidden && isHiddenPath(rel)) return false;

        if (policy.ignoreJunk) {
          const base = rel.split("/").pop() || rel;
          if ((policy.extraIgnoreNames || []).includes(base)) return false;
          if (matchesIgnore(rel, policy.ignorePatterns)) return false;
        }
        return true;
      });

    if (!cleaned.length) throw new Error("No files found after applying Folder Policy filters.");

    // limits
    const totalBytes = cleaned.reduce((acc, x) => acc + (x.size || 0), 0);
    const biggest = Math.max(...cleaned.map((x) => x.size || 0));
    if (biggest > limits.maxFileBytes) {
      throw new Error(
        `At least one file exceeds per-file limit (${humanBytes(limits.maxFileBytes)}). Largest: ${humanBytes(biggest)}.`
      );
    }
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error(
        `Folder exceeds total limit (${humanBytes(limits.maxTotalBytes)}). Total: ${humanBytes(totalBytes)}.`
      );
    }

    setProgress({ done: 0, total: cleaned.length });
    setStatus("Hashing files locally (SHA-256)...");

    const leaves = [];
    const enc = new TextEncoder();

    for (let i = 0; i < cleaned.length; i++) {
      const { file, relativePath, size, lastModified } = cleaned[i];

      let bytes;
try {
  bytes = await file.arrayBuffer();
} catch {
  throw new Error(
    `Failed to read file: "${relativePath}". ` +
    `The file may have been moved, renamed, or permission was lost.`
  );
}
const contentHashBytes = await sha256Bytes(bytes);
      const contentHashHex = toHex(contentHashBytes);

      // ✅ leafHash commits to bytes only
      const leafHashBytes = await sha256Bytes(
        concatBytes(enc.encode("leaf\0"), contentHashBytes)
      );

      leaves.push({
        // Keep path as metadata only (NOT committed)
        path: relativePath,
        size,
        lastModified,
        contentHash: contentHashHex,
        leafHash: toHex(leafHashBytes),
      });

      setProgress({ done: i + 1, total: cleaned.length });
    }

    // ✅ Canonical order (bytes-only): sort by leafHash
leaves.sort((a, b) => (a.leafHash < b.leafHash ? -1 : a.leafHash > b.leafHash ? 1 : 0));

    setStatus("Building Merkle tree...");
    const leafBytes = leaves.map((l) => hexToBytes(l.leafHash));
    const { root, levels } = await buildMerkleTreeFromLeafHashes(leafBytes);
    const rootHex = toHex(root);

    const json = {
      schema: "merkle-bytes-tree@1",
      generatedAt: new Date().toISOString(),
      environment: { userAgent: navigator.userAgent, source: sourceLabel },
      algorithm: "SHA-256",
      canonicalization: {
        leaf: `SHA256("leaf\\0" + contentHashBytes)  // bytes-only`,
        node: `SHA256("node\\0" + leftHashBytes + rightHashBytes)`,
        sortLeavesBy: "leafHash (hex asc)",
        oddNodeRule: "duplicate_last",
      },
      folderPolicy: policy,
      limits,
      summary: {
        fileCount: leaves.length,
        totalBytes,
        totalBytesHuman: humanBytes(totalBytes),
      },
      root: rootHex,
      tree: { levels: levels.map((lvl) => lvl.map((h) => toHex(h))) },
      leaves,
    };

    setFolderRoot(rootHex);
    setFolderJson(json);
    setStatus("Done.");
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Merkle Root Generator</h1>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Method</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={select}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            style={button}
            onClick={handleGo}
            disabled={(mode === "folder_fs" && !hasDirectoryPicker) || (mode === "file_fs" && !hasOpenFilePicker)}
          >
            Choose…
          </button>

          <input
            ref={folderUploadRef}
            type="file"
            multiple
            webkitdirectory="true"
            directory="true"
            style={{ display: "none" }}
            onChange={onFolderUploadSelected}
          />
          <input
            ref={fileUploadRef}
            type="file"
            style={{ display: "none" }}
            onChange={onFileUploadSelected}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          <b>Note:</b> Folder JSON commits to <b>file bytes only</b> (paths are metadata and do not affect the root).
        </div>
      </div>

      {(mode === "folder_fs" || mode === "folder_upload") && (
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
            Ignore junk files & patterns (recommended)
          </label>

          <label style={row}>
            <input
              type="checkbox"
              checked={policy.unicodeNFC}
              onChange={(e) => setPolicy((p) => ({ ...p, unicodeNFC: e.target.checked }))}
            />
            Normalize Unicode paths to NFC (recommended)
          </label>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Ignore patterns (one per line)</div>
            <textarea
              value={(policy.ignorePatterns || []).join("\n")}
              onChange={(e) =>
                setPolicy((p) => ({
                  ...p,
                  ignorePatterns: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                }))
              }
              rows={5}
              style={textarea}
            />
          </div>
        </div>
      )}

      <div style={card}>
        <div>
          <b>Status:</b> {status}
        </div>

        {progress.total > 0 && (
          <div style={{ marginTop: 8 }}>
            <b>Progress:</b> {progress.done}/{progress.total} ({progressPct}%)
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10 }}>
            <b>Error:</b> {error}
          </div>
        )}
      </div>

      {folderJson && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Folder Result</h2>
          <div>
            <b>Merkle root:</b>
          </div>
          <div style={mono}>{folderRoot}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button style={button} onClick={downloadMerkleJson}>
              Download merkle-tree.json
            </button>
            <button style={button} onClick={() => navigator.clipboard.writeText(folderRoot)}>
              Copy root
            </button>
          </div>

          <details style={{ marginTop: 10 }}>
            <summary>Preview JSON</summary>
            <pre style={pre}>{JSON.stringify(folderJson, null, 2)}</pre>
          </details>
        </div>
      )}

      {fileHash && (
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>File Result</h2>
          <div>
            <b>File:</b> {fileName} ({humanBytes(fileSize)})
          </div>
          <div style={{ marginTop: 8 }}>
            <b>SHA-256:</b>
          </div>
          <div style={mono}>{fileHash}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button style={button} onClick={() => navigator.clipboard.writeText(fileHash)}>
              Copy hash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const card = { border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 14 };
const button = { padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", cursor: "pointer" };
const select = { padding: "10px 12px", borderRadius: 10, border: "1px solid #ccc", minWidth: 220 };
const row = { display: "flex", gap: 10, alignItems: "center", marginTop: 8 };
const textarea = { width: "100%", boxSizing: "border-box", maxWidth: "100%", borderRadius: 10, border: "1px solid #2a2a2a", padding: 10, background: "#0f0f10", color: "#eaeaea", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, outline: "none", resize: "vertical" };
const mono = { marginTop: 6, padding: 10, border: "1px solid #ddd", borderRadius: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", wordBreak: "break-all" };
const pre = { marginTop: 10, padding: 10, border: "1px solid #ddd", borderRadius: 10, overflowX: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 };