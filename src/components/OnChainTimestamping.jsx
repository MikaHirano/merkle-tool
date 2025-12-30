import { useState, useEffect, useRef } from "react";
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
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Network parameters for MetaMask switching
  const NETWORK_PARAMS = {
    [NETWORK_IDS.ETHEREUM_MAINNET]: {
      chainId: `0x${NETWORK_IDS.ETHEREUM_MAINNET.toString(16)}`,
      chainName: 'Ethereum Mainnet',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://eth.llamarpc.com'],
      blockExplorerUrls: ['https://etherscan.io'],
    },
    [NETWORK_IDS.OPTIMISM]: {
      chainId: `0x${NETWORK_IDS.OPTIMISM.toString(16)}`,
      chainName: 'Optimism',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://mainnet.optimism.io'],
      blockExplorerUrls: ['https://optimistic.etherscan.io'],
    },
    [NETWORK_IDS.ARBITRUM_ONE]: {
      chainId: `0x${NETWORK_IDS.ARBITRUM_ONE.toString(16)}`,
      chainName: 'Arbitrum One',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io'],
    },
    [NETWORK_IDS.BASE]: {
      chainId: `0x${NETWORK_IDS.BASE.toString(16)}`,
      chainName: 'Base',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org'],
    },
  };

  /**
   * Reset all timestamping-related state
   * Called when network is switched to clear previous state
   */
  const resetState = () => {
    setMerkleRoot("");
    setJsonData(null);
    setFileName("");
    setError("");
  };

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
        const supportedNames = [
          NETWORK_NAMES[NETWORK_IDS.ETHEREUM_MAINNET],
          NETWORK_NAMES[NETWORK_IDS.OPTIMISM],
          NETWORK_NAMES[NETWORK_IDS.ARBITRUM_ONE],
          NETWORK_NAMES[NETWORK_IDS.ARBITRUM_SEPOLIA],
          NETWORK_NAMES[NETWORK_IDS.BASE],
          NETWORK_NAMES[NETWORK_IDS.LOCAL_ANVIL],
        ].filter(Boolean).join(', ');
        setWalletError(`Please switch to a supported network: ${supportedNames}`);
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

  /**
   * Switch MetaMask to a specific network
   * @param {number} targetChainId - Chain ID to switch to
   */
  const switchToNetwork = async (targetChainId) => {
    if (!window.ethereum || !wallet) {
      setWalletError('Wallet not connected');
      return;
    }

    setSwitchingNetwork(true);
    setWalletError(null);

    try {
      const networkParams = NETWORK_PARAMS[targetChainId];
      if (!networkParams) {
        throw new Error(`Network parameters not configured for chain ID ${targetChainId}`);
      }

      // Try to switch network first
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: networkParams.chainId }],
        });
      } catch (switchError) {
        // If network is not added, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [networkParams],
          });
        } else {
          throw switchError;
        }
      }

      // Update state after successful switch
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const newChainId = Number(network.chainId);

      if (newChainId === targetChainId) {
        setChainId(newChainId);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        setWallet({
          provider,
          signer,
          address,
          chainId: newChainId
        });
        
        // Reset timestamping state when network changes
        resetState();
      }
    } catch (err) {
      logError(err, "OnChainTimestamping.switchToNetwork");
      setWalletError(getErrorMessage(err));
    } finally {
      setSwitchingNetwork(false);
    }
  };

  /**
   * Handle network selection from custom dropdown
   * @param {string} chainValue - Chain identifier
   */
  const handleNetworkSelect = async (chainValue) => {
    setDropdownOpen(false);
    setSelectedChain(chainValue);

    if (!wallet) {
      return; // Can't switch if not connected
    }

    // Map chain identifier to chain ID
    let targetChainId = null;
    if (chainValue === 'ethereum') {
      targetChainId = NETWORK_IDS.ETHEREUM_MAINNET;
    } else if (chainValue === 'optimism') {
      if (chainId !== NETWORK_IDS.OPTIMISM) {
        targetChainId = NETWORK_IDS.OPTIMISM;
      } else {
        return; // Already on Optimism
      }
    } else if (chainValue === 'base') {
      if (chainId !== NETWORK_IDS.BASE) {
        targetChainId = NETWORK_IDS.BASE;
      } else {
        return; // Already on Base
      }
    } else if (chainValue === 'arbitrum') {
      // If already on Arbitrum Sepolia or Local Anvil, switch to Arbitrum One
      if (chainId === NETWORK_IDS.ARBITRUM_SEPOLIA || chainId === NETWORK_IDS.LOCAL_ANVIL) {
        targetChainId = NETWORK_IDS.ARBITRUM_ONE;
      } else if (chainId !== NETWORK_IDS.ARBITRUM_ONE) {
        targetChainId = NETWORK_IDS.ARBITRUM_ONE;
      } else {
        return; // Already on Arbitrum One
      }
    }

    if (targetChainId && targetChainId !== chainId) {
      await switchToNetwork(targetChainId);
    }
  };

  /**
   * Handle click outside dropdown to close it
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          setAccount(accounts[0]);
        }
      });

      window.ethereum.on('chainChanged', async (chainIdHex) => {
        try {
          const newChainId = parseInt(chainIdHex, 16);
          setChainId(newChainId);

          // If wallet is connected, update wallet state
          if (wallet) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const network = await provider.getNetwork();
            const signer = await provider.getSigner();
            const address = await signer.getAddress();

            // Check if new network is supported
            if (isSupportedNetwork(newChainId)) {
              setWallet({
                provider,
                signer,
                address,
                chainId: newChainId
              });
              setWalletError(null);
              // Reset timestamping state when network changes from MetaMask
              resetState();
            } else {
              const supportedNames = [
                NETWORK_NAMES[NETWORK_IDS.ETHEREUM_MAINNET],
                NETWORK_NAMES[NETWORK_IDS.OPTIMISM],
                NETWORK_NAMES[NETWORK_IDS.ARBITRUM_ONE],
                NETWORK_NAMES[NETWORK_IDS.ARBITRUM_SEPOLIA],
                NETWORK_NAMES[NETWORK_IDS.LOCAL_ANVIL],
              ].filter(Boolean).join(', ');
              setWalletError(`Unsupported network. Please switch to: ${supportedNames}`);
              // Reset state even if network is unsupported
              resetState();
            }
          } else {
            // If wallet was disconnected but chain changed, still reset state
            resetState();
          }
        } catch (err) {
          logError(err, "OnChainTimestamping.chainChanged");
        }
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
            const currentChainId = Number(network.chainId);

            setAccount(address);
            setChainId(currentChainId);

            // Only set wallet if on supported network
            if (isSupportedNetwork(currentChainId)) {
              setWallet({
                provider,
                signer,
                address,
                chainId: currentChainId
              });
            }
          }
        } catch (err) {
          logError(err, "OnChainTimestamping.checkConnection");
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
    if (id === NETWORK_IDS.ETHEREUM_MAINNET) return 'ethereum';
    if (id === NETWORK_IDS.OPTIMISM) return 'optimism';
    if (id === NETWORK_IDS.BASE) return 'base';
    if (id === NETWORK_IDS.ARBITRUM_ONE || id === NETWORK_IDS.ARBITRUM_SEPOLIA) return 'arbitrum';
    if (id === NETWORK_IDS.LOCAL_ANVIL) return 'arbitrum'; // Local anvil treated as arbitrum
    return null;
  };

  /**
   * Get icon path for chain identifier
   * @param {string} chainIdentifier - Chain identifier ('ethereum', 'optimism', 'arbitrum', 'base')
   * @returns {string} Icon file path
   */
  const getChainIcon = (chainIdentifier) => {
    const iconMap = {
      'ethereum': '/icons/ethereum.svg',
      'optimism': '/icons/optimism.svg',
      'arbitrum': '/icons/arbitrum.svg',
      'base': '/icons/base.svg',
    };
    return iconMap[chainIdentifier] || '/icons/ethereum.svg';
  };

  // Update selectedChain when chainId changes
  useEffect(() => {
    if (chainId) {
      const chainIdentifier = getChainIdentifier(chainId);
      if (chainIdentifier) {
        setSelectedChain(chainIdentifier);
      }
      // If on unsupported network, don't change selection
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
        <div style={dropdownContainer} ref={dropdownRef}>
          <button
            type="button"
            style={{
              ...networkSelect,
              ...networkSelectButton,
              ...(dropdownOpen ? networkSelectButtonOpen : {}),
              ...((!wallet || switchingNetwork) ? networkSelectButtonDisabled : {})
            }}
            onClick={() => !switchingNetwork && wallet && setDropdownOpen(!dropdownOpen)}
            disabled={!wallet || switchingNetwork}
            aria-label="Select blockchain network"
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
          >
            <img 
              src={getChainIcon(wallet && chainId ? getChainIdentifier(chainId) || selectedChain : selectedChain)} 
              alt="" 
              style={networkIcon}
            />
            <span style={networkSelectText}>
              {wallet && chainId 
                ? (getChainIdentifier(chainId) === 'ethereum' ? 'Ethereum Mainnet' :
                   getChainIdentifier(chainId) === 'optimism' ? (getNetworkName(chainId) || 'Optimism') :
                   getChainIdentifier(chainId) === 'base' ? (getNetworkName(chainId) || 'Base') :
                   getChainIdentifier(chainId) === 'arbitrum' ? (getNetworkName(chainId) || 'Arbitrum One') :
                   'Select Network')
                : (selectedChain === 'ethereum' ? 'Ethereum Mainnet' :
                   selectedChain === 'optimism' ? 'Optimism' :
                   selectedChain === 'base' ? 'Base' :
                   'Arbitrum One')}
            </span>
            <span style={dropdownArrow}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>
          {dropdownOpen && wallet && !switchingNetwork && (
            <div style={dropdownMenu} role="listbox">
              <NetworkOption
                chainId="ethereum"
                label="Ethereum Mainnet"
                icon={getChainIcon('ethereum')}
                isSelected={selectedChain === 'ethereum'}
                onClick={() => handleNetworkSelect('ethereum')}
              />
              <NetworkOption
                chainId="optimism"
                label={wallet && chainId && chainId === NETWORK_IDS.OPTIMISM
                  ? getNetworkName(chainId)
                  : 'Optimism'}
                icon={getChainIcon('optimism')}
                isSelected={selectedChain === 'optimism'}
                onClick={() => handleNetworkSelect('optimism')}
              />
              <NetworkOption
                chainId="arbitrum"
                label={wallet && chainId && (chainId === NETWORK_IDS.ARBITRUM_ONE || chainId === NETWORK_IDS.ARBITRUM_SEPOLIA || chainId === NETWORK_IDS.LOCAL_ANVIL)
                  ? getNetworkName(chainId)
                  : 'Arbitrum One'}
                icon={getChainIcon('arbitrum')}
                isSelected={selectedChain === 'arbitrum'}
                onClick={() => handleNetworkSelect('arbitrum')}
              />
              <NetworkOption
                chainId="base"
                label={wallet && chainId && chainId === NETWORK_IDS.BASE
                  ? getNetworkName(chainId)
                  : 'Base'}
                icon={getChainIcon('base')}
                isSelected={selectedChain === 'base'}
                onClick={() => handleNetworkSelect('base')}
              />
            </div>
          )}
        </div>
        {switchingNetwork && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            Switching network...
          </div>
        )}
      </div>

      {walletError && (
        <div style={errorBox}>
          WARNING: {walletError}
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
          key={chainId || 'no-chain'}
          merkleRoot={isValidMerkleRootFormat(merkleRoot) ? merkleRoot : ""}
          jsonData={jsonData}
          wallet={wallet}
          onCommitted={() => {}}
        />
      </div>

      {error && (
        <div style={errorBox}>
          ERROR: {error}
        </div>
      )}

      {/* Documentation Links */}
      <div style={docsLinksContainer}>
        <div style={docsLinksLabel}>Documentation:</div>
        <div style={docsLinks}>
          <a 
            href="https://github.com/MikaHirano/merkle-tool/blob/main/README.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={docLink}
            onMouseEnter={(e) => e.target.style.opacity = "1"}
            onMouseLeave={(e) => e.target.style.opacity = "0.8"}
          >
            README
          </a>
          <span style={docLinkSeparator}>•</span>
          <a 
            href="https://github.com/MikaHirano/merkle-tool/blob/main/TIMESTAMPING.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={docLink}
            onMouseEnter={(e) => e.target.style.opacity = "1"}
            onMouseLeave={(e) => e.target.style.opacity = "0.8"}
          >
            Timestamping Guide
          </a>
          <span style={docLinkSeparator}>•</span>
          <a 
            href="https://github.com/MikaHirano/merkle-tool/blob/main/contracts/README.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={docLink}
            onMouseEnter={(e) => e.target.style.opacity = "1"}
            onMouseLeave={(e) => e.target.style.opacity = "0.8"}
          >
            Smart Contract
          </a>
          <span style={docLinkSeparator}>•</span>
          <a 
            href="https://github.com/MikaHirano/merkle-tool/blob/main/contracts/DEPLOYMENT_GUIDE.md" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={docLink}
            onMouseEnter={(e) => e.target.style.opacity = "1"}
            onMouseLeave={(e) => e.target.style.opacity = "0.8"}
          >
            Deployment Guide
          </a>
        </div>
      </div>
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

const docsLinksContainer = {
  marginTop: 20,
  paddingTop: 16,
  borderTop: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const docsLinksLabel = {
  fontSize: 11,
  opacity: 0.6,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#888",
};

const docsLinks = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const docLink = {
  fontSize: 11,
  color: "#667eea",
  textDecoration: "none",
  opacity: 0.8,
  transition: "opacity 0.2s ease",
};

// Add hover effect via inline style with onMouseEnter/onMouseLeave
// Note: CSS-in-JS hover requires event handlers, so we'll handle it in the component

const docLinkSeparator = {
  fontSize: 10,
  opacity: 0.4,
  color: "#666",
};

const dropdownContainer = {
  position: "relative",
  minWidth: 180,
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
  minWidth: 180,
};

const networkSelectButton = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  justifyContent: "space-between",
  transition: "all 0.2s ease",
};

const networkSelectButtonOpen = {
  borderColor: "rgba(102, 126, 234, 0.4)",
  background: "rgba(255,255,255,0.06)",
};

const networkSelectButtonDisabled = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const networkSelectText = {
  flex: 1,
  textAlign: "left",
};

const networkIcon = {
  width: 16,
  height: 16,
  flexShrink: 0,
};

const dropdownArrow = {
  fontSize: 10,
  opacity: 0.6,
  flexShrink: 0,
  transition: "transform 0.2s ease",
};

const dropdownMenu = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: 4,
  background: "rgba(20, 20, 20, 0.98)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 4,
  zIndex: 1000,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 180,
  whiteSpace: "nowrap",
};

const dropdownOption = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 8,
  background: "transparent",
  border: "none",
  color: "#cfcfcf",
  fontSize: 12,
  cursor: "pointer",
  outline: "none",
  textAlign: "left",
  width: "100%",
  transition: "all 0.2s ease",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const dropdownOptionSelected = {
  background: "rgba(102, 126, 234, 0.15)",
  color: "#667eea",
};

/**
 * Network option component with hover effects
 * @param {Object} props - Component props
 * @param {string} props.chainId - Chain identifier
 * @param {string} props.label - Display label
 * @param {string} props.icon - Icon file path
 * @param {boolean} props.isSelected - Whether this option is selected
 * @param {Function} props.onClick - Click handler
 */
function NetworkOption({ chainId, label, icon, isSelected, onClick }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      type="button"
      style={{
        ...dropdownOption,
        ...(isSelected ? dropdownOptionSelected : {}),
        ...(isHovered && !isSelected ? { background: "rgba(255,255,255,0.06)" } : {})
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      aria-selected={isSelected}
    >
      <img src={icon} alt="" style={networkIcon} />
      <span>{label}</span>
    </button>
  );
}

const networkInfo = {
  fontSize: 11,
  color: "#8f8f8f",
  padding: "4px 0",
};

