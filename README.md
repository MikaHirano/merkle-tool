# Merkle Tool

A web-based tool for generating and verifying Merkle trees from files and folders using SHA-256 cryptographic hashing. Built with React and Vite, this tool provides local-only, client-side processing for secure file integrity verification and **blockchain timestamping** on Ethereum, Optimism, Arbitrum, Base, and Bitcoin.

## Blockchain Timestamping

Create immutable timestamps of your files on Ethereum, Optimism, Arbitrum, Base, and Bitcoin blockchains! This feature supports both Ethereum-based smart contracts and Bitcoin via the [OpenTimestamps](https://opentimestamps.org/) protocol, allowing you to prove that your files existed at a specific point in time. See [TIMESTAMPING.md](TIMESTAMPING.md) for detailed documentation.

## Features

### Merkle Tree Generation
- **Folder Processing**: Generate Merkle roots from entire directory structures
- **Single File Hashing**: Compute SHA-256 hashes for individual files
- **Configurable Policies**: Control which files to include/exclude (hidden files, system files, etc.)
- **JSON Output**: Export complete Merkle tree data for verification
- **Large File Support**: Stream-based hashing for files of any size without memory limitations
- **Progress Tracking**: Real-time progress indicators with time estimation for long-running operations
- **Cancellation**: Stop processing at any time with graceful cancellation handling

### File Verification
- **Folder Verification**: Recompute and compare Merkle roots against stored commitments
- **Single File Proofs**: Verify individual files using Merkle proofs
- **Policy Consistency**: Ensure verification uses the same filtering rules as generation
- **Subfolder Verification**: Verify that subfolders are contained within a larger Merkle tree
- **Large File Support**: Stream-based hashing for verification of files of any size

### Blockchain Timestamping
- **On-Chain Commitments**: Commit Merkle roots to Ethereum, Optimism, Arbitrum, Base, and Bitcoin blockchains for immutable timestamping
- **Ethereum-Based Chains**: Smart contract-based timestamping on Ethereum Mainnet, Optimism, Arbitrum One, and Base (requires wallet connection)
- **Bitcoin Timestamping**: OpenTimestamps protocol for Bitcoin timestamping (no wallet required, uses calendar servers)
- **Proof Generation**: Download proof files containing transaction details, blockchain metadata, and verification URLs
- **Network Support**: Works with Ethereum Mainnet, Optimism, Arbitrum One, Base, Bitcoin, and local chains
- **Bidirectional Network Switching**: Automatically syncs network selection between the app and MetaMask (EVM chains)
- **Transaction Status**: Real-time transaction status with pending confirmation and confirmed states
- **Animated Loading Indicators**: Visual feedback during transaction processing
- **State Management**: Automatic state reset when switching networks
- **Automatic Verification**: Verify timestamps directly from the proof files

### Security & Privacy
- **Local Processing**: All cryptographic operations happen client-side
- **No Data Transmission**: Files never leave your device
- **File System API**: Uses modern browser File System Access API
- **Content-Only Hashing**: Creates deterministic commitments based on file contents only
- **Memory Efficient**: Streaming hashing for large files prevents memory exhaustion
- **No Size Limits**: Process folders and files of any size without artificial restrictions

## Cryptographic Specification

### Hash Construction
- **Content Hash**: `SHA256(fileBytes)`
- **Leaf Hash**: `SHA256("leaf\0" + contentHashBytes)`
- **Node Hash**: `SHA256("node\0" + leftNode + rightNode)`
- **Root Hash**: Final node in the Merkle tree
- **Ordering**: Leaf hashes sorted lexicographically by hex representation

### Merkle Tree Structure
- Binary tree with duplicate last node for odd numbers of leaves
- Canonical JSON output with complete tree levels for proof verification
- Schema version: `merkle-bytes-tree@1`

## Browser Support

Requires browsers with File System Access API support:
- Chrome 86+
- Edge 86+
- Firefox (limited support)
- Safari (limited support)

## Usage

### Generating Merkle Trees
1. Click "Folder → Merkle Tree"
2. Select a directory using the file picker
3. Configure folder policies if needed
4. Download the generated `merkle-tree.json`

### Verifying Files/Folders
1. Click "Open merkle-tree.json" to load a commitment
2. Use "Verify Folder" to check entire directory integrity
3. Use "Verify Single File" to check individual files

### Creating Blockchain Timestamps

**For Ethereum-Based Chains (Ethereum, Optimism, Arbitrum, Base):**
1. Go to the "On-Chain Timestamping" tab
2. Connect your Web3 wallet (MetaMask recommended)
3. Select your preferred network (Ethereum Mainnet, Optimism, Arbitrum One, or Base)
4. Load a `merkle-tree.json` file or paste a Merkle root
5. Click "Create Timestamp on [Blockchain Name]"
6. Confirm the transaction in your wallet
7. Monitor transaction status (pending confirmation → confirmed)
8. Download the proof file for future verification

**For Bitcoin (OpenTimestamps):**
1. **Start the backend server** (required): Run `npm run backend` in a separate terminal
2. Go to the "On-Chain Timestamping" tab
3. Select "Bitcoin" from the network dropdown (no wallet required)
4. Load a `merkle-tree.json` file or paste a Merkle root
5. Click "Create Timestamp on Bitcoin"
6. **Initial stamp**: Your Merkle root is submitted to OpenTimestamps calendar servers (via backend proxy)
7. **Status tracking**: The app shows three status states:
   - **Pending**: Timestamp submitted, waiting for Bitcoin block inclusion (~10 minutes)
   - **Anchored**: Included in a Bitcoin block (shows block height and hash)
   - **Confirmed**: Anchored + confirmations checked (shows confirmation count)
8. **Automatic polling**: The app automatically checks for upgrades with exponential backoff (2m, 5m, 10m, 20m intervals)
9. **Manual check**: Use "Check Upgrade" button to manually check status
10. Download the `.ots` proof file for verification

**Note**: Bitcoin timestamping requires a backend server running because the OpenTimestamps library requires Node.js. The backend acts as a proxy between the browser and OpenTimestamps calendar servers.

**Contract Addresses:**
- **Ethereum Mainnet**: [`0xE1DEb3c75b5c32D672ac8287010C231f4C15033b`](https://etherscan.io/address/0xE1DEb3c75b5c32D672ac8287010C15033b)
- **Optimism**: [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://optimistic.etherscan.io/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)
- **Arbitrum One**: [`0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E`](https://arbiscan.io/address/0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E)
- **Base**: [`0xA095c28448186ACC0e950A17b96879394f89C5B4`](https://basescan.org/address/0xA095c28448186ACC0e950A17b96879394f89C5B4)

### Folder Policies
- **Include Hidden Files**: Files/folders starting with "." (default: excluded)
- **Ignore Junk Files**: System files like `.DS_Store`, `Thumbs.db`, etc. (default: ignored)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start backend server (for OpenTimestamps)
npm run backend

# Build for production
npm run build

# Run linting
npm run lint
```

## Production Deployment

For production deployment, see [PRODUCTION.md](PRODUCTION.md) for detailed instructions.

**Quick Start:**
1. Set environment variables (see `.env.example`)
2. Build frontend: `npm run build`
3. Deploy `dist/` directory to your hosting service
4. Deploy backend server (see PRODUCTION.md for options)
5. Configure CORS and environment variables

**Environment Variables:**

**Frontend (.env):**
- `VITE_BACKEND_URL` - Backend server URL (e.g., `http://localhost:3001` for development, `https://api.yourdomain.com` for production)

**Backend:**
- `PORT` - Backend server port (default: 3001)
- `NODE_ENV` - Node environment (`development` or `production`, required for security)
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated, required in production)

See `.env.example` for a complete template.

## Architecture

- **Frontend**: React with modern hooks and dynamic imports
- **Cryptography**: Web Crypto API (SHA-256)
- **File Access**: File System Access API
- **Build Tool**: Vite with React plugin
- **Styling**: Inline styles with dark theme
- **Backend Proxy**: Node.js Express server for Bitcoin OpenTimestamps operations (required for Bitcoin timestamping)

### Bitcoin OpenTimestamps Architecture

The Bitcoin timestamping feature uses a **backend proxy architecture**:

1. **Frontend** (`src/components/BitcoinTimestamping.jsx`): React component handling UI and user interactions
2. **Frontend Library** (`src/lib/opentimestamps.js`): Client-side library that communicates with backend API
3. **Backend Server** (`backend-server.js`): Express.js server that:
   - Uses the official `opentimestamps` npm package (requires Node.js)
   - Handles stamping operations via OpenTimestamps pool servers
   - Handles upgrade operations via OpenTimestamps calendar servers
   - Provides REST API endpoints (`/api/stamp`, `/api/upgrade`, `/api/health`)
   - Implements security features (CORS, rate limiting, input validation)

**Why a backend proxy?**
- The `opentimestamps` JavaScript library requires Node.js and cannot run directly in browsers
- Calendar servers may have CORS restrictions
- Provides centralized security controls (rate limiting, input validation)
- Allows for better error handling and logging

**Status States:**
- **Pending**: Timestamp submitted to calendar server, waiting for Bitcoin block inclusion
- **Anchored**: Timestamp included in a Bitcoin block (has Bitcoin attestation)
- **Confirmed**: Anchored + confirmations checked (shows block height and confirmation count)

## File Structure

```
src/
├── components/
│   ├── MerkleRootGenerator.jsx    # Tree generation UI
│   ├── FileVerification.jsx       # Verification UI
│   ├── OnChainTimestamping.jsx   # Blockchain timestamping UI
│   ├── BitcoinTimestamping.jsx   # Bitcoin OpenTimestamps UI
│   ├── BlockchainCommit.jsx      # Commit to blockchain component
│   └── ErrorBoundary.jsx          # Error handling component
├── lib/
│   ├── merkle.js                  # Core cryptographic functions
│   ├── opentimestamps.js         # OpenTimestamps client library (frontend)
│   ├── mempool.js                # Mempool.space API integration
│   ├── utils.jsx                  # Shared utilities
│   ├── constants.js               # Application constants
│   ├── validation.js              # Input validation utilities
│   └── errorHandler.js            # Error handling utilities
├── config.js                      # Configuration (contract addresses, etc.)
└── App.jsx                        # Main application with routing
backend-server.js                   # Backend proxy for OpenTimestamps (Node.js)
```

## Security Considerations

- All operations are performed locally in the browser
- No server communication or data persistence
- Cryptographic operations use browser's Web Crypto API
- File access requires explicit user permission
- Content-based hashing ensures deterministic results
- Blockchain timestamps provide immutable proof of existence
- Merkle roots are publicly verifiable but don't reveal file contents

## Blockchain Timestamping

This application implements blockchain timestamping, inspired by [OpenTimestamps](https://opentimestamps.org/). Key features:

- **Immutable Proofs**: Once committed to the blockchain, timestamps cannot be altered
- **Public Verification**: Anyone can verify timestamps using the proof files
- **Privacy-Preserving**: Only Merkle roots are stored on-chain, not your actual files
- **Multi-Chain Support**: Deployments on Ethereum Mainnet, Optimism, Arbitrum One, Base, and Bitcoin (via OpenTimestamps)
- **Cost-Effective**: Low-cost timestamping on L2 networks
- **Real-Time Status**: Transaction status tracking with pending and confirmed states

For detailed information about timestamping concepts, use cases, and verification, see [TIMESTAMPING.md](TIMESTAMPING.md).

## Contributing

This tool implements a specific cryptographic commitment scheme. Changes to the hash construction or tree building algorithms should maintain backward compatibility and be thoroughly tested.

## License

See LICENSE file for details.
