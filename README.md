# Merkle Tool

A web-based tool for generating and verifying Merkle trees from files and folders using SHA-256 cryptographic hashing. Built with React and Vite, this tool provides local-only, client-side processing for secure file integrity verification.

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
│   └── FileVerification.jsx       # Verification UI
├── lib/
│   ├── merkle.js                  # Core cryptographic functions
│   └── utils.js                   # Shared utilities
└── App.jsx                        # Main application with routing
```

## Security Considerations

- All operations are performed locally in the browser
- No server communication or data persistence
- Cryptographic operations use browser's Web Crypto API
- File access requires explicit user permission
- Content-based hashing ensures deterministic results

## Contributing

This tool implements a specific cryptographic commitment scheme. Changes to the hash construction or tree building algorithms should maintain backward compatibility and be thoroughly tested.

## License

See LICENSE file for details.
