# MerkleRootRegistry Smart Contract

This directory contains the smart contract for committing Merkle roots to the Arbitrum blockchain for timestamping purposes.

## Contract Overview

The `MerkleRootRegistry` contract allows users to:
- Commit Merkle roots to the blockchain with associated metadata
- Verify if a Merkle root has been committed
- Retrieve commitment details and metadata
- Update metadata for existing commitments (committer only)

## Contract Address

**Arbitrum One (Mainnet):** [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://arbiscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

**Arbitrum Sepolia (Testnet):** `0x0000000000000000000000000000000000000000` (To be deployed)

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

### 3. Deploy to Arbitrum Sepolia (Testnet)

```bash
# Set your private key (NEVER commit this!)
export PRIVATE_KEY=your_private_key_here

# Deploy to Sepolia
forge create --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_arbiscan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 4. Deploy to Arbitrum One (Mainnet)

```bash
# Deploy to Mainnet
forge create --rpc-url https://arb1.arbitrum.io/rpc \
    --private-key $PRIVATE_KEY \
    --etherscan-api-key your_arbiscan_api_key \
    --verify \
    contracts/MerkleRootRegistry.sol:MerkleRootRegistry
```

### 5. Update Contract Address

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

```json
{
  "schema": "merkle-blockchain-proof@1",
  "merkleRoot": "a1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 42161,
    "contractAddress": "0x5678...",
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
    "contractUrl": "https://arbiscan.io/address/0x5678...",
    "transactionUrl": "https://arbiscan.io/tx/0x1234..."
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
