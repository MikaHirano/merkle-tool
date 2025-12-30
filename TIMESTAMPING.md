# Blockchain Timestamping with Merkle Trees

## Overview

This application provides **blockchain timestamping** capabilities, allowing you to create cryptographic proofs that your files existed at a specific point in time. This is inspired by [OpenTimestamps](https://opentimestamps.org/), a decentralized timestamping protocol, but implemented using Ethereum and Arbitrum blockchains for enhanced security and decentralization.

## What is Timestamping?

Timestamping is the process of proving that certain data existed at a specific point in time. In the context of this application:

1. **You generate a Merkle root** from your files/folders
2. **You commit this root to the blockchain** (Ethereum Mainnet or Arbitrum)
3. **The blockchain provides immutable proof** that your data existed when the transaction was included in a block

This creates a **cryptographic proof** that cannot be forged or backdated, as it relies on the blockchain's consensus mechanism.

## How It Works

### Step 1: Generate Merkle Tree

When you select a folder or file, the application:

1. **Hashes each file** using SHA-256
2. **Builds a Merkle tree** from these hashes
3. **Produces a single Merkle root** (32 bytes) that uniquely represents your entire folder

The Merkle root is deterministic - the same files will always produce the same root, regardless of when or where you generate it.

### Step 2: Commit to Blockchain

When you click "Create Timestamp on [Blockchain Name]":

1. **Your wallet connects** to the selected blockchain (Ethereum Mainnet, Optimism, Arbitrum One, or Base)
2. **A transaction is sent** containing your Merkle root
3. **Transaction status is tracked** - you'll see "Transaction pending confirmation" with an animated loading indicator while waiting
4. **The transaction is included in a block** with a specific block number and timestamp
5. **Transaction is confirmed** - status changes to "Successfully committed"
6. **You receive a proof file** containing all the details needed to verify the timestamp, including blockchain name and metadata
7. **Explorer links become available** - view the transaction and contract on Etherscan, Optimistic Etherscan, Arbiscan, or Basescan

**Network Switching**: The app supports bidirectional network switching - if you change networks in MetaMask, the app updates automatically, and vice versa. When switching networks, the timestamping state is automatically reset to prevent confusion.

### Step 3: Verification

Anyone can verify your timestamp by:

1. **Regenerating the Merkle root** from your files
2. **Checking the blockchain** to see if that root was committed
3. **Verifying the block timestamp** to confirm when it was committed

## Comparison with OpenTimestamps

This application shares core concepts with [OpenTimestamps](https://opentimestamps.org/):

### Similarities

- **Merkle Tree Structure**: Both use Merkle trees to efficiently commit multiple files
- **Cryptographic Proofs**: Both create proofs that can be verified independently
- **Decentralization**: Both rely on decentralized systems (Bitcoin blockchain vs Arbitrum blockchain)
- **Privacy**: Neither requires uploading your actual files - only the Merkle root is committed

### Differences

| Feature | OpenTimestamps | This Application |
|---------|---------------|------------------|
| **Blockchain** | Bitcoin | Ethereum Mainnet, Optimism, Arbitrum One, Base (Ethereum L2) |
| **Cost** | Very low (aggregated) | Low (L2 gas fees) or moderate (Ethereum mainnet) |
| **Confirmation** | ~10 minutes | ~1-2 seconds (L2) or ~12 seconds (Ethereum) |
| **Metadata** | Minimal | Rich (file count, sizes, etc.) |
| **Proof Format** | `.ots` files | `.json` files |
| **Verification** | Command-line tools | Web interface |
| **Network Switching** | Single chain | Bidirectional sync with MetaMask |
| **Transaction Status** | Basic | Real-time pending/confirmed states |

### Multi-Chain Support

This application supports multiple networks:

**Ethereum Mainnet:**
- **Maximum security**: Directly secured by Ethereum's consensus mechanism
- **Highest decentralization**: Full Ethereum validator set
- **Standard fees**: Higher gas costs but maximum security guarantees
- **Universal compatibility**: Works with all Ethereum tooling

**Optimism (L2):**
- **Fast confirmations**: Transactions are confirmed in seconds
- **Low cost**: L2 fees are significantly lower than Ethereum mainnet
- **Ethereum compatibility**: Uses the same security model as Ethereum
- **OP Stack**: Built on the OP Stack for scalability

**Arbitrum One (L2):**
- **Fast confirmations**: Transactions are confirmed in seconds, not minutes
- **Low cost**: L2 fees are significantly lower than Ethereum mainnet
- **Ethereum compatibility**: Uses the same security model as Ethereum
- **Rich metadata**: Can store additional information about your commitment
- **Accessibility**: Easy to interact with via web wallets like MetaMask

**Base (L2):**
- **Fast confirmations**: Transactions are confirmed in seconds
- **Low cost**: L2 fees are significantly lower than Ethereum mainnet
- **Ethereum compatibility**: Uses the same security model as Ethereum
- **Coinbase integration**: Built by Coinbase on the OP Stack

**Bidirectional Network Switching:**
- The app automatically syncs with MetaMask network changes
- Users can switch networks from either the app or MetaMask
- Contract addresses are automatically selected based on the connected network

## Proof File Format

After creating a timestamp, you receive a proof file (e.g., `merkle-proof-ethereum-20240101-a1b2c3d4.json`) with this structure. The filename includes the blockchain name to prevent conflicts when the same Merkle root is committed to multiple chains:

```json
{
  "schema": "merkle-blockchain-proof@1",
  "merkleRoot": "0xa1b2c3d4...",
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

**Example for Arbitrum One (chainId: 42161):**
```json
{
  "schema": "merkle-blockchain-proof@1",
  "merkleRoot": "0xa1b2c3d4...",
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

## Use Cases

### 1. Intellectual Property Protection

Prove that you created a work (code, document, design) before a certain date:

- **Before**: "I wrote this code in January"
- **After**: "I can prove I wrote this code in January - here's the blockchain timestamp"

### 2. Legal Documentation

Create tamper-proof timestamps for legal documents:

- Contracts
- Agreements
- Evidence files
- Compliance records

### 3. Version Control

Prove the existence of specific file versions:

- Software releases
- Document revisions
- Configuration snapshots

### 4. Audit Trails

Create immutable audit trails for:

- Financial records
- System logs
- Compliance documentation

### 5. Notarization Alternative

Use blockchain timestamping as a cost-effective alternative to traditional notarization for digital documents.

## Security Considerations

### What Blockchain Timestamping Provides

**YES: Proof of existence** at a specific time  
**YES: Tamper-proof** records (cannot be altered after commitment)  
**YES: Publicly verifiable** proofs  
**YES: Decentralized** (no single point of failure)  

### What It Does NOT Provide

**NO: Proof of authorship** (anyone can commit a root)  
**NO: File encryption** (your files remain unencrypted)  
**NO: File storage** (only the Merkle root is stored)  
**NO: Privacy** (the Merkle root is public on the blockchain)  

### Best Practices

1. **Keep your proof files safe** - They're your only proof of timestamp
2. **Store your original files** - The proof is useless without the files
3. **Verify periodically** - Check that your timestamps are still valid
4. **Use strong file organization** - Consistent folder structure ensures reproducible roots

## Verification Process

### Verifying Your Own Timestamp

1. **Load your proof file** or enter the Merkle root
2. **Select the same folder** you originally timestamped
3. **Click "Verify Folder"** - The app will:
   - Regenerate the Merkle root
   - Compare it with the committed root
   - Show verification results

### Verifying Someone Else's Timestamp

1. **Get their proof file** or Merkle root
2. **Get their original files** (if they share them)
3. **Regenerate the Merkle root** from their files
4. **Check the blockchain** using the contract address and transaction hash
5. **Verify the root matches** what was committed

## Technical Details

### Merkle Tree Construction

The application uses a specific Merkle tree construction:

- **Content Hash**: `SHA256(fileBytes)` - Hash of each file's content
- **Leaf Hash**: `SHA256("leaf\0" + contentHashBytes)` - Hash with prefix
- **Node Hash**: `SHA256("node\0" + leftNode + rightNode)` - Internal nodes
- **Ordering**: Leaves sorted lexicographically by hex representation
- **Odd Nodes**: Last node duplicated when odd number of leaves

This ensures:
- **Deterministic roots** - Same files always produce same root
- **Efficient verification** - Can verify individual files without full tree
- **Standard format** - Compatible with common Merkle tree implementations

### Smart Contract

The `MerkleRootRegistry` contract is deployed on multiple networks:

- **Stores commitments** with block number and timestamp
- **Prevents duplicates** - Each root can only be committed once
- **Allows metadata updates** - Original committer can update metadata
- **Efficient lookups** - O(1) checks for commitment existence

**Contract Addresses:**
- **Ethereum Mainnet**: [`0xE1DEb3c75b5c32D672ac8287010C231f4C15033b`](https://etherscan.io/address/0xE1DEb3c75b5c32D672ac8287010C231f4C15033b)
- **Optimism**: [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://optimistic.etherscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)
- **Arbitrum One**: [`0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E`](https://arbiscan.io/address/0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E)
- **Base**: [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://basescan.org/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

## Frequently Asked Questions

### Q: How much does it cost?

A: The cost depends on the network:
- **Arbitrum One**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Optimism**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Base**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Ethereum Mainnet**: Typically $1-$10 per timestamp (mainnet fees)

All networks are much cheaper than traditional notarization services.

### Q: Can I timestamp individual files?

A: Yes! You can timestamp a single file, and it will create a Merkle tree with just one leaf.

### Q: What if I modify my files after timestamping?

A: Modified files will produce a different Merkle root. Your original timestamp remains valid for the original files. You can create a new timestamp for the modified version.

### Q: How long are timestamps valid?

A: As long as the blockchain exists (Ethereum or Arbitrum), your timestamps are valid. The blockchain provides permanent, immutable records.

### Q: Can I delete my timestamp?

A: No. Once committed to the blockchain, timestamps cannot be deleted. This is a feature, not a bug - it ensures permanence.

### Q: Is my data private?

A: Your actual files are never uploaded. Only the Merkle root (a 32-byte hash) is committed to the blockchain. However, the root is publicly visible.

### Q: Can I verify timestamps without the app?

A: Yes! You can verify timestamps by:
- Checking the contract on Etherscan (Ethereum), Optimistic Etherscan (Optimism), Arbiscan (Arbitrum), or Basescan (Base)
- Regenerating the Merkle root using any compatible tool
- Comparing the roots

## Further Reading

- [OpenTimestamps Documentation](https://opentimestamps.org/)
- [Merkle Trees Explained](https://en.wikipedia.org/wiki/Merkle_tree)
- [Ethereum Documentation](https://ethereum.org/en/developers/docs/)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [Blockchain Timestamping Concepts](https://en.wikipedia.org/wiki/Trusted_timestamping)

## Support

For questions or issues, please refer to the main [README.md](README.md) or open an issue in the project repository.

