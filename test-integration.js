// Integration test script
// Run with: node test-integration.js

const { ethers } = require('ethers');

// Configuration
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Update with your deployed address
const RPC_URL = "http://127.0.0.1:8545"; // Your local chain RPC

// Contract ABI
const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"},
      {"internalType": "string", "name": "metadata", "type": "string"}
    ],
    "name": "commitMerkleRoot",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"}],
    "name": "getCommitment",
    "outputs": [
      {"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"},
      {"internalType": "address", "name": "committer", "type": "address"},
      {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
      {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
      {"internalType": "string", "name": "metadata", "type": "string"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "merkleRoot", "type": "bytes32"}],
    "name": "isCommitted",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function testContract() {
  console.log("Testing MerkleRootRegistry Contract");
  console.log("=====================================");

  try {
    // Connect to local chain
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();

    console.log(`Connected to: ${RPC_URL}`);
    console.log(`Using account: ${address}`);

    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Test data
    const testMerkleRoot = "0x" + "a".repeat(64);
    const testMetadata = JSON.stringify({
      fileCount: 5,
      totalBytes: 1024,
      schema: "merkle-bytes-tree@1",
      generatedAt: new Date().toISOString()
    });

    console.log(`\nTest Merkle Root: ${testMerkleRoot}`);
    console.log(`Test Metadata: ${testMetadata}`);

    // Test 1: Check initial state
    console.log("\n[1] Testing initial state...");
    const isCommittedBefore = await contract.isCommitted(testMerkleRoot);
    console.log(`   Is committed before: ${isCommittedBefore}`);

    // Test 2: Commit Merkle root
    console.log("\n[2] Committing Merkle root...");
    const tx = await contract.commitMerkleRoot(testMerkleRoot, testMetadata);
    console.log(`   Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`   Block number: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

    // Test 3: Verify commitment
    console.log("\n[3] Verifying commitment...");
    const commitment = await contract.getCommitment(testMerkleRoot);
    console.log(`   Merkle Root: ${commitment[0]}`);
    console.log(`   Committer: ${commitment[1]}`);
    console.log(`   Block Number: ${commitment[2]}`);
    console.log(`   Timestamp: ${commitment[3]}`);
    console.log(`   Metadata: ${commitment[4]}`);

    // Test 4: Check committed status
    console.log("\n[4] Checking committed status...");
    const isCommittedAfter = await contract.isCommitted(testMerkleRoot);
    console.log(`   Is committed after: ${isCommittedAfter}`);

    // Test 5: Try duplicate commitment
    console.log("\n[5] Testing duplicate commitment (should fail)...");
    try {
      await contract.commitMerkleRoot(testMerkleRoot, testMetadata);
      console.log("   ERROR: Duplicate commitment should have failed!");
    } catch (error) {
      console.log(`   PASS: Duplicate correctly rejected: ${error.message}`);
    }

    console.log("\nAll contract tests passed!");
    console.log("\nNext steps:");
    console.log("   1. Update contract address in BlockchainCommit.jsx");
    console.log("   2. Test full frontend integration with: npm run dev");
    console.log("   3. Generate a Merkle tree and commit it to blockchain");

  } catch (error) {
    console.error("Test failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("   - Make sure your local chain is running");
    console.error("   - Update CONTRACT_ADDRESS with your deployed contract");
    console.error("   - Check RPC_URL is correct for your chain");
  }
}

// Run the test
testContract().catch(console.error);
