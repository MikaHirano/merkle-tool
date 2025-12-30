# MerkleRootRegistry Deployment Guide

## Quick Deployment & Testing

### Step 1: Deploy via Remix IDE

1. **Open Remix**: Go to [remix.ethereum.org](https://remix.ethereum.org)

2. **Load Contract**:
   - Create new file: `MerkleRootRegistry.sol`
   - Copy the entire contract code from `contracts/MerkleRootRegistry.sol`
   - Set compiler to `0.8.19`

3. **Connect to Your Local Chain**:
   - Go to "Deploy & Run Transactions" tab
   - Environment: "Injected Provider - MetaMask"
   - Make sure MetaMask is connected to your local chain

4. **Deploy**:
   - Click "Deploy" button
   - Confirm transaction in MetaMask
   - **Note the deployed contract address** (appears in console)

### Step 2: Test the Deployment

1. **Copy the test script**:
   - Open Remix console (bottom right)
   - Copy the entire content from `contracts/deploy.js`

2. **Update contract address**:
   - In the copied script, replace the `contractAddress` with your deployed address

3. **Run tests**:
   - Paste the script into Remix console
   - Call `await testDeployment()`

### Step 3: Update Frontend

After successful deployment and testing:

**Update Contract Address in Config**

Update the contract address in `src/config.js`:

```javascript
const defaults = {
  1: "YOUR_ETHEREUM_MAINNET_ADDRESS", // Ethereum Mainnet
  10: "YOUR_OPTIMISM_ADDRESS", // Optimism
  42161: "YOUR_ARBITRUM_ONE_ADDRESS", // Arbitrum One (Mainnet)
  8453: "YOUR_BASE_ADDRESS", // Base
  31337: "YOUR_LOCAL_ADDRESS", // Local Anvil
};
```

**Current Production Addresses:**
- **Ethereum Mainnet**: `0xE1DEb3c75b5c32D672ac8287010C231f4C15033b`
- **Optimism**: `0xA095c28448186ACC0e950A17b96879394f89C5B4`
- **Arbitrum One**: `0x9aFaF9963Ae4Ed27e8180831e0c38a8C174DCd5E`
- **Base**: `0xA095c28448186ACC0e950A17b96879394f89C5B4`

### Step 4: Test Full Integration

1. **Start the app**: `npm run dev`
2. **Connect wallet** to your local chain
3. **Generate a Merkle tree** from a folder
4. **Select your network** (Ethereum Mainnet, Optimism, Arbitrum One, or Base)
5. **Click** "Create Timestamp on [Blockchain Name]" - should work now!
6. **Monitor transaction status** (pending → confirmed)
7. **Download proof file** and verify it contains:
   - Your Merkle root
   - Transaction details
   - Contract address you entered
   - Proper verification URLs

## Expected Test Results

When you run `await testDeployment()` in Remix console, you should see:

```
Testing MerkleRootRegistry deployment...
Contract Address: 0x...
Test Account: 0x...

=== Test 1: Check initial state ===
Is committed before: false

=== Test 2: Commit Merkle root ===
Committing root: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Metadata: {"fileCount": 5, "totalBytes": 1024, "schema": "merkle-bytes-tree@1"}
Transaction hash: 0x...
Block number: 123

=== Test 3: Verify commitment ===
Commitment details:
- Merkle Root: 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- Committer: 0x...
- Block Number: 123
- Timestamp: 1234567890
- Metadata: {"fileCount": 5, "totalBytes": 1024, "schema": "merkle-bytes-tree@1"}

=== Test 4: Check committed status ===
Is committed after: true

=== Test 5: Test duplicate commitment ===
PASS: Duplicate commitment correctly rejected: Merkle root already committed

All tests completed successfully!
```

## Troubleshooting

### Deployment Issues
- **"Contract deployment failed"**: Check if your wallet has enough ETH
- **"Network error"**: Ensure MetaMask is connected to your local chain
- **"Compilation failed"**: Make sure compiler version is set to 0.8.19

### Testing Issues
- **"Contract not found"**: Double-check the contract address in the test script
- **"Transaction failed"**: Ensure your account has sufficient funds
- **"Method not found"**: Verify the ABI matches your contract

### Frontend Issues
- **"Contract not deployed"**: Update the contract address in BlockchainCommit.jsx
- **"Network not supported"**: Add your local chain ID to WalletConnect.jsx
- **"Transaction reverted"**: Check contract address and network connection

## Next Steps

Once local testing is successful:

1. **Deploy to Ethereum Mainnet**
2. **Deploy to Optimism**
3. **Deploy to Arbitrum One**
4. **Deploy to Base**
5. **Update production contract addresses**

The contract is now ready for deployment!
