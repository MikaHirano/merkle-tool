# Merkle Tool

Local, deterministic Merkle commitments for files and folders — without uploading data.

This tool allows anyone to:
- Generate a cryptographic Merkle root from a folder or file set
- Export a portable JSON proof (`merkle-tree.json`)
- Verify whether a file or folder belongs to a given Merkle commitment
- Do all hashing **locally in the browser**

## Why this exists

When you want to prove that:
- a file belonged to a specific collection represented by a merkle-root hash (sha256) and/or (`merkle-tree.json`) file.
- a merkle-root and/or (`merkle-tree.json`) file corresponds to a given data set.
- two people have identical data sets without sharing them

This tool creates Merkle roots using SHA-256 and allows independent verification anywhere, on any device.

## Core properties

- **Bytes-only commitment**  
  File paths and names are metadata. Verification is based on file *content bytes* only.

- **Deterministic**  
  The same files always produce the same root.

- **Portable proofs**  
  The output JSON can be verified later, offline, or by third parties.

- **Local-first**  
  All hashing happens inside your browser.

## How it works (high level)

### Folder commitment
1. Files are filtered according to a folder policy
2. Each file is hashed with SHA-256
3. Leaf hashes are built from file content
4. A Merkle tree is constructed
5. The Merkle root + tree structure is exported as `merkle-tree.json`

### File verification
Given:
- a file or folder
- a `merkle-tree.json`

The tool checks whether the file’s content hash is included in the committed Merkle tree.

## Usage

### 1. Generate a Merkle commitment
- Choose **Folder** or **File**
- Select upload or browser-native picker
- Download `merkle-tree.json`
- Copy the Merkle root if needed

### 2. Verify
- Upload `merkle-tree.json`
- Verify:
  - a full folder
  - or a single file

The tool will confirm whether the data belongs to the original commitment.

## Browser support

- Chrome / Edge: full support (File System Access API)
- Firefox / Safari: folder upload fallback

## Security notes

- Uses WebCrypto SHA-256
- No network requests
- No file data leaves your machine
- Paths are not part of the cryptographic commitment

## License

MIT License — see LICENSE file.
