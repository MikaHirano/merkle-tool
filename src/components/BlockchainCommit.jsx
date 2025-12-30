import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractAddress } from "../config.js";
import { EXPLORER_URLS, NETWORK_IDS, NETWORK_NAMES, SCHEMA_VERSIONS, MAX_METADATA_LENGTH, getBlockchainShortName } from "../lib/constants.js";
import { validateAndChecksumAddress, normalizeMerkleRoot, validateMetadataLength } from "../lib/validation.js";
import { getErrorMessage, logError } from "../lib/errorHandler.js";

// Ensure spin animation is available
if (typeof document !== "undefined") {
  const styleId = "blockchain-commit-spinner";
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

// Contract ABI
const REGISTRY_ABI = [
  {
    "inputs": [
      {"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"},
      {"internalType": "string", "name": "metadata", "type": "string"}
    ],
    "name": "commitMerkleRoot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"}],
    "name": "getCommitment",
    "outputs": [
      {"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"},
      {"internalType": "address", "name": "committer", "type": "address"},
      {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
      {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
      {"internalType": "string", "name": "metadata", "type": "string"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"}],
    "name": "isCommitted",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * BlockchainCommit component
 * Handles committing Merkle roots to the blockchain
 * @param {Object} props - Component props
 * @param {string} props.merkleRoot - The Merkle root to commit
 * @param {Object} props.jsonData - JSON data from merkle-tree.json
 * @param {Object} props.wallet - Wallet connection object
 * @param {Function} props.onCommitted - Callback when commitment succeeds
 */
export default function BlockchainCommit({ merkleRoot, jsonData, wallet, onCommitted }) {
  const [committing, setCommitting] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [txConfirmed, setTxConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [proofData, setProofData] = useState(null);
  const [chainId, setChainId] = useState(null);

  // Get contract address from config based on current chain ID
  const contractAddress = wallet?.chainId ? getContractAddress(wallet.chainId) : null;

  // Update chainId when wallet changes
  useEffect(() => {
    if (wallet?.chainId) {
      setChainId(wallet.chainId);
    }
  }, [wallet?.chainId]);

  /**
   * Handle committing Merkle root to blockchain
   */
  const handleCommit = async () => {
    if (!wallet || !merkleRoot) {
      setError("Wallet not connected or Merkle root missing");
      return;
    }

    if (!contractAddress) {
      setError("Contract address not configured for this network");
      return;
    }

    // Validate and checksum contract address
    const checksummedAddress = validateAndChecksumAddress(contractAddress);
    if (!checksummedAddress) {
      setError("Invalid contract address format");
      return;
    }

    setCommitting(true);
    setError(null);
    setTxConfirmed(false);

    try {
      const contract = new ethers.Contract(checksummedAddress, REGISTRY_ABI, wallet.signer);

      // Create metadata with summary info
      const metadata = JSON.stringify({
        fileCount: jsonData?.summary?.fileCount || 0,
        totalBytes: jsonData?.summary?.totalBytes || 0,
        totalBytesHuman: jsonData?.summary?.totalBytesHuman || "",
        generatedAt: jsonData?.generatedAt || new Date().toISOString(),
        schema: jsonData?.schema || SCHEMA_VERSIONS.MERKLE_TREE,
        algorithm: jsonData?.algorithm || "SHA-256"
      });

      // Validate metadata length
      const metadataValidation = validateMetadataLength(metadata, MAX_METADATA_LENGTH);
      if (!metadataValidation.valid) {
        setError(`Metadata too long: ${metadataValidation.length} bytes (max ${metadataValidation.maxLength})`);
        setCommitting(false);
        return;
      }

      // Normalize Merkle root
      const rootBytes32 = normalizeMerkleRoot(merkleRoot);
      
      // Check if already committed
      const isCommitted = await contract.isCommitted(rootBytes32);
      if (isCommitted) {
        setError("This Merkle root has already been committed to the blockchain");
        setCommitting(false);
        return;
      }

      // Execute transaction
      const tx = await contract.commitMerkleRoot(rootBytes32, metadata);
      setTxHash(tx.hash);
      setTxConfirmed(false); // Transaction sent but not confirmed yet

      // Wait for confirmation
      const receipt = await tx.wait();
      setTxConfirmed(true); // Transaction confirmed
      
      // Store chainId from transaction
      const txChainId = wallet.chainId;
      setChainId(txChainId);

      // Get explorer URLs based on chain ID
      const explorerInfo = EXPLORER_URLS[txChainId] || EXPLORER_URLS[NETWORK_IDS.ETHEREUM_MAINNET] || EXPLORER_URLS[NETWORK_IDS.ARBITRUM_ONE];
      const explorer = {
        txUrl: `${explorerInfo.base}/tx/${tx.hash}`,
        contractUrl: `${explorerInfo.base}/address/${checksummedAddress}`,
        name: explorerInfo.name
      };

      // Get blockchain name
      const blockchainName = NETWORK_NAMES[txChainId] || "Unknown";
      
      // Create proof data
      const proofData = {
        schema: SCHEMA_VERSIONS.BLOCKCHAIN_PROOF,
        blockchain: blockchainName,
        blockchainId: txChainId,
        blockchainExplorer: explorerInfo.name,
        merkleRoot: rootBytes32,
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          chainId: txChainId,
          contractAddress: checksummedAddress,
          gasUsed: receipt.gasUsed.toString(),
          timestamp: Date.now()
        },
        committer: wallet.address,
        metadata: JSON.parse(metadata),
        verification: {
          contractUrl: explorer.contractUrl,
          transactionUrl: explorer.txUrl
        }
      };

      setProofData(proofData);
      if (onCommitted) onCommitted(proofData);

    } catch (err) {
      logError(err, "BlockchainCommit.handleCommit");
      setError(getErrorMessage(err));
      // If transaction was sent but failed during confirmation, keep txHash visible
      // but mark as not confirmed so user can see the failed transaction
      if (txHash && !txConfirmed) {
        // Transaction was sent but confirmation failed - keep txHash for reference
        // but don't mark as confirmed
      }
    } finally {
      setCommitting(false);
    }
  };

  /**
   * Get explorer info for a chain ID
   * @param {number} chainId - Chain ID
   * @returns {Object} Explorer info
   */
  const getExplorerInfo = (chainId) => {
    return EXPLORER_URLS[chainId] || EXPLORER_URLS[NETWORK_IDS.ETHEREUM_MAINNET] || EXPLORER_URLS[NETWORK_IDS.ARBITRUM_ONE];
  };

  const downloadProof = (proofData) => {
    if (!proofData) return;

    const timestamp = new Date(proofData.transaction.timestamp).toISOString().slice(0, 10).replace(/-/g, '');
    const rootPrefix = proofData.merkleRoot.slice(2, 10); // Remove 0x prefix for filename
    const blockchainShortName = getBlockchainShortName(proofData.blockchainId || proofData.transaction.chainId);
    const filename = `merkle-proof-${blockchainShortName}-${timestamp}-${rootPrefix}.json`;

    const blob = new Blob([JSON.stringify(proofData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 15, letterSpacing: "-0.01em" }}>
        Commit to Blockchain
      </h3>

      {contractAddress && (
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
          Contract: {contractAddress}
        </div>
      )}

      {!contractAddress && wallet && (
        <div style={{
          padding: "10px",
          borderRadius: 9,
          background: "rgba(255, 193, 7, 0.1)",
          border: "1px solid rgba(255, 193, 7, 0.3)",
          color: "#ffc107",
          fontSize: 12,
          marginBottom: 12
        }}>
          WARNING: Contract address not configured for this network
        </div>
      )}

      <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 12 }}>
        Merkle root: {merkleRoot ? `${merkleRoot.slice(2, 12)}...` : 'None'}
      </div>

      {!txHash ? (
        <button
          style={{
            padding: "10px 14px",
            borderRadius: 9,
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            width: "100%",
            opacity: (!wallet || !merkleRoot || !contractAddress || committing) ? 0.6 : 1,
            cursor: (!wallet || !merkleRoot || !contractAddress || committing) ? "not-allowed" : "pointer"
          }}
          onClick={handleCommit}
          disabled={!wallet || !merkleRoot || !contractAddress || committing}
          aria-label={`Create timestamp on ${chainId ? NETWORK_NAMES[chainId] || 'blockchain' : 'blockchain'}`}
          aria-busy={committing}
        >
          {committing 
            ? 'Creating Timestamp...' 
            : `Create Timestamp on ${chainId ? NETWORK_NAMES[chainId] || 'Blockchain' : 'Blockchain'}`}
        </button>
      ) : (
        <div>
          {txConfirmed ? (
            <div style={{
              padding: "12px",
              borderRadius: 9,
              background: "rgba(46, 204, 113, 0.1)",
              border: "1px solid rgba(46, 204, 113, 0.3)",
              color: "#2ecc71",
              fontSize: 13,
              marginBottom: 12,
              textAlign: "center"
            }}>
              Successfully committed to {NETWORK_NAMES[chainId] || "blockchain"}!
            </div>
          ) : (
            <div style={{
              padding: "12px",
              borderRadius: 9,
              background: "rgba(255, 193, 7, 0.1)",
              border: "1px solid rgba(255, 193, 7, 0.3)",
              color: "#ffc107",
              fontSize: 13,
              marginBottom: 12,
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8
            }}>
              <div style={pendingSpinner}></div>
              Transaction pending confirmation...
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Transaction Hash</div>
            <div style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
              padding: "8px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 8,
              wordBreak: "break-all"
            }}>
              {txHash}
            </div>
            {chainId && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {txConfirmed && (
                  <a
                    href={getExplorerInfo(chainId).base + `/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      fontSize: 11,
                      color: "#667eea",
                      textDecoration: "none",
                      fontWeight: 500
                    }}
                  >
                    View Transaction on {getExplorerInfo(chainId).name} ↗
                  </a>
                )}
                <a
                  href={getExplorerInfo(chainId).base + `/address/${contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    color: "#667eea",
                    textDecoration: "none",
                    fontWeight: 500
                  }}
                >
                  View Contract on {getExplorerInfo(chainId).name} ↗
                </a>
              </div>
            )}
          </div>

          {txConfirmed && (
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 9,
                background: "rgba(46, 204, 113, 0.1)",
                color: "#2ecc71",
                border: "1px solid rgba(46, 204, 113, 0.3)",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                width: "100%"
              }}
              onClick={() => proofData && downloadProof(proofData)}
              aria-label="Download blockchain proof file"
            >
              Download Proof File
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 12,
          padding: "10px",
          borderRadius: 9,
          background: "rgba(255, 107, 107, 0.1)",
          border: "1px solid rgba(255, 107, 107, 0.3)",
          color: "#ff6b6b",
          fontSize: 12
        }}>
          ERROR: {error}
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

const input = {
  background: "#0f0f10",
  color: "#eaeaea",
  border: "1px solid #2a2a2a",
  borderRadius: 9,
  padding: "9px 11px",
  outline: "none",
  fontSize: 13,
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
