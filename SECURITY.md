# Security Policy

## Reporting issues

If you discover a security issue or cryptographic flaw, please report it privately.

Contact:
- GitHub Issues (non-sensitive)
- Or reach out to the repository owner directly

## Scope

This project:
- Performs cryptographic hashing locally using WebCrypto (frontend)
- Runs a backend server for Bitcoin OpenTimestamps functionality (Node.js/Express)
- Does not store user data persistently
- All file processing happens client-side

Security issues are primarily related to:
- Determinism (consistent Merkle root generation)
- Verification correctness (policy consistency, root matching)
- Browser behavior (File System Access API security)
- Backend server security (CORS, rate limiting, input validation)
- Policy consistency (FolderPolicy component ensures same policy used in generation and verification)

## Backend Server Security

The backend server (`backend-server.js`) implements several security measures:

### CORS Protection
- **Development**: Allows all origins for local testing
- **Production**: Restricted to origins specified in `CORS_ORIGIN` environment variable
- **Critical**: Must set `CORS_ORIGIN` in production to prevent unauthorized access

### Rate Limiting
- General API: 100 requests per 15 minutes per IP
- Stamp endpoint: 20 requests per 15 minutes per IP
- Upgrade endpoint: 30 requests per minute per IP
- Prevents DoS attacks and abuse

### Input Validation
- Hex string format validation (64 hex characters for Merkle roots)
- OTS file format validation (magic bytes check)
- Request size limits (1MB for JSON payloads and OTS files)
- Array size and content validation

### Request Timeouts
- 30-second timeout for stamp and upgrade endpoints
- Prevents resource exhaustion from hanging requests

### Error Sanitization
- **Production**: Generic error messages (no stack traces or internal details)
- **Development**: Full error details for debugging
- Prevents information leakage

### Environment-Based Security
- Security features automatically enabled when `NODE_ENV=production`
- Development mode allows all origins and shows debug logs

## FolderPolicy Security

The unified FolderPolicy component ensures policy consistency between generation and verification:

### Policy Consistency
- **Critical**: The same policy used during generation must be used during verification
- **Auto-population**: When loading a JSON file, the policy is automatically populated from `folderPolicy` field
- **Override capability**: Users can override JSON policies if needed, but this is clearly indicated
- **Source tracking**: Policy source is clearly displayed (JSON, Manual, or Default)

### Security Implications
- **Mismatch detection**: Using different policies will result in verification failure, preventing false positives
- **Transparency**: Policy source is always visible, preventing confusion about which policy is active
- **Override warnings**: Overriding a JSON policy is clearly indicated to prevent accidental mismatches

### Best Practices
- Always use the same policy for generation and verification
- When loading a JSON file, verify the policy matches your expectations
- Only override policies when you understand the implications
- Keep your `merkle-tree.json` files with their original policies intact
