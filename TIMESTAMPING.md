# Blockchain Timestamping with Merkle Trees

## Overview

This application provides **blockchain timestamping** capabilities, allowing you to create cryptographic proofs that your files existed at a specific point in time. The application supports both Ethereum-based blockchains (Ethereum, Optimism, Arbitrum, Base) via smart contracts and Bitcoin via the [OpenTimestamps](https://opentimestamps.org/) protocol.

## What is Timestamping?

Timestamping is the process of proving that certain data existed at a specific point in time. In the context of this application:

1. **You generate a Merkle root** from your files/folders
2. **You commit this root to the blockchain** (Ethereum Mainnet, Optimism, Arbitrum One, Base, or Bitcoin)
3. **The blockchain provides immutable proof** that your data existed when the transaction was included in a block

This creates a **cryptographic proof** that cannot be forged or backdated, as it relies on the blockchain's consensus mechanism.

## Timestamping Methods

This application supports two different timestamping approaches:

### Ethereum-Based Chains (Smart Contracts)
- **Networks**: Ethereum Mainnet, Optimism, Arbitrum One, Base
- **Method**: Smart contract transactions
- **Requires**: Web3 wallet (MetaMask, etc.)
- **Confirmation**: Fast (~1-2 seconds for L2, ~12 seconds for Ethereum)
- **Cost**: Gas fees (low on L2, moderate on Ethereum mainnet)
- **Proof Format**: JSON files with transaction details

### Bitcoin (OpenTimestamps Protocol)
- **Network**: Bitcoin
- **Method**: OpenTimestamps calendar servers
- **Requires**: No wallet (uses public calendar servers)
- **Confirmation**: ~10 minutes (Bitcoin block time)
- **Cost**: Very low (aggregated into Bitcoin transactions)
- **Proof Format**: `.ots` binary files or JSON with embedded OTS data

## How It Works

### Step 1: Generate Merkle Tree

When you select a folder or file, the application:

1. **Hashes each file** using SHA-256
2. **Builds a Merkle tree** from these hashes
3. **Produces a single Merkle root** (32 bytes) that uniquely represents your entire folder

The Merkle root is deterministic - the same files will always produce the same root, regardless of when or where you generate it.

### Step 2: Commit to Blockchain

#### For Ethereum-Based Chains (Ethereum, Optimism, Arbitrum, Base)

When you click "Create Timestamp on [Blockchain Name]":

1. **Your wallet connects** to the selected blockchain (Ethereum Mainnet, Optimism, Arbitrum One, or Base)
2. **A transaction is sent** containing your Merkle root
3. **Transaction status is tracked** - you'll see "Transaction pending confirmation" with an animated loading indicator while waiting
4. **The transaction is included in a block** with a specific block number and timestamp
5. **Transaction is confirmed** - status changes to "Successfully committed"
6. **You receive a proof file** containing all the details needed to verify the timestamp, including blockchain name and metadata
7. **Explorer links become available** - view the transaction and contract on Etherscan, Optimistic Etherscan, Arbiscan, or Basescan

**Network Switching**: The app supports bidirectional network switching - if you change networks in MetaMask, the app updates automatically, and vice versa. When switching networks, the timestamping state is automatically reset to prevent confusion.

#### For Bitcoin (OpenTimestamps)

**Prerequisites**: The backend server must be running (`npm run backend`). Bitcoin timestamping requires a Node.js backend because the OpenTimestamps library cannot run directly in browsers.

When you click "Create Timestamp on Bitcoin":

1. **No wallet required** - Bitcoin timestamping uses public OpenTimestamps calendar servers
2. **Backend proxy** - Your Merkle root hash is sent to the backend server
3. **Initial stamp** - Backend submits your hash to OpenTimestamps pool servers (aggregation endpoints for faster processing)
4. **Receive `.ots` file** - You receive an initial OpenTimestamps proof file (binary format)
5. **Status: Pending** - The app shows "Pending" status while waiting for Bitcoin block inclusion
6. **Automatic polling** - The app automatically checks for upgrades with exponential backoff:
   - First check: 2 minutes
   - Second check: 5 minutes
   - Third check: 10 minutes
   - Subsequent checks: 20 minutes
7. **Upgrade process** - Backend queries calendar servers to upgrade the proof
8. **Status: Anchored** - Once included in a Bitcoin block (~10 minutes), status changes to "Anchored" with block height and hash
9. **Status: Confirmed** - After checking confirmations, status shows "Confirmed" with confirmation count
10. **Download proof** - Download the `.ots` file for verification using OpenTimestamps CLI tools

**Two-Step Process**: Bitcoin timestamping uses a two-step process:
- **Stamp**: Initial submission to pool servers (immediate, returns `.ots` file)
- **Upgrade**: Periodic checks with calendar servers until Bitcoin attestation is found (~10 minutes average)

**Status States:**
- **Pending**: Timestamp submitted, no Bitcoin attestation yet
- **Anchored**: Bitcoin block header attestation exists (includes block height and hash)
- **Confirmed**: Anchored + confirmations checked (shows confirmation count)

**Manual Check**: Use the "Check Upgrade" button to manually trigger an upgrade check without waiting for the automatic polling interval.

**Backend Architecture**: The backend server (`backend-server.js`) acts as a proxy:
- Uses the official `opentimestamps` npm package
- Handles stamping via pool servers (`/api/stamp` endpoint)
- Handles upgrading via calendar servers (`/api/upgrade` endpoint)
- Implements security: CORS, rate limiting, input validation, request timeouts
- Provides health check endpoint (`/api/health`)

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

| Feature | OpenTimestamps (Bitcoin) | Ethereum-Based Chains | This Application (Both) |
|---------|-------------------------|----------------------|------------------------|
| **Blockchain** | Bitcoin | Ethereum Mainnet, Optimism, Arbitrum One, Base | Both supported |
| **Cost** | Very low (aggregated) | Low (L2) or moderate (Ethereum) | Varies by chain |
| **Confirmation** | ~10 minutes | ~1-2 seconds (L2) or ~12 seconds (Ethereum) | Depends on chain |
| **Wallet Required** | No | Yes | Bitcoin: No, EVM: Yes |
| **Metadata** | Minimal | Rich (file count, sizes, etc.) | Rich for EVM, minimal for Bitcoin |
| **Proof Format** | `.ots` files | `.json` files | Both supported |
| **Verification** | Command-line tools | Web interface | Web interface + CLI tools |
| **Network Switching** | Single chain | Bidirectional sync with MetaMask | EVM: Yes, Bitcoin: N/A |
| **Transaction Status** | Basic | Real-time pending/confirmed states | Real-time for EVM, polling for Bitcoin |

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

**Bitcoin (OpenTimestamps):**
- **No wallet required**: Uses public OpenTimestamps calendar servers
- **Backend required**: Requires Node.js backend server (runs separately via `npm run backend`)
- **Very low cost**: Aggregated into Bitcoin transactions (essentially free)
- **Decentralized**: Relies on Bitcoin's security and OpenTimestamps calendar servers
- **Two-step process**: Initial stamp via pool servers, then upgrade via calendar servers
- **Status tracking**: Three states (pending → anchored → confirmed) with automatic polling
- **Exponential backoff**: Polling intervals increase (2m → 5m → 10m → 20m) to reduce server load
- **Standard format**: Uses OpenTimestamps `.ots` proof format (binary)
- **Verification**: Can be verified using OpenTimestamps command-line tools (`ots verify timestamp.ots`)
- **Block height confirmations**: Calculates confirmations using `tipHeight - blockHeight + 1`
- **Multiple API sources**: Uses `mempool.space` and `blockstream.info` with fallback for robustness

**Bidirectional Network Switching (EVM Chains Only):**
- The app automatically syncs with MetaMask network changes
- Users can switch networks from either the app or MetaMask
- Contract addresses are automatically selected based on the connected network
- Bitcoin selection doesn't require wallet connection

## Proof File Format

### Ethereum-Based Chains

After creating a timestamp on an Ethereum-based chain, you receive a proof file (e.g., `merkle-proof-ethereum-20240101-a1b2c3d4.json`) with this structure. The filename includes the blockchain name to prevent conflicts when the same Merkle root is committed to multiple chains:

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

**Bitcoin Proof Files:**

Bitcoin timestamps use the standard OpenTimestamps `.ots` binary format. The app downloads the `.ots` file directly, which can be verified using OpenTimestamps command-line tools.

**Verification:**
```bash
# Install OpenTimestamps CLI tools
pip install opentimestamps-client

# Verify a timestamp
ots verify timestamp.ots
```

**`.ots` File Format:**
- Binary format following OpenTimestamps protocol specification
- Contains Merkle tree structure linking your hash to Bitcoin block headers
- Includes attestations from calendar servers
- Can be upgraded independently using `ots upgrade timestamp.ots`

**Note**: The app no longer generates JSON proof files for Bitcoin timestamps. Only the `.ots` binary file is provided, which is the standard format for OpenTimestamps verification.

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

### Bitcoin OpenTimestamps Implementation

#### Backend Architecture

The Bitcoin timestamping feature uses a **backend proxy architecture** due to browser limitations:

**Frontend (`src/lib/opentimestamps.js`):**
- Client-side library that communicates with backend API
- Handles retry logic with exponential backoff for connection errors
- Implements health checks with caching (10-second TTL)
- Provides status tracking and error handling

**Backend (`backend-server.js`):**
- Express.js server using official `opentimestamps` npm package
- **Stamp endpoint** (`POST /api/stamp`):
  - Receives 32-byte Merkle root (hex string)
  - Creates `DetachedTimestampFile` using `OpenTimestamps.DetachedTimestampFile.fromHash()`
  - Submits to pool servers with `m: 2` (minimum 2 successful submissions)
  - Returns `.ots` file as byte array
  - Validates no double-hashing (ensures digest is timestamped directly)
- **Upgrade endpoint** (`POST /api/upgrade`):
  - Receives `.ots` file (byte array)
  - Deserializes using `OpenTimestamps.DetachedTimestampFile.deserialize()`
  - Calls `OpenTimestamps.upgrade()` with calendar servers
  - Checks for Bitcoin attestations using `instanceof BitcoinBlockHeaderAttestation`
  - Returns upgraded `.ots` file and attestation status
- **Health endpoint** (`GET /api/health`): Simple health check

#### Status Detection

**Bitcoin Attestation Detection:**
- Primary: Uses `instanceof OpenTimestamps.Notary.BitcoinBlockHeaderAttestation`
- Fallback: Checks for Bitcoin-specific fields (`blockHash` or `header` AND `height`)
- Avoids fragile `constructor.name` checks (minification-safe)

**Confirmation Calculation:**
- Uses block height: `confirmations = tipHeight - blockHeight + 1`
- Fetches tip height from multiple sources (`mempool.space`, `blockstream.info`)
- Uses `Promise.any` with timeouts for robustness
- Caches tip height for 45 seconds to reduce API calls

#### Polling Mechanism

**Exponential Backoff with Jitter:**
- Initial delay: 2 minutes
- Subsequent delays: 5m, 10m, 20m
- Prevents hammering calendar servers
- Automatically pauses if backend is unavailable

**Polling States:**
- **Active**: When status is `pending` or `anchored`
- **Paused**: When backend is unavailable or status is `confirmed`
- **Manual**: User can trigger immediate check via "Check Upgrade" button

#### Security Features

**No Double-Hashing:**
- Merkle root (32-byte SHA-256 digest) is timestamped directly
- Uses `fromHash()` constructor, not `fromBytes()` (which would re-hash)
- Validated on backend to ensure digest matches provided Merkle root

**Input Validation:**
- Hex string format validation (64 characters, valid hex)
- OTS file format validation (magic bytes: `00 4f 70 65 6e 54 69 6d 65 73 74 61 6d 70 73`)
- Array size limits (max 1MB)
- Request size limits (1MB JSON payloads)

**Error Handling:**
- Retry logic with exponential backoff for transient failures
- Health checks before critical operations
- Graceful degradation when backend is unavailable
- User-friendly error messages

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
- **Bitcoin**: Essentially free (aggregated into Bitcoin transactions via OpenTimestamps calendar servers)
- **Arbitrum One**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Optimism**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Base**: Typically $0.01-$0.10 per timestamp (L2 fees)
- **Ethereum Mainnet**: Typically $1-$10 per timestamp (mainnet fees)

All networks are much cheaper than traditional notarization services. Bitcoin is the most cost-effective option, though it requires waiting ~10 minutes for confirmation.

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
- **Ethereum-based chains**: Checking the contract on Etherscan (Ethereum), Optimistic Etherscan (Optimism), Arbiscan (Arbitrum), or Basescan (Base)
- **Bitcoin**: Using OpenTimestamps command-line tools: `ots verify timestamp.ots`
- **All chains**: Regenerating the Merkle root using any compatible tool and comparing the roots

### Q: Do I need a wallet for Bitcoin timestamping?

A: No! Bitcoin timestamping uses OpenTimestamps calendar servers and doesn't require a wallet connection. However, you **do need to run the backend server** (`npm run backend`) because the OpenTimestamps library requires Node.js and cannot run directly in browsers. Simply select "Bitcoin" from the network dropdown and create your timestamp. The backend server handles communication with OpenTimestamps calendar servers.

### Q: Why does Bitcoin timestamping require a backend server?

A: The official `opentimestamps` JavaScript library requires Node.js and cannot run in browsers. Additionally, calendar servers may have CORS restrictions. The backend server acts as a proxy, handling all OpenTimestamps operations securely with rate limiting and input validation.

### Q: What are the status states for Bitcoin timestamps?

A: Bitcoin timestamps have three states:
- **Pending**: Timestamp submitted to calendar server, waiting for Bitcoin block inclusion (~10 minutes)
- **Anchored**: Timestamp included in a Bitcoin block (shows block height and hash)
- **Confirmed**: Anchored + confirmations checked (shows confirmation count)

### Q: How does the automatic polling work?

A: The app automatically checks for upgrades with exponential backoff to reduce server load:
- First check: 2 minutes after stamp
- Second check: 5 minutes after first check
- Third check: 10 minutes after second check
- Subsequent checks: 20 minutes apart

You can also manually check using the "Check Upgrade" button.

## Further Reading

- [OpenTimestamps Documentation](https://opentimestamps.org/)
- [Merkle Trees Explained](https://en.wikipedia.org/wiki/Merkle_tree)
- [Ethereum Documentation](https://ethereum.org/en/developers/docs/)
- [Arbitrum Documentation](https://docs.arbitrum.io/)
- [Blockchain Timestamping Concepts](https://en.wikipedia.org/wiki/Trusted_timestamping)

## Support

For questions or issues, please refer to the main [README.md](README.md) or open an issue in the project repository.

