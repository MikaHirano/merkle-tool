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

export async function readFileWithErrorHandling(file) {
  try {
    return await file.arrayBuffer();
  } catch (readError) {
    const errorMsg = readError?.name === 'NotAllowedError'
      ? `Permission denied reading "${file.name}". Please grant file access permission.`
      : readError?.name === 'NotFoundError'
      ? `File "${file.name}" not found or was moved/deleted.`
      : `Failed to read "${file.name}": ${readError?.message || 'Unknown error'}`;
    throw new Error(errorMsg);
  }
}
