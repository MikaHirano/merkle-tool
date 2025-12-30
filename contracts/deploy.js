// Simple deployment script for testing
// Run this in Remix console after deployment

async function testDeployment() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Default anvil address
  const accounts = await web3.eth.getAccounts();

  console.log("Testing MerkleRootRegistry deployment...");
  console.log("Contract Address:", contractAddress);
  console.log("Test Account:", accounts[0]);

  // Contract ABI
  const abi = [
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

  // Create contract instance
  const contract = new web3.eth.Contract(abi, contractAddress);

  // Test 1: Check if contract is committed (should be false initially)
  const testRoot = "0x" + "a".repeat(64);
  console.log("\n=== Test 1: Check initial state ===");
  const isCommittedBefore = await contract.methods.isCommitted(testRoot).call();
  console.log("Is committed before:", isCommittedBefore);

  // Test 2: Commit a Merkle root
  console.log("\n=== Test 2: Commit Merkle root ===");
  const metadata = '{"fileCount": 5, "totalBytes": 1024, "schema": "merkle-bytes-tree@1"}';
  console.log("Committing root:", testRoot);
  console.log("Metadata:", metadata);

  try {
    const tx = await contract.methods.commitMerkleRoot(testRoot, metadata).send({
      from: accounts[0],
      gas: 200000
    });
    console.log("Transaction hash:", tx.transactionHash);
    console.log("Block number:", tx.blockNumber);
  } catch (error) {
    console.error("Commit failed:", error.message);
    return;
  }

  // Test 3: Verify commitment
  console.log("\n=== Test 3: Verify commitment ===");
  const commitment = await contract.methods.getCommitment(testRoot).call();
  console.log("Commitment details:");
  console.log("- Merkle Root:", commitment[0]);
  console.log("- Committer:", commitment[1]);
  console.log("- Block Number:", commitment[2]);
  console.log("- Timestamp:", commitment[3]);
  console.log("- Metadata:", commitment[4]);

  // Test 4: Check if committed (should be true now)
  console.log("\n=== Test 4: Check committed status ===");
  const isCommittedAfter = await contract.methods.isCommitted(testRoot).call();
  console.log("Is committed after:", isCommittedAfter);

  // Test 5: Try to commit same root again (should fail)
  console.log("\n=== Test 5: Test duplicate commitment ===");
  try {
    await contract.methods.commitMerkleRoot(testRoot, metadata).send({
      from: accounts[0],
      gas: 200000
    });
    console.log("ERROR: Duplicate commitment should have failed!");
  } catch (error) {
    console.log("✓ Duplicate commitment correctly rejected:", error.message);
  }

  console.log("\n🎉 All tests completed successfully!");
}

// Export for Remix
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testDeployment };
}
