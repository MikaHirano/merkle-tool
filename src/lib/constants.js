/**
 * Application constants
 * Centralized configuration values for the Merkle Tool application
 */

// Network Chain IDs
export const NETWORK_IDS = {
  ARBITRUM_ONE: 42161,
  ARBITRUM_SEPOLIA: 421614,
  LOCAL_ANVIL: 31337,
  ETHEREUM_MAINNET: 1,
  OPTIMISM: 10,
  BASE: 8453,
};

// Network names
export const NETWORK_NAMES = {
  [NETWORK_IDS.ARBITRUM_ONE]: "Arbitrum One",
  [NETWORK_IDS.ARBITRUM_SEPOLIA]: "Arbitrum Sepolia",
  [NETWORK_IDS.LOCAL_ANVIL]: "Local Anvil",
  [NETWORK_IDS.ETHEREUM_MAINNET]: "Ethereum Mainnet",
  [NETWORK_IDS.OPTIMISM]: "Optimism",
  [NETWORK_IDS.BASE]: "Base",
};

// Explorer URLs
export const EXPLORER_URLS = {
  [NETWORK_IDS.ETHEREUM_MAINNET]: {
    base: "https://etherscan.io",
    name: "Etherscan",
  },
  [NETWORK_IDS.OPTIMISM]: {
    base: "https://optimistic.etherscan.io",
    name: "Optimistic Etherscan",
  },
  [NETWORK_IDS.ARBITRUM_ONE]: {
    base: "https://arbiscan.io",
    name: "Arbiscan",
  },
  [NETWORK_IDS.ARBITRUM_SEPOLIA]: {
    base: "https://sepolia.arbiscan.io",
    name: "Arbiscan Sepolia",
  },
  [NETWORK_IDS.BASE]: {
    base: "https://basescan.org",
    name: "Basescan",
  },
  [NETWORK_IDS.LOCAL_ANVIL]: {
    base: "http://localhost:8545",
    name: "Local Anvil",
  },
};

// Default limits (in bytes)
export const DEFAULT_LIMITS = {
  MAX_TOTAL_BYTES: 500 * 1024 * 1024, // 500 MB
  MAX_FILE_BYTES: 100 * 1024 * 1024, // 100 MB
};

// Merkle root validation
export const MERKLE_ROOT_LENGTH = 64; // 32 bytes = 64 hex characters (without 0x)
export const MERKLE_ROOT_REGEX = /^[a-f0-9]{64}$/i;

// Ethereum address validation
export const ETH_ADDRESS_LENGTH = 42; // 0x + 40 hex chars
export const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Contract metadata limits (matches smart contract)
export const MAX_METADATA_LENGTH = 2048; // bytes

// Progress update throttling (ms)
export const PROGRESS_UPDATE_THROTTLE_MS = 100;

// File size units
export const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

// Default folder policy
export const DEFAULT_FOLDER_POLICY = {
  includeHidden: false,
  ignoreJunk: true,
  ignoreNames: [".DS_Store", "Thumbs.db", "desktop.ini"],
  ignorePrefixes: ["._"],
  ignorePathPrefixes: [
    ".git/",
    "node_modules/",
    ".Spotlight-V100/",
    ".Trashes/",
  ],
};

// Schema versions
export const SCHEMA_VERSIONS = {
  MERKLE_TREE: "merkle-bytes-tree@1",
  BLOCKCHAIN_PROOF: "merkle-blockchain-proof@1",
};

/**
 * Get filesystem-safe short name for blockchain from chain ID
 * @param {number} chainId - Chain ID
 * @returns {string} Short blockchain identifier (lowercase, filesystem-safe)
 */
export function getBlockchainShortName(chainId) {
  const mapping = {
    [NETWORK_IDS.ETHEREUM_MAINNET]: "ethereum",
    [NETWORK_IDS.ARBITRUM_ONE]: "arbitrum",
    [NETWORK_IDS.ARBITRUM_SEPOLIA]: "arbitrum-sepolia",
    [NETWORK_IDS.LOCAL_ANVIL]: "local",
    [NETWORK_IDS.OPTIMISM]: "optimism",
    [NETWORK_IDS.BASE]: "base",
  };
  return mapping[chainId] || `chain-${chainId}`;
}

