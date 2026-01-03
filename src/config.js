/**
 * Application configuration
 * Centralizes environment variables and configuration values
 */

/**
 * Get contract address for a given network
 * @param {number} chainId - The chain ID
 * @returns {string|null} Contract address or null if not configured
 */
export function getContractAddress(chainId) {
  // Use environment variables if available, otherwise fallback to defaults
  const envVar = import.meta.env[`VITE_CONTRACT_ADDRESS_${chainId}`];
  if (envVar) return envVar;

  // Default addresses (can be overridden via .env)
  const defaults = {
    1: import.meta.env.VITE_CONTRACT_ADDRESS_ETHEREUM_MAINNET || "0xE1DEb3c75b5c32D672ac8287010C231f4C15033b", // Ethereum Mainnet
    10: import.meta.env.VITE_CONTRACT_ADDRESS_OPTIMISM || "0xA095c28448186ACC0e950A17b96879394f89C5B4", // Optimism
    42161: import.meta.env.VITE_CONTRACT_ADDRESS_ARBITRUM_ONE || "0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E", // Arbitrum One (Mainnet)
    421614: import.meta.env.VITE_CONTRACT_ADDRESS_ARBITRUM_SEPOLIA || null, // Arbitrum Sepolia
    8453: import.meta.env.VITE_CONTRACT_ADDRESS_BASE || "0xA095c28448186ACC0e950A17b96879394f89C5B4", // Base
    324: import.meta.env.VITE_CONTRACT_ADDRESS_ZKSYNC_ERA || "0xA095c28448186ACC0e950A17b96879394f89C5B4", // ZkSync Era
    31337: import.meta.env.VITE_CONTRACT_ADDRESS_LOCAL || "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Local Anvil
  };

  return defaults[chainId] || null;
}

/**
 * Get RPC endpoint for a given network
 * @param {number} chainId - The chain ID
 * @returns {string|null} RPC URL or null if not configured
 */
export function getRpcUrl(chainId) {
  const envVar = import.meta.env[`VITE_RPC_URL_${chainId}`];
  if (envVar) return envVar;

  const defaults = {
    1: import.meta.env.VITE_RPC_URL_ETHEREUM_MAINNET || "https://eth.llamarpc.com",
    10: import.meta.env.VITE_RPC_URL_OPTIMISM || "https://mainnet.optimism.io",
    42161: import.meta.env.VITE_RPC_URL_ARBITRUM_ONE || "https://arb1.arbitrum.io/rpc",
    421614: import.meta.env.VITE_RPC_URL_ARBITRUM_SEPOLIA || "https://sepolia-rollup.arbitrum.io/rpc",
    8453: import.meta.env.VITE_RPC_URL_BASE || "https://mainnet.base.org",
    324: import.meta.env.VITE_RPC_URL_ZKSYNC_ERA || "https://mainnet.era.zksync.io",
    31337: import.meta.env.VITE_RPC_URL_LOCAL || "http://127.0.0.1:8545",
  };

  return defaults[chainId] || null;
}

/**
 * Check if a network is supported
 * @param {number} chainId - The chain ID
 * @returns {boolean} True if supported
 */
export function isSupportedNetwork(chainId) {
  const supportedNetworks = [1, 10, 42161, 421614, 8453, 324, 31337]; // Ethereum Mainnet, Optimism, Arbitrum One, Sepolia, Base, ZkSync Era, Local
  return supportedNetworks.includes(chainId);
}

