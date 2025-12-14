# Merkle Tool

**Local-only Merkle root generator and verification tool for folders and files.**  
All hashing happens in your browser. No uploads. No servers.

This tool allows anyone to:
- Generate a Merkle root for a folder or file set
- Export a portable JSON proof (`merkle-tree.json`)
- Verify whether a folder or an individual file belongs to that Merkle commitment
- Verify file inclusion **by bytes only** (file names and paths do not matter)

## Key Principles

- **Local-first**: Files never leave your device
- **Deterministic**: Same bytes → same Merkle root, anywhere
- **Portable proofs**: JSON output can be verified on any machine
- **Bytes-only commitment**: File content is what matters, not filenames or paths
- **No trust required**: Verification is cryptographic and reproducible


## What This Is (and Is Not)

This tool **does not timestamp** data or anchor it to a blockchain.

Instead, it creates a **cryptographic commitment** (Merkle root) that can later be:
- Published anywhere (Git, blockchain, email, paper, OpenTimestamps, etc.)
- Used as a reference to verify files or folders later

Think of it as a **deterministic proof generator**, not a notary.


## How It Works (High Level)

1. Each file is hashed using SHA-256
2. Files become Merkle tree leaves
3. A Merkle root is computed
4. A JSON proof file is generated containing:
   - Merkle root
   - Tree structure
   - File content hashes
   - Canonicalization rules
5. Anyone can later verify:
   - A full folder matches the root
   - A single file belongs to the committed set

All verification is done locally in the browser.


## Features

### Merkle Root Generator
- Folder → Merkle root (no upload, File System Access API)
- Folder → Merkle root (upload fallback)
- Single file → SHA-256 hash
- Configurable folder policy:
  - Ignore junk files
  - Unicode normalization
  - Hidden file handling
- Export `merkle-tree.json`

### File Verification
- Verify folder matches a Merkle proof
- Verify individual file inclusion
- File name and path independent verification
- Clear error reporting when permissions or files change


## Browser Support

- **Chrome / Brave / Edge**: Full support
- **Firefox / Safari**: Upload fallback supported (no folder picker)


## Security & Privacy

- No network requests
- No analytics
- No telemetry
- No file uploads

Everything happens locally using the Web Crypto API.


## 🛠️ Development

```bash
npm install
npm run dev
