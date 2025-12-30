# Merkle Tool

A web-based tool for generating and verifying Merkle trees from files and folders using SHA-256 cryptographic hashing. Built with React and Vite, this tool provides local-only, client-side processing for secure file integrity verification and **blockchain timestamping** on Ethereum and Arbitrum.

## Blockchain Timestamping

Create immutable timestamps of your files on Ethereum and Arbitrum blockchains! This feature is inspired by [OpenTimestamps](https://opentimestamps.org/) and allows you to prove that your files existed at a specific point in time. See [TIMESTAMPING.md](TIMESTAMPING.md) for detailed documentation.

## Features

### Merkle Tree Generation
- **Folder Processing**: Generate Merkle roots from entire directory structures
- **Single File Hashing**: Compute SHA-256 hashes for individual files
- **Configurable Policies**: Control which files to include/exclude (hidden files, system files, etc.)
- **JSON Output**: Export complete Merkle tree data for verification

### File Verification
- **Folder Verification**: Recompute and compare Merkle roots against stored commitments
- **Single File Proofs**: Verify individual files using Merkle proofs
- **Policy Consistency**: Ensure verification uses the same filtering rules as generation
- **Subfolder Verification**: Verify that subfolders are contained within a larger Merkle tree

### Blockchain Timestamping
- **On-Chain Commitments**: Commit Merkle roots to Ethereum, Optimism, Arbitrum, and Base blockchains for immutable timestamping
- **Proof Generation**: Download proof files containing transaction details and verification URLs
- **Network Support**: Works with Ethereum Mainnet, Optimism, Arbitrum One, Base, and local chains
- **Bidirectional Network Switching**: Automatically syncs network selection between the app and MetaMask
- **Transaction Status**: Real-time transaction status with pending and confirmed states
- **Automatic Verification**: Verify timestamps directly from the proof files

### Security & Privacy
- **Local Processing**: All cryptographic operations happen client-side
- **No Data Transmission**: Files never leave your device
- **File System API**: Uses modern browser File System Access API
- **Content-Only Hashing**: Creates deterministic commitments based on file contents only

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
1. Go to the "On-Chain Timestamping" tab
2. Connect your Web3 wallet (MetaMask recommended)
3. Select your preferred network (Ethereum Mainnet, Optimism, Arbitrum One, or Base)
4. Load a `merkle-tree.json` file or paste a Merkle root
5. Click "Create Timestamp on [Blockchain Name]"
6. Confirm the transaction in your wallet
7. Monitor transaction status (pending confirmation → confirmed)
8. Download the proof file for future verification

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

# Build for production
npm run build

# Run linting
npm run lint
```

## Architecture

- **Frontend**: React with modern hooks and dynamic imports
- **Cryptography**: Web Crypto API (SHA-256)
- **File Access**: File System Access API
- **Build Tool**: Vite with React plugin
- **Styling**: Inline styles with dark theme

## File Structure

```
src/
├── components/
│   ├── MerkleRootGenerator.jsx    # Tree generation UI
│   ├── FileVerification.jsx       # Verification UI
│   ├── OnChainTimestamping.jsx   # Blockchain timestamping UI
│   ├── BlockchainCommit.jsx      # Commit to blockchain component
│   └── ErrorBoundary.jsx          # Error handling component
├── lib/
│   ├── merkle.js                  # Core cryptographic functions
│   ├── utils.jsx                  # Shared utilities
│   ├── constants.js               # Application constants
│   ├── validation.js              # Input validation utilities
│   └── errorHandler.js            # Error handling utilities
├── config.js                      # Configuration (contract addresses, etc.)
└── App.jsx                        # Main application with routing
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
- **Multi-Chain Support**: Deployments on Ethereum Mainnet, Optimism, Arbitrum One, and Base
- **Cost-Effective**: Low-cost timestamping on L2 networks
- **Real-Time Status**: Transaction status tracking with pending and confirmed states

For detailed information about timestamping concepts, use cases, and verification, see [TIMESTAMPING.md](TIMESTAMPING.md).

## Contributing

This tool implements a specific cryptographic commitment scheme. Changes to the hash construction or tree building algorithms should maintain backward compatibility and be thoroughly tested.

## License

See LICENSE file for details.
