import { useState, useEffect } from "react";
import { ethers } from "ethers";
import BlockchainCommit from "./BlockchainCommit";
import { NETWORK_IDS, NETWORK_NAMES, SCHEMA_VERSIONS } from "../lib/constants.js";
import { normalizeMerkleRoot, isValidMerkleRootFormat, validateJSON } from "../lib/validation.js";
import { getErrorMessage, logError } from "../lib/errorHandler.js";
import { isSupportedNetwork } from "../config.js";

/**
 * On-chain timestamping component
 * Provides UI for connecting wallet, entering/loading Merkle roots, and committing to blockchain
 * @component
 */
export default function OnChainTimestamping() {
  const [wallet, setWallet] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState(null);
  const [selectedChain, setSelectedChain] = useState("arbitrum");
  
  const [merkleRoot, setMerkleRoot] = useState("");
  const [jsonData, setJsonData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  /**
   * Connect to Web3 wallet
   */
  const connectWallet = async () => {
    if (!window.ethereum) {
      setWalletError('Please install MetaMask or another Web3 wallet');
      return;
    }

    setConnecting(true);
    setWalletError(null);

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      const currentChainId = Number(network.chainId);
      setAccount(address);
      setChainId(currentChainId);

      // Check if on supported network
      if (!isSupportedNetwork(currentChainId)) {
        setWalletError(`Please switch to a supported network: ${NETWORK_NAMES[NETWORK_IDS.ARBITRUM_ONE]}, ${NETWORK_NAMES[NETWORK_IDS.ARBITRUM_SEPOLIA]}, or ${NETWORK_NAMES[NETWORK_IDS.LOCAL_ANVIL]}`);
        setConnecting(false);
        return;
      }

      setWallet({
        provider,
        signer,
        address,
        chainId: currentChainId
      });

    } catch (err) {
      logError(err, "OnChainTimestamping.connectWallet");
      setWalletError(getErrorMessage(err));
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setChainId(null);
    setWalletError(null);
    setWallet(null);
  };

  const handleNetworkChange = (e) => {
    const chain = e.target.value;
    setSelectedChain(chain);
    // Future: trigger network switch when other chains are enabled
  };

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          setAccount(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });

      // Check if already connected
      const checkConnection = async () => {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.listAccounts();
          if (accounts.length > 0) {
            const signer = await provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();

            setAccount(address);
            setChainId(Number(network.chainId));

            setWallet({
              provider,
              signer,
              address,
              chainId: Number(network.chainId)
            });
          }
        } catch (err) {
          console.error('Error checking connection:', err);
        }
      };

      checkConnection();
    }
  }, []);

  /**
   * Handle Merkle root input change
   * @param {string} value - Input value
   */
  const handleRootChange = (value) => {
    // User can type with or without 0x, normalize it
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
      logError(err, "OnChainTimestamping.handleFileChange");
      setError(getErrorMessage(err));
      setJsonData(null);
      setFileName("");
    } finally {
      e.target.value = "";
    }
  };

  /**
   * Get network name for chain ID
   * @param {number} id - Chain ID
   * @returns {string} Network name
   */
  const getNetworkName = (id) => {
    return NETWORK_NAMES[id] || 'Unknown';
  };

  /**
   * Get chain identifier for UI
   * @param {number} id - Chain ID
   * @returns {string|null} Chain identifier
   */
  const getChainIdentifier = (id) => {
    if (id === NETWORK_IDS.ARBITRUM_ONE || id === NETWORK_IDS.ARBITRUM_SEPOLIA) return 'arbitrum';
    if (id === NETWORK_IDS.LOCAL_ANVIL) return 'arbitrum'; // Local anvil treated as arbitrum
    return null;
  };

  // Update selectedChain when chainId changes
  useEffect(() => {
    if (chainId) {
      const chainIdentifier = getChainIdentifier(chainId);
      if (chainIdentifier) {
        setSelectedChain(chainIdentifier);
      }
    } else {
      setSelectedChain('arbitrum'); // Default when disconnected
    }
  }, [chainId]);

  // Display value without 0x prefix for UX
  const displayRoot = merkleRoot.startsWith("0x") ? merkleRoot.slice(2) : merkleRoot;

  return (
    <div style={container}>
      {/* Wallet Status Button & Network Dropdown */}
      <div style={walletStatusRow}>
        <button
          style={{
            ...walletStatusBtn,
            ...(wallet ? walletStatusConnected : walletStatusDisconnected)
          }}
          onClick={wallet ? disconnectWallet : connectWallet}
          disabled={connecting}
          aria-label={wallet ? "Disconnect wallet" : "Connect wallet"}
          aria-busy={connecting}
        >
          {connecting ? (
            'Connecting...'
          ) : wallet ? (
            <>
              <span style={statusDot}></span>
              Connected {account || ''}
            </>
          ) : (
            <>
              <span style={{...statusDot, background: '#666'}}></span>
              Disconnected
            </>
          )}
        </button>
        <select
          style={networkSelect}
          value={wallet && chainId ? getChainIdentifier(chainId) || selectedChain : selectedChain}
          onChange={handleNetworkChange}
          aria-label="Select blockchain network"
          disabled={!wallet}
        >
          <option value="arbitrum">
            {wallet && chainId ? getNetworkName(chainId) : 'Arbitrum'}
          </option>
          <option value="ethereum" disabled>Ethereum Mainnet</option>
          <option value="optimism" disabled>Optimism</option>
          <option value="base" disabled>Base</option>
        </select>
      </div>

      {walletError && (
        <div style={errorBox}>
          ⚠️ {walletError}
        </div>
      )}

      <div style={section}>
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
              borderColor: merkleRoot && !isValidMerkleRootFormat(merkleRoot) ? "#ff6b6b" : "#2a2a2a",
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

      <div style={section}>
        <BlockchainCommit
          merkleRoot={isValidMerkleRootFormat(merkleRoot) ? merkleRoot : ""}
          jsonData={jsonData}
          wallet={wallet}
          onCommitted={() => {}}
        />
      </div>

      {error && (
        <div style={errorBox}>
          ❌ {error}
        </div>
      )}
    </div>
  );
}

