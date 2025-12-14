// src/lib/merkle.js
// Canonical helpers for folder hashing + Merkle tree + verification.

export function normalizeRelPath(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

export function applyPathPolicy(path, policy) {
  let p = normalizeRelPath(path);

  if (policy?.unicodeNFC && typeof p.normalize === "function") {
    p = p.normalize("NFC");
  }
  if (policy?.caseFold === "lower") {
    p = p.toLowerCase();
  }
  return p;
}

export function isHiddenPath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((seg) => seg.startsWith("."));
}

export function stripFirstPathSegment(path) {
  const p = normalizeRelPath(path);
  const parts = p.split("/");
  if (parts.length <= 1) return p;
  return parts.slice(1).join("/");
}

// Simple glob-ish matching:
// - "node_modules/**" prefix folder
// - ".git/**" prefix folder
// - "*.tmp" suffix ext
// - "**/file.ext" tail match
// - exact path match
export function matchesIgnore(relPath, patterns) {
  const p = normalizeRelPath(relPath);
  for (const pat of patterns || []) {
    const pattern = String(pat).trim();
    if (!pattern) continue;

    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (p === prefix || p.startsWith(prefix + "/")) return true;
      continue;
    }

    if (pattern.startsWith("**/")) {
      const tail = pattern.slice(3);
      if (p === tail || p.endsWith("/" + tail)) return true;
      continue;
    }

    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1); // ".tmp"
      if (p.endsWith(ext)) return true;
      continue;
    }

    if (p === pattern) return true;
  }
  return false;
}

export async function listFilesFromDirectoryHandle(dirHandle) {
  const out = [];

  async function walk(handle, prefix) {
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "file") {
        const file = await entry.getFile();
        out.push({
          relativePath: normalizeRelPath(rel),
          file,
          size: file.size,
          lastModified: file.lastModified,
        });
      } else if (entry.kind === "directory") {
        await walk(entry, rel);
      }
    }
  }

  await walk(dirHandle, "");
  return out;
}

export async function sha256Bytes(input) {
  const data =
    input instanceof ArrayBuffer
      ? input
      : input?.buffer?.slice(input.byteOffset, input.byteOffset + input.byteLength);

  if (!data) throw new Error("sha256Bytes: invalid input");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

export function concatBytes(...parts) {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function toHex(bytes) {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

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

export async function computeFileContentHashHex(file) {
  const bytes = await file.arrayBuffer();
  const digest = await sha256Bytes(bytes);
  return toHex(digest);
}

export async function computeLeafHashBytes(path, contentHashBytes) {
  const enc = new TextEncoder();
  return sha256Bytes(
    concatBytes(enc.encode("leaf\0"), enc.encode(path), new Uint8Array([0]), contentHashBytes)
  );
}

export async function buildMerkleTreeFromLeafHashes(leafHashesBytes) {
  if (!Array.isArray(leafHashesBytes) || leafHashesBytes.length === 0) {
    throw new Error("Cannot build Merkle tree with 0 leaves.");
  }

  const levels = [];
  levels.push(leafHashesBytes.map((h) => (h instanceof Uint8Array ? h : new Uint8Array(h))));

  const enc = new TextEncoder();
  const nodePrefix = enc.encode("node\0");

  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];

    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] || prev[i]; // duplicate last if odd
      const node = await sha256Bytes(concatBytes(nodePrefix, left, right));
      next.push(node);
    }

    levels.push(next);
  }

  return { root: levels[levels.length - 1][0], levels };
}

// Optional helper (nice for debugging / future use)
export function buildProofFromLevels(levelsBytes, leafIndex) {
  const proof = [];
  let idx = leafIndex;

  for (let level = 0; level < levelsBytes.length - 1; level++) {
    const nodes = levelsBytes[level];
    const isRightNode = idx % 2 === 1;
    const siblingIndex = isRightNode ? idx - 1 : idx + 1;
    const sibling = nodes[siblingIndex] || nodes[idx]; // duplicate last if needed

    proof.push({
      position: isRightNode ? "left" : "right",
      hash: toHex(sibling),
    });

    idx = Math.floor(idx / 2);
  }

  return proof;
}

export async function computeRootFromProof(leafHashBytes, proofSteps) {
  const enc = new TextEncoder();
  const nodePrefix = enc.encode("node\0");

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

export function isHex256(hex) {
  if (typeof hex !== "string") return false;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

export function defaultPolicy() {
  return {
    includeHidden: false,
    ignoreJunk: true,
    unicodeNFC: true,
    caseFold: "none", // "none" | "lower"
    ignorePatterns: ["node_modules/**", ".git/**"],
    extraIgnoreNames: [".DS_Store", "Thumbs.db"],
  };
}