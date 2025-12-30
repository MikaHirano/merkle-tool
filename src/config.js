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
    42161: import.meta.env.VITE_CONTRACT_ADDRESS_ARBITRUM_ONE || "0xA095c28448186ACC0e950A17b96879394f89C5B4", // Arbitrum One (Mainnet)
    421614: import.meta.env.VITE_CONTRACT_ADDRESS_ARBITRUM_SEPOLIA || null, // Arbitrum Sepolia
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
    42161: import.meta.env.VITE_RPC_URL_ARBITRUM_ONE || "https://arb1.arbitrum.io/rpc",
    421614: import.meta.env.VITE_RPC_URL_ARBITRUM_SEPOLIA || "https://sepolia-rollup.arbitrum.io/rpc",
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
  const supportedNetworks = [42161, 421614, 31337]; // Arbitrum One, Sepolia, Local
  return supportedNetworks.includes(chainId);
}

