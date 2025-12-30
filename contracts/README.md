# MerkleRootRegistry Smart Contract

This directory contains the smart contract for committing Merkle roots to Ethereum, Optimism, Arbitrum, and Base blockchains for timestamping purposes.

## Contract Overview

The `MerkleRootRegistry` contract allows users to:
- Commit Merkle roots to the blockchain with associated metadata
- Verify if a Merkle root has been committed
- Retrieve commitment details and metadata
- Update metadata for existing commitments (committer only)

## Contract Addresses

**Ethereum Mainnet:** [`0xE1DEb3c75b5c32D672ac8287010C231f4C15033b`](https://etherscan.io/address/0xE1DEb3c75b5c32D672ac8287010C231f4C15033b)

**Optimism:** [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://optimistic.etherscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

**Arbitrum One (Mainnet):** [`0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E`](https://arbiscan.io/address/0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E)

**Base:** [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://basescan.org/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

## Deployment Instructions

### Prerequisites

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation)
2. Set up your environment variables

### 1. Install Dependencies

```bash
forge install
```

### 2. Run Tests

```bash
forge test
```

### 3. Deploy to Ethereum Mainnet

```bash
# Deploy to Ethereum Mainnet
forge create --rpc-url https://eth.llamarpc.com \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_etherscan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 4. Deploy to Optimism (Mainnet)

```bash
# Deploy to Optimism Mainnet
forge create --rpc-url https://mainnet.optimism.io \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_optimistic_etherscan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 5. Deploy to Arbitrum One (Mainnet)

```bash
# Deploy to Arbitrum One Mainnet
forge create --rpc-url https://arb1.arbitrum.io/rpc \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_arbiscan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 6. Deploy to Base (Mainnet)

```bash
# Deploy to Base Mainnet
forge create --rpc-url https://mainnet.base.org \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_basescan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 8. Update Contract Address

After deployment, update the contract address in:
- `src/config.js` - Update the default address for the respective network

## Contract Functions

### `commitMerkleRoot(bytes32 merkleRoot, string metadata)`

Commits a Merkle root to the blockchain with associated metadata.

**Parameters:**
- `merkleRoot`: The Merkle root hash to commit
- `metadata`: JSON string containing metadata (file count, size, etc.)

**Events:** Emits `MerkleRootCommitted`

### `getCommitment(bytes32 merkleRoot)`

Retrieves commitment details for a Merkle root.

**Returns:** Commitment struct with all details

### `isCommitted(bytes32 merkleRoot)`

Checks if a Merkle root has been committed.

**Returns:** `bool`

### `getUserCommitments(address user)`

Gets all Merkle roots committed by a user.

**Returns:** Array of Merkle roots

### `updateMetadata(bytes32 merkleRoot, string newMetadata)`

Updates metadata for an existing commitment (only by committer).

**Parameters:**
- `merkleRoot`: The Merkle root whose metadata to update
- `newMetadata`: The new metadata string

## Proof File Format

After committing, users receive a proof file with the following structure:

**Example for Ethereum Mainnet (chainId: 1):**
```json
{
  "schema": "merkle-blockchain-proof@1",
  "merkleRoot": "a1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 1,
    "contractAddress": "0xE1DEb3c75b5c32D672ac8287010C231f4C15033b",
    "gasUsed": "21000",
    "timestamp": 1703123456789
  },
  "committer": "0x9abc...",
  "metadata": {
    "fileCount": 42,
    "totalBytes": 1048576,
    "generatedAt": "2024-01-01T12:00:00.000Z",
    "schema": "merkle-bytes-tree@1"
  },
  "verification": {
    "contractUrl": "https://etherscan.io/address/0xE1DEb3c75b5c32D672ac8287010C231f4C15033b",
    "transactionUrl": "https://etherscan.io/tx/0x1234..."
  }
}
```

**Example for Optimism (chainId: 10):**
```json
{
  "schema": "merkle-blockchain-proof@1",
  "blockchain": "Optimism",
  "blockchainId": 10,
  "blockchainExplorer": "Optimistic Etherscan",
  "merkleRoot": "a1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 10,
    "contractAddress": "0xA095c28448186ACC0e950A17b96879394f89C5B4",
    "gasUsed": "21000",
    "timestamp": 1703123456789
  },
  "committer": "0x9abc...",
  "metadata": {
    "fileCount": 42,
    "totalBytes": 1048576,
    "generatedAt": "2024-01-01T12:00:00.000Z",
    "schema": "merkle-bytes-tree@1"
  },
  "verification": {
    "contractUrl": "https://optimistic.etherscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4",
    "transactionUrl": "https://optimistic.etherscan.io/tx/0x1234..."
  }
}
```

**Example for Arbitrum One (chainId: 42161):**
```json
{
  "schema": "merkle-blockchain-proof@1",
  "blockchain": "Arbitrum One",
  "blockchainId": 42161,
  "blockchainExplorer": "Arbiscan",
  "merkleRoot": "a1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 42161,
    "contractAddress": "0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E",
    "gasUsed": "21000",
    "timestamp": 1703123456789
  },
  "committer": "0x9abc...",
  "metadata": {
    "fileCount": 42,
    "totalBytes": 1048576,
    "generatedAt": "2024-01-01T12:00:00.000Z",
    "schema": "merkle-bytes-tree@1"
  },
  "verification": {
    "contractUrl": "https://arbiscan.io/address/0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E",
    "transactionUrl": "https://arbiscan.io/tx/0x1234..."
  }
}
```

**Example for Base (chainId: 8453):**
```json
{
  "schema": "merkle-blockchain-proof@1",
  "blockchain": "Base",
  "blockchainId": 8453,
  "blockchainExplorer": "Basescan",
  "merkleRoot": "a1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 8453,
    "contractAddress": "0xA095c28448186ACC0e950A17b96879394f89C5B4",
    "gasUsed": "21000",
    "timestamp": 1703123456789
  },
  "committer": "0x9abc...",
  "metadata": {
    "fileCount": 42,
    "totalBytes": 1048576,
    "generatedAt": "2024-01-01T12:00:00.000Z",
    "schema": "merkle-bytes-tree@1"
  },
  "verification": {
    "contractUrl": "https://basescan.org/address/0xA095c28448186ACC0e950A17b96879394f89C5B4",
    "transactionUrl": "https://basescan.org/tx/0x1234..."
  }
}
```

## Security Considerations

- Only the committer can update metadata for their commitments
- Merkle roots can only be committed once
- Contract uses OpenZeppelin-inspired patterns but should be audited before mainnet deployment
- Gas costs should be monitored for large metadata strings

## Testing

Run the test suite:

```bash
forge test -v
```

Tests include:
- Basic commitment functionality
- Metadata updates
- Duplicate commitment prevention
- Access control validation
