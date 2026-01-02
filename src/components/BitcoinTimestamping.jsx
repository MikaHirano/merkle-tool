import { useState, useEffect, useRef } from "react";
import { stampHash, downloadOtsFile, getTimestampStatus, checkBackendHealth } from "../lib/opentimestamps.js";
import { checkMempoolStatus, getMempoolTxUrl, getMempoolBlockUrl } from "../lib/mempool.js";
import { normalizeMerkleRoot, isValidMerkleRootFormat, validateJSON } from "../lib/validation.js";
import { getErrorMessage, logError } from "../lib/errorHandler.js";
import { SCHEMA_VERSIONS, NETWORK_IDS } from "../lib/constants.js";

// Ensure spin animation is available
if (typeof document !== "undefined") {
  const styleId = "bitcoin-timestamping-spinner";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * BitcoinTimestamping component
 * Handles creating Bitcoin timestamps via OpenTimestamps protocol
 * @param {Object} props - Component props
 * @param {string} props.merkleRoot - Initial Merkle root (optional, component manages its own state)
 * @param {Object} props.jsonData - Initial JSON data (optional)
 */
export default function BitcoinTimestamping({ merkleRoot: initialMerkleRoot = "", jsonData: initialJsonData = null }) {
  // Internal state for Merkle root and file handling
  const [merkleRoot, setMerkleRoot] = useState(initialMerkleRoot);
  const [jsonData, setJsonData] = useState(initialJsonData);
  const [fileName, setFileName] = useState("");
  
  const [stamping, setStamping] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [checkingManually, setCheckingManually] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [otsFile, setOtsFile] = useState(null);
  const [error, setError] = useState(null);
  const [blockInfo, setBlockInfo] = useState(null);
  const [upgradePollInterval, setUpgradePollInterval] = useState(null);
  const upgradePollRef = useRef(null);
  const statusRef = useRef('idle'); // Ref to track status for polling interval calculation
  
  // Enhanced status tracking
  const [status, setStatus] = useState('idle'); // 'idle' | 'stamping' | 'pending' | 'anchored' | 'confirmed'
  const [statusMessage, setStatusMessage] = useState('');
  const [transactionHash, setTransactionHash] = useState(null);
  const [mempoolStatus, setMempoolStatus] = useState(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(null);
  const [submissionServers, setSubmissionServers] = useState(null); // Track parallel submission results
  const [submissionTime, setSubmissionTime] = useState(null); // Track when timestamp was submitted
  const [calendarServerTip, setCalendarServerTip] = useState(null); // Track calendar server tip (last transaction)
  
  // Update status ref when status changes
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (upgradePollRef.current) {
        clearInterval(upgradePollRef.current);
      }
    };
  }, []);

  /**
   * Handle Merkle root input change
   * @param {string} value - Input value
   */
  const handleRootChange = (value) => {
    const normalized = normalizeMerkleRoot(value);
    setMerkleRoot(normalized);
    setError("");
  };

  /**
   * Handle file selection and parsing
   * @param {Event} e - File input change event
   */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const validation = validateJSON(text);
      
      if (!validation.valid) {
        throw new Error(`Invalid JSON file: ${validation.error}`);
      }
      
      const parsed = validation.parsed;
      
      // Validate schema if present
      if (parsed.schema && !parsed.schema.startsWith("merkle-")) {
        throw new Error(`Unsupported schema: ${parsed.schema}. Expected merkle-* schema.`);
      }
      
      // Try to find root in common locations
      const root = parsed.root || parsed.merkleRoot || parsed.merkle_root;
      
      if (!root) {
        throw new Error("No root found in JSON. Expected 'root' or 'merkleRoot' field.");
      }

      // Validate root format
      if (!isValidMerkleRootFormat(root)) {
        const rootStr = String(root);
        throw new Error(
          `Invalid root format in JSON. Expected 64 hex characters (with or without 0x prefix), got ${rootStr.length} characters. ` +
          `Root value: ${rootStr.slice(0, 20)}...`
        );
      }

      // Normalize root
      const normalizedRoot = normalizeMerkleRoot(root);
      
      setMerkleRoot(normalizedRoot);
      setJsonData(parsed);
      setFileName(file.name);
      setError("");
    } catch (err) {
      logError(err, "BitcoinTimestamping.handleFileChange");
      setError(getErrorMessage(err));
      setJsonData(null);
      setFileName("");
    } finally {
      e.target.value = "";
    }
  };

  /**
   * Format elapsed time in human-readable format
   * @param {number} milliseconds - Elapsed time in milliseconds
   * @returns {string} Formatted time string
   */
  const formatElapsedTime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
  };


  /**
   * Handle creating initial timestamp stamp
   */
  const handleStamp = async () => {
    if (!merkleRoot || !isValidMerkleRootFormat(merkleRoot)) {
      setError("Invalid Merkle root");
      return;
    }

    setStamping(true);
    setError(null);
    setStamped(false);
    setUpgraded(false);
    setOtsFile(null);
    setBlockInfo(null);
    setStatus('stamping');
    statusRef.current = 'stamping';
    setStatusMessage('Submitting to multiple calendar servers in parallel...');
    setTransactionHash(null);
    setMempoolStatus(null);
    setEstimatedTimeRemaining(null);
    setSubmissionServers(null);

    try {
      const normalizedRoot = normalizeMerkleRoot(merkleRoot);
      
      const result = await stampHash(normalizedRoot);
      
      setOtsFile(result.otsFile);
      setStamped(true);
      setStamping(false);
      setSubmissionTime(Date.now()); // Track submission time

      setStatus('stamped');
      statusRef.current = 'stamped';
      
      // Track submission results for UI display
      if (result.servers) {
        setSubmissionServers(result.servers);
        const successCount = result.servers.filter(s => s.success).length;
        const totalCount = result.servers.length;
        setStatusMessage(`Submitted to ${successCount} of ${totalCount} calendar servers. Waiting for batching...`);
      } else {
        setStatusMessage('Submitted to OpenTimestamps calendar server. Waiting for batching...');
      }

      // Start polling for status updates after a short delay
      setTimeout(() => {
        startStatusPolling(result.otsFile);
      }, 5000); // Wait 5 seconds before first status check
    } catch (err) {
      logError(err, "BitcoinTimestamping.handleStamp");
      
      // Check if error is related to OTS proof validation
      const errorMessage = err.message || '';
      let userMessage = getErrorMessage(err);
      
      if (errorMessage.includes('Invalid OTS proof') || errorMessage.includes('magic bytes')) {
        userMessage = 'Calendar server returned invalid response. Please try again or use a different calendar server.';
        console.error('[BitcoinTimestamping] OTS proof validation failed:', errorMessage);
      } else if (errorMessage.includes('digest bytes instead of OTS proof')) {
        userMessage = 'Internal error: Invalid data format received from calendar server. Please try again.';
        console.error('[BitcoinTimestamping] Critical error: Received digest bytes instead of OTS proof!');
      }
      
      setError(userMessage);
      setStamping(false);
      setStatus('idle');
      statusRef.current = 'idle';
      setStatusMessage('');
    }
  };

  /**
   * Start polling calendar server for status updates
   * @param {Uint8Array} currentOtsFile - Current OTS file to check
   */
  const startStatusPolling = (currentOtsFile) => {
    // Clear any existing polling
    if (upgradePollRef.current) {
      clearTimeout(upgradePollRef.current);
      upgradePollRef.current = null;
    }

    // Determine polling interval based on current status
    const getPollInterval = () => {
      switch (statusRef.current) {
        case 'stamped':
        case 'batched':
          return 15000; // 15 seconds - checking for batching/submission
        case 'submitted':
        case 'in_mempool':
          return 10000; // 10 seconds - checking mempool
        default:
          return 30000; // 30 seconds - default
      }
    };

    // Poll with dynamic interval
    const poll = async () => {
      if (upgraded) {
        // Stop polling if upgraded
        if (upgradePollRef.current) {
          clearTimeout(upgradePollRef.current);
          upgradePollRef.current = null;
        }
        return;
      }
      
      await checkStatus(currentOtsFile);
      
      // Schedule next poll with updated interval based on current status
      if (!upgraded && upgradePollRef.current !== null) {
        const interval = getPollInterval();
        upgradePollRef.current = setTimeout(() => {
          poll();
        }, interval);
      }
    };

    // Check immediately, then start polling
    checkStatus(currentOtsFile).then(() => {
      if (!upgraded) {
        const interval = getPollInterval();
        upgradePollRef.current = setTimeout(() => {
          poll();
        }, interval);
        setUpgradePollInterval(upgradePollRef.current);
      }
    });
  };

  /**
   * Check timestamp status and update accordingly
   * @param {Uint8Array} currentOtsFile - Current OTS file to check
   * @param {boolean} showSpinner - Whether to show loading spinner (default: true)
   */
  const checkStatus = async (currentOtsFile, showSpinner = true) => {
    if (upgraded) {
      // Already upgraded, stop polling
      if (upgradePollRef.current) {
        clearTimeout(upgradePollRef.current);
        upgradePollRef.current = null;
      }
      return;
    }

    if (showSpinner) {
      setUpgrading(true);
    }
    setError(null);

    try {
      // Check backend health first
      const backendAvailable = await checkBackendHealth();
      if (!backendAvailable) {
        setError('Backend server is unavailable. Please ensure the backend is running on port 3001.');
        setStatus('error');
        statusRef.current = 'error';
        // Pause polling temporarily - will retry on next manual check or component remount
        if (upgradePollRef.current) {
          clearTimeout(upgradePollRef.current);
          upgradePollRef.current = null;
        }
        return;
      }
      
      // Get detailed status from calendar server
      const statusResult = await getTimestampStatus(currentOtsFile);
      
      // Handle backend_unavailable status from getTimestampStatus
      if (statusResult.status === 'backend_unavailable') {
        setError('Backend server is unavailable. Please ensure the backend is running on port 3001.');
        setStatus('error');
        statusRef.current = 'error';
        // Pause polling
        if (upgradePollRef.current) {
          clearTimeout(upgradePollRef.current);
          upgradePollRef.current = null;
        }
        return;
      }
      
      // Update calendar server tip if available
      if (statusResult.txHash && !statusResult.upgraded) {
        setCalendarServerTip({
          txHash: statusResult.txHash,
          blockHeight: statusResult.blockHeight,
        });
      }
      
      // Update OTS file if we got a newer/updated version
      if (statusResult.otsFile) {
        const currentSize = currentOtsFile.length;
        const newSize = statusResult.otsFile.length;
        // Update if different size (might be upgraded) or if content is different
        if (newSize !== currentSize) {
          console.log(`[OpenTimestamps] Received updated OTS file (${currentSize} -> ${newSize} bytes), updating...`);
          setOtsFile(statusResult.otsFile);
          // If significantly larger, might be upgraded
          if (newSize > currentSize + 50) {
            console.log(`[OpenTimestamps] OTS file size increased significantly, might be upgraded - check manually`);
          }
        } else {
          // Same size but might have different content - update anyway to get latest
          setOtsFile(statusResult.otsFile);
        }
      }

      // Update status based on result
      if (statusResult.upgraded) {
        // Confirmed!
        setOtsFile(statusResult.otsFile || currentOtsFile);
        setUpgraded(true);
        setStatus('confirmed');
        statusRef.current = 'confirmed';
        setStatusMessage('✓ Successfully timestamped on Bitcoin!');
        if (statusResult.blockInfo) {
          setBlockInfo(statusResult.blockInfo);
        }
        
        // Stop polling
        if (upgradePollRef.current) {
          clearTimeout(upgradePollRef.current);
          upgradePollRef.current = null;
        }
        setUpgradePollInterval(null);
        return;
      }

      // Update status based on calendar server response
      const newStatus = statusResult.status || 'pending';
      setStatus(newStatus);
      statusRef.current = newStatus; // Update ref immediately for polling interval calculation
      
      // Update transaction hash if available
      if (statusResult.txHash) {
        setTransactionHash(statusResult.txHash);
        
        // Check mempool status if we have a transaction hash
        if (newStatus === 'submitted' || newStatus === 'in_mempool') {
          const mempoolResult = await checkMempoolStatus(statusResult.txHash);
          setMempoolStatus(mempoolResult);
          
          if (mempoolResult.inMempool) {
            if (mempoolResult.confirmed) {
              setStatus('confirmed');
              statusRef.current = 'confirmed';
              setStatusMessage('✓ Successfully timestamped on Bitcoin!');
              setUpgraded(true);
              // Stop polling
              if (upgradePollRef.current) {
                clearTimeout(upgradePollRef.current);
                upgradePollRef.current = null;
              }
            } else {
              setStatus('in_mempool');
              statusRef.current = 'in_mempool';
              setStatusMessage('Transaction in mempool, waiting for block confirmation...');
              // Estimate time: Bitcoin blocks ~10 minutes
              setEstimatedTimeRemaining('~10 minutes');
            }
          } else {
            setStatus('submitted');
            statusRef.current = 'submitted';
            setStatusMessage('Transaction submitted to Bitcoin network...');
          }
        }
      } else {
        // No transaction hash yet - still being batched
        if (newStatus === 'pending') {
          setStatus('batched');
          statusRef.current = 'batched';
          setStatusMessage('Waiting for calendar server to batch with other timestamps...');
        } else {
          setStatusMessage('Submitted to OpenTimestamps calendar server. Waiting for batching...');
        }
      }

      // Update status message based on current status
      updateStatusMessage(newStatus);
      
    } catch (err) {
      logError(err, "BitcoinTimestamping.checkStatus");
      
      // Check if it's a connection error
      if (err.message?.includes('Failed to fetch') || 
          err.message?.includes('ERR_CONNECTION_REFUSED') ||
          err.message?.includes('Backend server unavailable')) {
        setError('Backend server is unavailable. Please ensure the backend is running on port 3001.');
        setStatus('error');
        statusRef.current = 'error';
        // Pause polling
        if (upgradePollRef.current) {
          clearTimeout(upgradePollRef.current);
          upgradePollRef.current = null;
        }
      } else {
        // Don't set error for other status check failures, just log and continue polling
        console.warn('Status check failed:', err);
      }
    } finally {
      if (showSpinner) {
        setUpgrading(false);
      }
    }
  };

  /**
   * Update status message based on status
   * @param {string} currentStatus - Current status
   */
  const updateStatusMessage = (currentStatus) => {
    switch (currentStatus) {
      case 'pending':
        setStatusMessage('Timestamp submitted to calendar servers, waiting for Bitcoin block inclusion...');
        setEstimatedTimeRemaining('Variable (typically 1-24 hours)');
        break;
      case 'anchored':
        setStatusMessage('✓ Bitcoin block attestation received! Checking confirmations...');
        setEstimatedTimeRemaining('~10 minutes');
        break;
      case 'confirmed':
        setStatusMessage('✓ Successfully timestamped on Bitcoin!');
        setEstimatedTimeRemaining(null);
        break;
      default:
        setStatusMessage('Waiting for Bitcoin block inclusion... (Check browser console for details)');
    }
  };

  /**
   * Check if timestamp has been upgraded with Bitcoin block attestation (legacy function for manual upgrade)
   * @param {Uint8Array} currentOtsFile - Current OTS file to check
   */
  const checkUpgrade = async (currentOtsFile) => {
    await checkStatus(currentOtsFile);
  };

  /**
   * Get status display component
   * @returns {JSX.Element} Status display
   */
  const getStatusDisplay = () => {
    const statusConfig = {
      'idle': { color: '#888', bg: 'rgba(255,255,255,0.02)', icon: '' },
      'stamping': { color: '#ffc107', bg: 'rgba(255, 193, 7, 0.1)', icon: '⏳' },
      'stamped': { color: '#ffc107', bg: 'rgba(255, 193, 7, 0.1)', icon: '✓' },
      'batched': { color: '#ffc107', bg: 'rgba(255, 193, 7, 0.1)', icon: null }, // Use spinner instead
      'submitted': { color: '#667eea', bg: 'rgba(102, 126, 234, 0.1)', icon: '📤' },
      'in_mempool': { color: '#667eea', bg: 'rgba(102, 126, 234, 0.1)', icon: '⏱️' },
      'confirmed': { color: '#2ecc71', bg: 'rgba(46, 204, 113, 0.1)', icon: '✓' },
    };

    const config = statusConfig[status] || statusConfig['stamped'];
    const isPending = !upgraded && status !== 'idle' && status !== 'stamping';

    return (
      <div style={{
        padding: "12px",
        borderRadius: 9,
        background: config.bg,
        border: `1px solid ${config.color}33`,
        color: config.color,
        fontSize: 13,
        marginBottom: 12,
        textAlign: "center"
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexWrap: "wrap"
          }}>
            {upgrading && <div style={pendingSpinner}></div>}
            {(config.icon && status !== 'batched') && <span>{config.icon}</span>}
            {status === 'batched' && <div style={pendingSpinner}></div>}
            <span>{statusMessage || 'Waiting for Bitcoin block inclusion...'}</span>
            {submissionTime && !upgraded && (
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                (Submitted {formatElapsedTime(Date.now() - submissionTime)} ago)
              </span>
            )}
          </div>
          {estimatedTimeRemaining && status === 'pending' && (
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              Est. {estimatedTimeRemaining}
            </div>
          )}
        </div>
        {submissionServers && submissionServers.length > 0 && (
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span>Submission status:</span>
              {submissionServers.map((srv, idx) => (
                <span key={idx} style={{ fontSize: 9 }}>
                  {srv.success ? '✓' : '✗'} {srv.server.replace('https://', '').replace('.opentimestamps.org', '').replace('.calendar.eternitywall.com', '').split('/')[0]}
                </span>
              ))}
            </div>
          </div>
        )}
        {calendarServerTip && !upgraded && (
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
            Calendar server last transaction: {calendarServerTip.txHash.slice(0, 16)}... 
            {calendarServerTip.blockHeight && ` (Block ${calendarServerTip.blockHeight})`}
          </div>
        )}
      </div>
    );
  };

  /**
   * Manually trigger status check
   */
  const handleManualUpgrade = async () => {
    if (!otsFile) {
      setError("No OTS file available");
      return;
    }
    setCheckingManually(true);
    try {
      await checkStatus(otsFile, false); // Don't show spinner for manual checks
    } finally {
      setCheckingManually(false);
    }
  };

  /**
   * Download OTS file
   */
  const handleDownloadOts = () => {
    if (!otsFile) {
      setError("No OTS file available");
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rootPrefix = merkleRoot.startsWith('0x') 
      ? merkleRoot.slice(2, 10) 
      : merkleRoot.slice(0, 8);
    const filename = `merkle-proof-bitcoin-${timestamp}-${rootPrefix}.ots`;
    
    downloadOtsFile(otsFile, filename);
  };


  // Display root for input (show without 0x prefix for cleaner display)
  const displayRoot = merkleRoot && merkleRoot.startsWith('0x') 
    ? merkleRoot.slice(2) 
    : merkleRoot || '';

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15, letterSpacing: "-0.01em" }}>
        Create Bitcoin Timestamp
      </h3>

      {/* Merkle Root Input */}
      <div style={inputSection}>
          <label style={label}>
            <span style={labelText}>Merkle Root</span>
            <input
              type="text"
              value={displayRoot}
              onChange={(e) => handleRootChange(e.target.value)}
              placeholder="Enter 64 hex characters..."
              aria-label="Merkle root input"
              aria-invalid={merkleRoot && !isValidMerkleRootFormat(merkleRoot)}
              style={{
                ...input,
                border: merkleRoot && !isValidMerkleRootFormat(merkleRoot) ? "1px solid #ff6b6b" : "1px solid #2a2a2a",
              }}
            />
            <div style={hint}>
              Paste a 32-byte hex root or load <code>merkle-tree.json</code>.
              {merkleRoot && !isValidMerkleRootFormat(merkleRoot) && (
                <span style={{ color: "#ff6b6b", marginLeft: 6 }} aria-live="polite">Invalid root format</span>
              )}
            </div>
          </label>

          <div style={{ marginTop: 10 }}>
            <label style={uploadBtn}>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              Load merkle-tree.json
            </label>
            {fileName && (
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                Loaded: <span style={{ fontFamily: "monospace" }}>{fileName}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
          <strong>Note:</strong> Bitcoin timestamping uses OpenTimestamps calendar servers. No wallet required. 
          Calendar servers batch multiple timestamps together to save costs, which can take 1-24 hours. 
          Once submitted to Bitcoin, confirmation typically takes ~10 minutes.
        </div>

      {!stamped ? (
        <button
          style={{
            padding: "10px 14px",
            borderRadius: 9,
            background: "linear-gradient(135deg, #f7931a 0%, #ff9500 100%)",
            color: "white",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            width: "100%",
            opacity: (!merkleRoot || !isValidMerkleRootFormat(merkleRoot) || stamping) ? 0.6 : 1,
            cursor: (!merkleRoot || !isValidMerkleRootFormat(merkleRoot) || stamping) ? "not-allowed" : "pointer"
          }}
          onClick={handleStamp}
          disabled={!merkleRoot || !isValidMerkleRootFormat(merkleRoot) || stamping}
          aria-label="Create Bitcoin timestamp"
          aria-busy={stamping}
        >
          {stamping 
            ? 'Submitting to OpenTimestamps calendar...' 
            : 'Create Timestamp on Bitcoin'}
        </button>
      ) : (
        <div>
          {getStatusDisplay()}

          {blockInfo && upgraded && (
            <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.8 }}>
              <div>Block Height: {blockInfo.height || 'N/A'}</div>
              {blockInfo.hash && <div>Block Hash: {blockInfo.hash.slice(0, 16)}...</div>}
            </div>
          )}

          {/* Transaction/Mempool links */}
          {transactionHash && !upgraded && (
            <div style={{ marginBottom: 12 }}>
              <a
                href={getMempoolTxUrl(transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  color: "#667eea",
                  textDecoration: "none",
                  fontWeight: 500,
                  marginBottom: 8
                }}
              >
                View Transaction on Mempool.space ↗
              </a>
            </div>
          )}
          
          {!transactionHash && !upgraded && (
            <div style={{ marginBottom: 12 }}>
              <a
                href="https://mempool.space"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  color: "#667eea",
                  textDecoration: "none",
                  fontWeight: 500,
                  marginBottom: 8
                }}
              >
                Track on Mempool.space ↗
              </a>
            </div>
          )}

          {upgraded && blockInfo?.hash && (
            <div style={{ marginBottom: 12 }}>
              <a
                href={getMempoolBlockUrl(blockInfo.hash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  color: "#667eea",
                  textDecoration: "none",
                  fontWeight: 500,
                  marginBottom: 8
                }}
              >
                View Block on Mempool.space ↗
              </a>
            </div>
          )}
          
          {upgraded && transactionHash && (
            <div style={{ marginBottom: 12 }}>
              <a
                href={getMempoolTxUrl(transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  color: "#667eea",
                  textDecoration: "none",
                  fontWeight: 500,
                  marginBottom: 8
                }}
              >
                View Transaction on Mempool.space ↗
              </a>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {!upgraded && (
              <button
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 9,
                  background: "rgba(255, 193, 7, 0.1)",
                  color: "#ffc107",
                  border: "1px solid rgba(255, 193, 7, 0.3)",
                  cursor: checkingManually ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: checkingManually ? 0.6 : 1,
                  minWidth: "120px",
                  transition: "opacity 0.2s ease"
                }}
                onClick={handleManualUpgrade}
                disabled={checkingManually}
                aria-label="Check for upgrade"
              >
                {checkingManually ? 'Checking...' : 'Check Upgrade'}
              </button>
            )}
            
            <button
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 9,
                background: upgraded ? "rgba(46, 204, 113, 0.1)" : "rgba(102, 126, 234, 0.1)",
                color: upgraded ? "#2ecc71" : "#667eea",
                border: upgraded ? "1px solid rgba(46, 204, 113, 0.3)" : "1px solid rgba(102, 126, 234, 0.3)",
                cursor: otsFile ? "pointer" : "not-allowed",
                fontSize: 13,
                fontWeight: 600,
                opacity: otsFile ? 1 : 0.5,
                minWidth: "120px"
              }}
              onClick={handleDownloadOts}
              disabled={!otsFile}
              aria-label="Download OTS proof file"
            >
              Download .ots File
            </button>
          </div>
          
          {upgraded && (
            <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7, padding: 8, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
              <strong>Verification:</strong> Use OpenTimestamps tools to verify: <code style={{ fontSize: 10 }}>ots verify timestamp.ots</code>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12,
          padding: "12px",
          borderRadius: 9,
          background: error.includes('Backend server') ? "#ff6b6b" : "rgba(255, 107, 107, 0.1)",
          border: error.includes('Backend server') ? "1px solid #ff6b6b" : "1px solid rgba(255, 107, 107, 0.3)",
          color: error.includes('Backend server') ? "white" : "#ff6b6b",
          fontSize: 13,
          marginBottom: error.includes('Backend server') ? 12 : 0
        }}>
          {error.includes('Backend server') ? '⚠️ ' : 'ERROR: '}{error}
          {error.includes('Backend server') && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
              Run: <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>npm run backend</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Styles ---------- */

const card = {
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  padding: 12,
  marginTop: 8,
  background: "rgba(0,0,0,0.22)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.28)",
};

const inputSection = {
  border: "1px solid rgba(255,255,255,0.04)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
  overflow: "hidden",
  boxSizing: "border-box",
  marginBottom: 12,
};

const label = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const labelText = {
  fontSize: 12,
  color: "#cfcfcf",
};

const input = {
  background: "#0f0f10",
  color: "#eaeaea",
  border: "1px solid #2a2a2a",
  borderRadius: 10,
  padding: "9px 11px",
  outline: "none",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  wordBreak: "break-all",
  overflowWrap: "break-word",
};

const hint = {
  fontSize: 11,
  color: "#8f8f8f",
};

const uploadBtn = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
  fontSize: 12,
};

const pendingSpinner = {
  width: 16,
  height: 16,
  border: "2px solid rgba(255, 193, 7, 0.2)",
  borderTop: "2px solid #ffc107",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
  flexShrink: 0,
};