/* ---------- Styles ---------- */

const container = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: "100%",
  boxSizing: "border-box",
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const eyebrow = {
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 11,
  color: "#8da2ff",
};

const title = {
  margin: "2px 0 0 0",
  fontSize: 18,
  fontWeight: 600,
  letterSpacing: "-0.01em",
};

const subtext = {
  marginTop: 3,
  fontSize: 12,
  color: "#a7a7a7",
};

const section = {
  border: "1px solid rgba(255,255,255,0.04)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
  overflow: "hidden",
  boxSizing: "border-box",
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

const errorBox = {
  padding: 9,
  borderRadius: 10,
  border: "1px solid rgba(255, 107, 107, 0.28)",
  background: "rgba(255, 107, 107, 0.07)",
  color: "#ffb4b4",
  fontSize: 12,
};

const chipRow = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const chip = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  fontSize: 11,
  color: "#cfcfcf",
};

const walletStatusRow = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const walletStatusBtn = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.02)",
  color: "#cfcfcf",
  fontSize: 12,
  cursor: "pointer",
  outline: "none",
  display: "flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.2s ease",
};

const walletStatusConnected = {
  background: "rgba(46, 204, 113, 0.1)",
  borderColor: "rgba(46, 204, 113, 0.3)",
  color: "#2ecc71",
};

const walletStatusDisconnected = {
  background: "rgba(255,255,255,0.02)",
  borderColor: "rgba(255,255,255,0.08)",
};

const statusDot = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "#2ecc71",
  display: "inline-block",
};

const networkSelect = {
  background: "rgba(255,255,255,0.04)",
  color: "#cfcfcf",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 12,
  outline: "none",
  cursor: "pointer",
  minWidth: 100,
};

const networkInfo = {
  fontSize: 11,
  color: "#8f8f8f",
  padding: "4px 0",
};

