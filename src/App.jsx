import { useEffect, useMemo, useState } from "react";
import { humanBytes } from "./lib/merkle.js";
import OnChainTimestamping from "./components/OnChainTimestamping.jsx";

const DEFAULT_LIMITS = {
  maxTotalBytes: 500 * 1024 * 1024, // 500 MB
  maxFileBytes: 100 * 1024 * 1024, // 100 MB
};

export default function App() {
  const [tab, setTab] = useState("generator");
  const [limits, setLimits] = useState(DEFAULT_LIMITS);

  const [Cmp, setCmp] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      // On-Chain Timestamping doesn't need dynamic loading
      if (tab === "timestamping") {
        setLoading(false);
        setLoadErr("");
        setCmp(null);
        return;
      }

      setLoading(true);
      setLoadErr("");
      setCmp(null);

      try {
        const mod =
          tab === "generator"
            ? await import("./components/MerkleRootGenerator.jsx")
            : await import("./components/FileVerification.jsx");

        if (!alive) return;

        if (!mod?.default) {
          setLoadErr(`Loaded module but no default export. Export keys: ${Object.keys(mod || {}).join(", ")}`);
          return;
        }

        setCmp(() => mod.default);
      } catch (e) {
        if (!alive) return;
        setLoadErr(String(e?.stack || e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => (alive = false);
  }, [tab]);

  return (
    <div style={viewport}>
      <div style={shell}>
        <header style={header}>
          <div style={titleRow}>
            <h1 style={{ fontSize: 50, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Merkle Tool
            </h1>
            <div style={tagline}>Local-only · bytes-only commitments</div>
          </div>

          <nav style={tabBar} aria-label="Tabs">
            <div style={{ display: "flex", gap: 18 }}>
              <Tab label="Generator" active={tab === "generator"} onClick={() => setTab("generator")} />
              <Tab label="Verification" active={tab === "verify"} onClick={() => setTab("verify")} />
            </div>
            <Tab label="On-Chain Timestamping" active={tab === "timestamping"} onClick={() => setTab("timestamping")} />
          </nav>
        </header>

        {tab === "timestamping" ? (
          <OnChainTimestamping />
        ) : (
          <>
            <section style={card}>
              <div style={sectionTitle}>Limits</div>

              <div style={limitRow}>
                <LimitInput
                  label="Max folder size"
                  bytes={limits.maxTotalBytes}
                  onBytesChange={(b) => setLimits((l) => ({ ...l, maxTotalBytes: b }))}
                />
                <LimitInput
                  label="Max file size"
                  bytes={limits.maxFileBytes}
                  onBytesChange={(b) => setLimits((l) => ({ ...l, maxFileBytes: b }))}
                />
              </div>

              <div style={mutedSmall}>
                Total limit: <b>{humanBytes(limits.maxTotalBytes)}</b> · File limit: <b>{humanBytes(limits.maxFileBytes)}</b>
              </div>
            </section>

            <section style={card}>
              {loading && (
                <div style={loadingState}>
                  <div style={spinner}></div>
                  <div>Loading component...</div>
                </div>
              )}

              {!loading && loadErr && (
                <div style={errorState}>
                  <div style={{ fontSize: 18, marginBottom: 8 }}>Component Load Error</div>
                  <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 12 }}>
                    Failed to load the requested component. This might be due to a network issue or browser compatibility.
                  </div>
                  <details style={{ fontSize: 12 }}>
                    <summary style={{ cursor: "pointer", opacity: 0.7 }}>Technical details</summary>
                    <pre style={{ ...errorBox, marginTop: 8 }}>{loadErr}</pre>
                  </details>
                </div>
              )}

              {!loading && !loadErr && Cmp && <Cmp limits={limits} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- small helpers ---------- */

function Tab({ label, active, onClick }) {
  const isTimestampingTab = label === "On-Chain Timestamping";
  
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        ...tabBtn,
        ...(isTimestampingTab 
          ? (active ? tabBtnActivePurple : tabBtnPurple)
          : (active ? tabBtnActive : {})
        ),
      }}
    >
      {label}
    </button>
  );
}

function LimitInput({ label, bytes, onBytesChange }) {
  const [unit, setUnit] = useState(bytes >= 1024 ** 3 ? "GB" : "MB");

  const value = useMemo(() => {
    return unit === "GB" ? bytes / 1024 ** 3 : bytes / 1024 ** 2;
  }, [bytes, unit]);

  return (
    <label style={limitLabel}>
      <span style={muted}>{label}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="number"
          min={1}
          step="1"
          value={Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "1"}
          onChange={(e) => {
            const v = Math.max(1, Number(e.target.value || 1));
            const b = unit === "GB" ? v * 1024 ** 3 : v * 1024 ** 2;
            onBytesChange(b);
          }}
          style={input}
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={select}>
          <option value="MB">MB</option>
          <option value="GB">GB</option>
        </select>
      </div>
    </label>
  );
}


/* ---------- Styles (dark, centered) ---------- */

const viewport = {
  minHeight: "100vh",
  width: "100%",
  background: "#0f0f10",
  color: "#eaeaea",
  fontFamily:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  padding: "64px 16px",
};

// Add spinner animation
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

const shell = {
  width: "100%",
  maxWidth: 1180,
  margin: "0 auto",
  filter: "drop-shadow(0 20px 60px rgba(0,0,0,0.55))",
};

const header = {
  marginBottom: 18,
};

const titleRow = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const title = {
  margin: 0,
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: "-0.02em",
};

const tagline = {
  fontSize: 13,
  color: "#a7a7a7",
};

const tabBar = {
  marginTop: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  borderBottom: "1px solid #242424",
};

const tabBtn = {
  background: "transparent",
  border: "1px solid transparent",
  padding: "8px 10px",
  cursor: "pointer",
  color: "#a7a7a7",
  fontSize: 13,
  borderRadius: 10,
};

const tabBtnActive = {
  color: "#ffffff",
  border: "1px solid #3a3a3a",
  background: "rgba(255,255,255,0.02)",
};

const tabBtnPurple = {
  color: "#a78bfa",
  border: "1px solid rgba(102, 126, 234, 0.2)",
  background: "rgba(102, 126, 234, 0.08)",
};

const tabBtnActivePurple = {
  color: "#ffffff",
  border: "1px solid rgba(102, 126, 234, 0.4)",
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)",
  transform: "translateY(-1px)",
};

const card = {
  marginTop: 16,
  background: "linear-gradient(180deg, #151516 0%, #111112 100%)",
  border: "1px solid #242424",
  borderRadius: 14,
  padding: 16,
  boxShadow:
    "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.9fr) minmax(280px, 360px)",
  gap: 14,
  alignItems: "start",
};

const mainColumn = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const sideColumn = {
  position: "sticky",
  top: 24,
};

const sectionTitle = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#a7a7a7",
  marginBottom: 12,
};

const limitRow = {
  display: "flex",
  gap: 22,
  flexWrap: "wrap",
  alignItems: "flex-end",
};

const limitLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 260,
};

const input = {
  background: "#0f0f10",
  color: "#eaeaea",
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: "10px 12px",
  width: "100%",
  maxWidth: 140,
  outline: "none",
};

const select = {
  background: "#0f0f10",
  color: "#eaeaea",
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
};

const muted = {
  color: "#a7a7a7",
  fontSize: 13,
};

const mutedSmall = {
  marginTop: 10,
  color: "#a7a7a7",
  fontSize: 12,
};

const errorBox = {
  background: "#0f0f10",
  border: "1px solid #3a1f1f",
  borderRadius: 12,
  padding: 12,
  fontSize: 12,
  color: "#ffb4b4",
  overflowX: "auto",
  whiteSpace: "pre-wrap",
};

const loadingState = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 20px",
  gap: 16,
};

const spinner = {
  width: 24,
  height: 24,
  border: "2px solid rgba(255,255,255,0.1)",
  borderTop: "2px solid rgba(255,255,255,0.8)",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};

const errorState = {
  padding: 20,
  textAlign: "center",
  color: "#ffb4b4",
  background: "rgba(255, 116, 116, 0.05)",
  border: "1px solid rgba(255, 116, 116, 0.2)",
  borderRadius: 12,
};