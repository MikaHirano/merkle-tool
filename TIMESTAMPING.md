# Blockchain Timestamping with Merkle Trees

## Overview

This application provides **blockchain timestamping** capabilities, allowing you to create cryptographic proofs that your files existed at a specific point in time. This is inspired by [OpenTimestamps](https://opentimestamps.org/), a decentralized timestamping protocol, but implemented using Arbitrum blockchain for enhanced security and decentralization.

## What is Timestamping?

Timestamping is the process of proving that certain data existed at a specific point in time. In the context of this application:

1. **You generate a Merkle root** from your files/folders
2. **You commit this root to the blockchain** (Arbitrum)
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

When you click "Create Timestamp on Arbitrum One":

1. **Your wallet connects** to the Arbitrum blockchain
2. **A transaction is sent** containing your Merkle root
3. **The transaction is included in a block** with a specific block number and timestamp
4. **You receive a proof file** containing all the details needed to verify the timestamp

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
| **Blockchain** | Bitcoin | Arbitrum (Ethereum L2) |
| **Cost** | Very low (aggregated) | Low (L2 gas fees) |
| **Confirmation** | ~10 minutes | ~1-2 seconds |
| **Metadata** | Minimal | Rich (file count, sizes, etc.) |
| **Proof Format** | `.ots` files | `.json` files |
| **Verification** | Command-line tools | Web interface |

### Why Arbitrum?

Arbitrum was chosen for this implementation because:

- **Fast confirmations**: Transactions are confirmed in seconds, not minutes
- **Low cost**: L2 fees are significantly lower than Ethereum mainnet
- **Ethereum compatibility**: Uses the same security model as Ethereum
- **Rich metadata**: Can store additional information about your commitment
- **Accessibility**: Easy to interact with via web wallets like MetaMask

## Proof File Format

After creating a timestamp, you receive a proof file (e.g., `merkle-proof-20240101-a1b2c3d4.json`) with this structure:

```json
{
  "schema": "merkle-blockchain-proof@1",
  "merkleRoot": "0xa1b2c3d4...",
  "transaction": {
    "hash": "0x1234...",
    "blockNumber": 12345678,
    "blockHash": "0xabcd...",
    "chainId": 42161,
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
    "contractUrl": "https://arbiscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4",
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

✅ **Proof of existence** at a specific time  
✅ **Tamper-proof** records (cannot be altered after commitment)  
✅ **Publicly verifiable** proofs  
✅ **Decentralized** (no single point of failure)  

### What It Does NOT Provide

❌ **Proof of authorship** (anyone can commit a root)  
❌ **File encryption** (your files remain unencrypted)  
❌ **File storage** (only the Merkle root is stored)  
❌ **Privacy** (the Merkle root is public on the blockchain)  

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

The `MerkleRootRegistry` contract on Arbitrum:

- **Stores commitments** with block number and timestamp
- **Prevents duplicates** - Each root can only be committed once
- **Allows metadata updates** - Original committer can update metadata
- **Efficient lookups** - O(1) checks for commitment existence

Contract Address: [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://arbiscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

## Frequently Asked Questions

### Q: How much does it cost?

A: The cost depends on Arbitrum gas fees, typically $0.01-$0.10 per timestamp. This is much cheaper than traditional notarization services.

### Q: Can I timestamp individual files?

A: Yes! You can timestamp a single file, and it will create a Merkle tree with just one leaf.

### Q: What if I modify my files after timestamping?

A: Modified files will produce a different Merkle root. Your original timestamp remains valid for the original files. You can create a new timestamp for the modified version.

### Q: How long are timestamps valid?

A: As long as the Arbitrum blockchain exists, your timestamps are valid. The blockchain provides permanent, immutable records.

### Q: Can I delete my timestamp?

A: No. Once committed to the blockchain, timestamps cannot be deleted. This is a feature, not a bug - it ensures permanence.

### Q: Is my data private?

A: Your actual files are never uploaded. Only the Merkle root (a 32-byte hash) is committed to the blockchain. However, the root is publicly visible.

### Q: Can I verify timestamps without the app?

A: Yes! You can verify timestamps by:
- Checking the contract on Arbiscan
- Regenerating the Merkle root using any compatible tool
- Comparing the roots

## Further Reading

- [OpenTimestamps Documentation](https://opentimestamps.org/)
- [Merkle Trees Explained](https://en.wikipedia.org/wiki/Merkle_tree)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [Blockchain Timestamping Concepts](https://en.wikipedia.org/wiki/Trusted_timestamping)

## Support

For questions or issues, please refer to the main [README.md](README.md) or open an issue in the project repository.

