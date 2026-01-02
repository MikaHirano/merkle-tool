/**
 * Mempool.space API Integration
 * Provides functionality to check Bitcoin transaction status in mempool
 */

/**
 * Check mempool status for a Bitcoin transaction
 * @param {string} txHash - Bitcoin transaction hash
 * @returns {Promise<{inMempool: boolean, confirmations?: number, blockHeight?: number, mempoolPosition?: string, error?: string}>}
 */
export async function checkMempoolStatus(txHash) {
  try {
    const response = await fetch(`https://mempool.space/api/tx/${txHash}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { inMempool: false };
      }
      throw new Error(`Mempool API error: ${response.status} ${response.statusText}`);
    }
    
    const txData = await response.json();
    
    return {
      inMempool: true,
      confirmed: txData.status?.confirmed || false,
      confirmations: txData.status?.confirmed ? (txData.status.block_height ? 1 : 0) : 0,
      blockHeight: txData.status?.block_height || null,
      blockHash: txData.status?.block_hash || null,
      mempoolPosition: txData.status?.confirmed ? null : 'pending',
      fee: txData.fee || null,
      size: txData.size || null,
    };
  } catch (error) {
    return { 
      inMempool: false, 
      error: error.message 
    };
  }
}

/**
 * Get transaction URL on mempool.space
 * @param {string} txHash - Bitcoin transaction hash
 * @returns {string} URL to transaction on mempool.space
 */
export function getMempoolTxUrl(txHash) {
  return `https://mempool.space/tx/${txHash}`;
}

/**
 * Get block URL on mempool.space
 * @param {string} blockHash - Bitcoin block hash
 * @returns {string} URL to block on mempool.space
 */
export function getMempoolBlockUrl(blockHash) {
  return `https://mempool.space/block/${blockHash}`;
}

