// src/components/FileVerification.jsx
import { useRef, useState } from "react";
import {
  applyPathPolicy,
  buildMerkleTreeFromLeafHashes,
  computeRootFromProof,
  defaultPolicy,
  hexToBytes,
  humanBytes,
  isHex256,
  isHiddenPath,
  listFilesFromDirectoryHandle,
  matchesIgnore,
  sha256Bytes,
  toHex,
} from "../lib/merkle.js";

export default function FileVerification({ limits }) {
  const jsonInputRef = useRef(null);
  const folderUploadRef = useRef(null);
  const fileInputRef = useRef(null);

  const hasDirectoryPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const [jsonObj, setJsonObj] = useState(null);
  const [status, setStatus] = useState("Idle.");
  const [error, setError] = useState("");

  const [folderCheck, setFolderCheck] = useState(null);
  const [fileCheck, setFileCheck] = useState(null);

  function resetResults() {
    setError("");
    setFolderCheck(null);
    setFileCheck(null);
    setStatus("Idle.");
  }

  async function onUploadJson(e) {
    resetResults();
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);

      if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON.");
      if (!parsed.schema || !String(parsed.schema).startsWith("merkle-")) throw new Error("Unsupported schema.");
      if (!isHex256(parsed.root)) throw new Error("Invalid root in JSON.");
      if (!Array.isArray(parsed.leaves) || parsed.leaves.length === 0) throw new Error("Invalid leaves array.");
      if (!parsed.tree?.levels || !Array.isArray(parsed.tree.levels) || parsed.tree.levels.length === 0) {
        throw new Error("Invalid tree.levels in JSON.");
      }
      if (!parsed.folderPolicy) parsed.folderPolicy = defaultPolicy();

      setJsonObj(parsed);
      setStatus("Loaded merkle-tree.json.");
    } catch (e2) {
      setError(String(e2?.message || e2));
    }
  }

  // ✅ BYTES-ONLY folder verification: recompute root from file bytes only
  async function verifyFolder(files, sourceLabel) {
    if (!jsonObj) return setError("Upload merkle-tree.json first.");

    resetResults();
    setStatus("Verifying folder (rehashing locally)…");

    try {
      const folderPolicy = jsonObj.folderPolicy;

      let cleaned = files
        .filter((x) => x?.file && typeof x.relativePath === "string")
        .map((x) => ({ ...x, relativePath: applyPathPolicy(x.relativePath, folderPolicy) }))
        .filter((x) => {
          const rel = x.relativePath;

          if (!folderPolicy.includeHidden && isHiddenPath(rel)) return false;

          if (folderPolicy.ignoreJunk) {
            const base = rel.split("/").pop() || rel;
            if ((folderPolicy.extraIgnoreNames || []).includes(base)) return false;
            if (matchesIgnore(rel, folderPolicy.ignorePatterns)) return false;
          }
          return true;
        });

      if (!cleaned.length) {
        setFolderCheck({
          ok: false,
          expectedRoot: jsonObj.root,
          computedRoot: "",
          details: "No files left after applying folderPolicy filters.",
        });
        setStatus("Done.");
        return;
      }

      // limits
      const totalBytes = cleaned.reduce((acc, x) => acc + (x.size || 0), 0);
      const biggest = Math.max(...cleaned.map((x) => x.size || 0));
      if (biggest > limits.maxFileBytes) {
        throw new Error(`Verification blocked: file exceeds per-file limit (${humanBytes(limits.maxFileBytes)}).`);
      }
      if (totalBytes > limits.maxTotalBytes) {
        throw new Error(`Verification blocked: folder exceeds total limit (${humanBytes(limits.maxTotalBytes)}).`);
      }

      // bytes-only: compute leafHash = SHA256("leaf\0" + contentHashBytes)
      const enc = new TextEncoder();
      const leafHashes = [];

      for (const item of cleaned) {
  let bytes;
  try {
    bytes = await item.file.arrayBuffer();
  } catch (err) {
    throw new Error(
      `Failed to read file during folder verification: "${item.relativePath}". ` +
        `The file may have been moved/renamed, deleted, or browser permission was revoked.`
    );
  }

  const contentHashBytes = await sha256Bytes(bytes);

  const leafHashBytes = await sha256Bytes(
    new Uint8Array([
      ...new TextEncoder().encode("leaf\0"),
      ...new TextEncoder().encode(item.relativePath),
      0,
      ...contentHashBytes,
    ])
  );

  leafHashes.push(leafHashBytes);
}

      // sort by leaf hash hex so order is deterministic
      const leafHex = leafHashes.map((b) => toHex(b));
      leafHex.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const sortedLeafBytes = leafHex.map((h) => hexToBytes(h));

      const { root } = await buildMerkleTreeFromLeafHashes(sortedLeafBytes);
      const computedRoot = toHex(root);
      const expectedRoot = jsonObj.root;

      const ok = computedRoot.toLowerCase() === expectedRoot.toLowerCase();

      setFolderCheck({
        ok,
        expectedRoot,
        computedRoot,
        details: ok ? `Match ✅ (${sourceLabel}).` : `Mismatch ❌ (${sourceLabel}).`,
      });

      setStatus("Done.");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  async function onPickFolderFs() {
    if (!jsonObj) return setError("Upload merkle-tree.json first.");
    if (!hasDirectoryPicker) return setError("Folder picker not supported in this browser. Use Folder (Upload).");

    try {
      resetResults();
      setStatus("Requesting folder permission…");
      const dir = await window.showDirectoryPicker();
      setStatus("Scanning folder…");
      const files = await listFilesFromDirectoryHandle(dir);
      await verifyFolder(files, "Folder (No Upload)");
    } catch (e) {
      if (e?.name === "AbortError") return;
      setError(String(e?.message || e));
      setStatus("Idle.");
    }
  }

  function onPickFolderUpload() {
    if (!jsonObj) return setError("Upload merkle-tree.json first.");
    folderUploadRef.current?.click();
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

    await verifyFolder(files, "Folder (Upload)");
  }

  // ✅ BYTES-ONLY single file membership
  async function onPickSingleFile(e) {
    if (!jsonObj) return setError("Upload merkle-tree.json first.");

    resetResults();
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    try {
      setStatus("Hashing file locally…");

      if (f.size > limits.maxFileBytes) {
        throw new Error(`File exceeds per-file limit (${humanBytes(limits.maxFileBytes)}).`);
      }

      const enc = new TextEncoder();

      // content hash
    let bytes;
try {
  bytes = await f.arrayBuffer();
} catch (err) {
  throw new Error(
    `Failed to read selected file: "${f.name}". ` +
      `The file may have been moved/renamed, deleted, or browser permission was revoked.`
  );
}

const contentHashBytes = await sha256Bytes(bytes);
const contentHashHex = toHex(contentHashBytes);

      // leaf hash (bytes-only)
      const leafHashBytes = await sha256Bytes(
        new Uint8Array([...enc.encode("leaf\0"), ...contentHashBytes])
      );
      const leafHashHex = toHex(leafHashBytes).toLowerCase();

      // find all indices with matching leafHash
      const matches = [];
      for (let i = 0; i < (jsonObj.leaves || []).length; i++) {
        const lh = String(jsonObj.leaves[i]?.leafHash || "").toLowerCase();
        if (lh === leafHashHex) matches.push(i);
      }

      if (matches.length === 0) {
        setFileCheck({
          ok: false,
          details: "Not found ❌ This file’s bytes are not included in the committed set.",
          matches: [],
          contentHash: contentHashHex,
        });
        setStatus("Done.");
        return;
      }

      // Optional: strong verification that at least one match truly leads to the root
      const levelsBytes = (jsonObj.tree.levels || []).map((lvl) => lvl.map((h) => hexToBytes(h)));

      let anyProofOk = false;
      for (const idx of matches) {
        const proof = buildProofFromLevelsBytes(levelsBytes, idx);
        const computedRootBytes = await computeRootFromProof(leafHashBytes, proof);
        const computedRootHex = toHex(computedRootBytes).toLowerCase();
        if (computedRootHex === String(jsonObj.root || "").toLowerCase()) {
          anyProofOk = true;
          break;
        }
      }

      setFileCheck({
        ok: anyProofOk,
        details: anyProofOk
          ? `Match ✅ File bytes are included in this Merkle commitment. (Occurrences: ${matches.length})`
          : `Found matching leaf hash, but proof-to-root did not validate. (This indicates a JSON/tree inconsistency.)`,
        matches: matches.map((i) => `leafIndex=${i}`),
        contentHash: contentHashHex,
      });

      setStatus("Done.");
    } catch (e2) {
      setError(String(e2?.message || e2));
      setStatus("Idle.");
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>File Verification</h1>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>1) Upload merkle-tree.json</h2>
        <button style={button} onClick={() => jsonInputRef.current?.click()}>
          Upload JSON
        </button>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={onUploadJson}
        />

        {jsonObj && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13 }}>
              <b>Root:</b>
            </div>
            <div style={mono}>{jsonObj.root}</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              <b>Files:</b> {jsonObj.summary?.fileCount}
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>2) Verify a folder</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button style={button} onClick={onPickFolderFs} disabled={!hasDirectoryPicker || !jsonObj}>
            Folder (No Upload)
          </button>
          <button style={button} onClick={onPickFolderUpload} disabled={!jsonObj}>
            Folder (Upload)
          </button>
        </div>

        <input
          ref={folderUploadRef}
          type="file"
          multiple
          webkitdirectory="true"
          directory="true"
          style={{ display: "none" }}
          onChange={onFolderUploadSelected}
        />

        {folderCheck && (
          <div style={{ marginTop: 12 }}>
            <div>
              <b>Result:</b> {folderCheck.ok ? "MATCH ✅" : "MISMATCH ❌"}
            </div>
            <div style={{ marginTop: 8 }}>{folderCheck.details}</div>

            <div style={{ marginTop: 10, fontSize: 13 }}>
              <b>Expected root:</b>
            </div>
            <div style={mono}>{folderCheck.expectedRoot}</div>

            <div style={{ marginTop: 10, fontSize: 13 }}>
              <b>Computed root:</b>
            </div>
            <div style={mono}>{folderCheck.computedRoot}</div>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ marginTop: 0 }}>3) Verify a single file</h2>
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          This checks whether the file’s <b>bytes</b> are included in the committed Merkle set (path/name ignored).
        </div>

        <button style={button} onClick={() => fileInputRef.current?.click()} disabled={!jsonObj}>
          Select file
        </button>
        <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onPickSingleFile} />

        {fileCheck && (
          <div style={{ marginTop: 12 }}>
            <div>
              <b>Result:</b> {fileCheck.ok ? "MATCH ✅" : "NOT FOUND ❌"}
            </div>
            <div style={{ marginTop: 8 }}>{fileCheck.details}</div>

            {fileCheck.contentHash && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <b>File SHA-256:</b>
                </div>
                <div style={mono}>{fileCheck.contentHash}</div>
              </div>
            )}

            {fileCheck.matches?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <b>Matches:</b>
                </div>
                <ul style={{ marginTop: 6 }}>
                  {fileCheck.matches.map((p) => (
                    <li key={p} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={card}>
        <b>Status:</b> {status}
        {error && (
          <div style={{ marginTop: 10 }}>
            <b>Error:</b> {error}
          </div>
        )}
      </div>
    </div>
  );
}

function buildProofFromLevelsBytes(levelsBytes, leafIndex) {
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

const card = { border: "1px solid #ddd", borderRadius: 12, padding: 12, marginTop: 14 };
const button = { padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white", cursor: "pointer" };
const mono = { marginTop: 6, padding: 10, border: "1px solid #ddd", borderRadius: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", wordBreak: "break-all" };