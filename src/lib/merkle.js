export function normalizeRelPath(p) {
  return String(p)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/");
}

export function isHiddenPath(relPath) {
  return normalizeRelPath(relPath)
    .split("/")
    .some((seg) => seg.startsWith("."));
}

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

export async function sha256Bytes(input) {
  const data = input instanceof ArrayBuffer
    ? input
    : input?.buffer?.slice(input.byteOffset, input.byteOffset + input.byteLength);

  if (!data) throw new Error("Invalid input");
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

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

export function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
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

export async function computeLeafHashBytes(contentHashBytes) {
  const enc = new TextEncoder();
  return sha256Bytes(concatBytes(enc.encode("leaf\0"), contentHashBytes));
}

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

export function isHex256(hex) {
  if (typeof hex !== "string") return false;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]{64}$/.test(clean);
}
