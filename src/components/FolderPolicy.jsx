import { DEFAULT_FOLDER_POLICY } from "../lib/constants.js";

/**
 * Reusable Folder Policy component
 * Displays policy settings with source indicator and override capability
 * 
 * @param {Object} props
 * @param {Object} props.policy - Policy object with includeHidden, ignoreJunk, etc.
 * @param {Function} props.onChange - Callback when policy changes
 * @param {"json" | "manual" | "default"} props.source - Policy source
 * @param {boolean} props.editable - Whether policy can be edited (default: true)
 * @param {boolean} props.showSource - Whether to show source indicator (default: true)
 * @param {boolean} props.override - Whether override is enabled (for JSON source)
 * @param {Function} props.onOverrideChange - Callback when override toggle changes
 */
export default function FolderPolicy({
  policy,
  onChange,
  source = "manual",
  editable = true,
  showSource = true,
  override = false,
  onOverrideChange,
}) {
  const isEditable = editable && (source !== "json" || override);

  const sourceLabels = {
    json: "From JSON file",
    manual: "Manually configured",
    default: "Default",
  };

  const sourceColors = {
    json: { bg: "rgba(59, 130, 246, 0.1)", border: "rgba(59, 130, 246, 0.3)", text: "#3b82f6" },
    manual: { bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", text: "#6b7280" },
    default: { bg: "rgba(107, 114, 128, 0.05)", border: "rgba(107, 114, 128, 0.2)", text: "#9ca3af" },
  };

  const sourceStyle = sourceColors[source] || sourceColors.default;
  const displaySource = override && source === "json" ? "Overridden" : sourceLabels[source];

  const card = {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  };

  const header = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  };

  const title = {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
    color: "#ffffff",
  };

  const badgeContainer = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  };

  const badge = {
    fontSize: 11,
    padding: "4px 8px",
    borderRadius: 4,
    background: sourceStyle.bg,
    border: `1px solid ${sourceStyle.border}`,
    color: sourceStyle.text,
    fontWeight: 500,
  };

  const overrideToggle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: 11,
    color: "#9ca3af",
  };

  const row = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    cursor: isEditable ? "pointer" : "default",
    opacity: isEditable ? 1 : 0.7,
  };

  const hint = {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 8,
    lineHeight: 1.5,
  };

  const monoInline = {
    fontFamily: "monospace",
    fontSize: "0.9em",
    background: "rgba(255, 255, 255, 0.05)",
    padding: "2px 4px",
    borderRadius: 3,
  };

  return (
    <div style={card}>
      <div style={header}>
        <h2 style={title}>Folder Policy</h2>
        {showSource && (
          <div style={badgeContainer}>
            <span style={badge}>{displaySource}</span>
            {source === "json" && onOverrideChange && (
              <label style={overrideToggle}>
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => onOverrideChange(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                <span>Override</span>
              </label>
            )}
          </div>
        )}
      </div>

      <label style={row}>
        <input
          type="checkbox"
          checked={policy.includeHidden || false}
          onChange={(e) => onChange({ ...policy, includeHidden: e.target.checked })}
          disabled={!isEditable}
          style={{ cursor: isEditable ? "pointer" : "not-allowed" }}
        />
        <span>Include hidden files/folders (names starting with ".")</span>
      </label>

      <label style={row}>
        <input
          type="checkbox"
          checked={policy.ignoreJunk !== undefined ? policy.ignoreJunk : true}
          onChange={(e) => onChange({ ...policy, ignoreJunk: e.target.checked })}
          disabled={!isEditable}
          style={{ cursor: isEditable ? "pointer" : "not-allowed" }}
        />
        <span>Ignore junk/system files (recommended)</span>
      </label>

      <div style={hint}>
        Ignored by default: <span style={monoInline}>.DS_Store</span>, <span style={monoInline}>._*</span>,{" "}
        <span style={monoInline}>.Spotlight-V100/</span>, <span style={monoInline}>.Trashes/</span>,{" "}
        <span style={monoInline}>.git/</span>, <span style={monoInline}>node_modules/</span>
      </div>
    </div>
  );
}

