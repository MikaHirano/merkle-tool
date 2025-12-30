// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "./MerkleRootRegistry.sol";

contract MerkleRootRegistryTest is Test {
    MerkleRootRegistry registry;
    address user1 = address(0x1);
    address user2 = address(0x2);

    bytes32 testMerkleRoot1 = keccak256("test root 1");
    bytes32 testMerkleRoot2 = keccak256("test root 2");
    string testMetadata1 = '{"fileCount": 5, "totalBytes": 1024}';
    string testMetadata2 = '{"fileCount": 10, "totalBytes": 2048}';

    function setUp() public {
        registry = new MerkleRootRegistry();
    }

    function testCommitMerkleRoot() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(testMerkleRoot1);

        assertEq(commitment.merkleRoot, testMerkleRoot1);
        assertEq(commitment.committer, user1);
        assertEq(commitment.blockNumber, block.number);
        assertEq(commitment.timestamp, block.timestamp);
        assertEq(commitment.metadata, testMetadata1);
    }

    function testCannotCommitDuplicateRoot() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        vm.prank(user2);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerkleRootRegistry.MerkleRootAlreadyCommitted.selector,
                testMerkleRoot1
            )
        );
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata2);
    }

    function testIsCommitted() public {
        assertFalse(registry.isCommitted(testMerkleRoot1));

        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        assertTrue(registry.isCommitted(testMerkleRoot1));
    }

    function testGetUserCommitments() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot2, testMetadata2);

        bytes32[] memory userCommitments = registry.getUserCommitments(user1);
        assertEq(userCommitments.length, 2);
        assertEq(userCommitments[0], testMerkleRoot1);
        assertEq(userCommitments[1], testMerkleRoot2);
    }

    function testUpdateMetadata() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        string memory newMetadata = '{"fileCount": 7, "totalBytes": 1536}';

        vm.prank(user1);
        registry.updateMetadata(testMerkleRoot1, newMetadata);

        MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(testMerkleRoot1);
        assertEq(commitment.metadata, newMetadata);
    }

    function testCannotUpdateMetadataByNonCommitter() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        vm.prank(user2);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerkleRootRegistry.OnlyCommitterCanUpdate.selector,
                user2,
                user1
            )
        );
        registry.updateMetadata(testMerkleRoot1, testMetadata2);
    }

    function testCannotUpdateMetadataForNonExistentCommitment() public {
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerkleRootRegistry.CommitmentDoesNotExist.selector,
                testMerkleRoot1
            )
        );
        registry.updateMetadata(testMerkleRoot1, testMetadata1);
    }

    function testGetUserCommitmentCount() public {
        assertEq(registry.getUserCommitmentCount(user1), 0);

        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        assertEq(registry.getUserCommitmentCount(user1), 1);

        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot2, testMetadata2);

        assertEq(registry.getUserCommitmentCount(user1), 2);
    }

    function testMetadataLengthLimit() public {
        // Create metadata that exceeds MAX_METADATA_LENGTH (2048 bytes)
        string memory longMetadata = new string(2049);
        bytes memory metadataBytes = bytes(longMetadata);
        // Fill with some data
        for (uint i = 0; i < 2049; i++) {
            metadataBytes[i] = bytes1(uint8(65 + (i % 26))); // Fill with A-Z
        }

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerkleRootRegistry.MetadataTooLong.selector,
                2049,
                2048
            )
        );
        registry.commitMerkleRoot(testMerkleRoot1, string(metadataBytes));
    }

    function testMetadataLengthLimitOnUpdate() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        // Try to update with metadata that exceeds limit
        string memory longMetadata = new string(2049);
        bytes memory metadataBytes = bytes(longMetadata);
        for (uint i = 0; i < 2049; i++) {
            metadataBytes[i] = bytes1(uint8(65 + (i % 26)));
        }

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MerkleRootRegistry.MetadataTooLong.selector,
                2049,
                2048
            )
        );
        registry.updateMetadata(testMerkleRoot1, string(metadataBytes));
    }

    function testMaxMetadataLengthAccepted() public {
        // Create metadata exactly at MAX_METADATA_LENGTH (2048 bytes)
        string memory maxMetadata = new string(2048);
        bytes memory metadataBytes = bytes(maxMetadata);
        for (uint i = 0; i < 2048; i++) {
            metadataBytes[i] = bytes1(uint8(65 + (i % 26)));
        }

        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, string(metadataBytes));

        MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(testMerkleRoot1);
        assertEq(commitment.merkleRoot, testMerkleRoot1);
        assertEq(bytes(commitment.metadata).length, 2048);
    }

    function testZeroLengthMetadata() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, "");

        MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(testMerkleRoot1);
        assertEq(commitment.merkleRoot, testMerkleRoot1);
        assertEq(bytes(commitment.metadata).length, 0);
    }

    // Fuzz test: random Merkle roots
    function testFuzzCommitMerkleRoot(bytes32 merkleRoot, string memory metadata) public {
        // Bound metadata length to prevent out-of-gas
        bytes memory metadataBytes = bytes(metadata);
        if (metadataBytes.length > 2048) {
            vm.assume(false); // Skip tests with metadata too long
        }

        // Should succeed if root not already committed
        if (!registry.isCommitted(merkleRoot)) {
            registry.commitMerkleRoot(merkleRoot, metadata);
            assertTrue(registry.isCommitted(merkleRoot));
            
            MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(merkleRoot);
            assertEq(commitment.merkleRoot, merkleRoot);
            assertEq(commitment.committer, address(this));
        }
    }

    // Gas benchmark test
    function testGasCommitMerkleRoot() public {
        uint256 gasBefore = gasleft();
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);
        uint256 gasUsed = gasBefore - gasleft();
        
        // Log gas usage (useful for optimization tracking)
        emit log_named_uint("Gas used for commitMerkleRoot", gasUsed);
        
        // Ensure it's reasonable (should be under 200k gas)
        assertLt(gasUsed, 200000);
    }

    // Integration test: multiple users, multiple commitments
    function testMultipleUsersMultipleCommitments() public {
        address user3 = address(0x3);
        bytes32 root3 = keccak256("test root 3");
        bytes32 root4 = keccak256("test root 4");
        string memory metadata3 = '{"fileCount": 15}';
        string memory metadata4 = '{"fileCount": 20}';

        // User1 commits root1
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);
        
        // User2 commits root2
        vm.prank(user2);
        registry.commitMerkleRoot(testMerkleRoot2, testMetadata2);
        
        // User1 commits another root
        vm.prank(user1);
        registry.commitMerkleRoot(root3, metadata3);
        
        // User3 commits root4
        vm.prank(user3);
        registry.commitMerkleRoot(root4, metadata4);

        // Verify counts
        assertEq(registry.getUserCommitmentCount(user1), 2);
        assertEq(registry.getUserCommitmentCount(user2), 1);
        assertEq(registry.getUserCommitmentCount(user3), 1);

        // Verify user1's commitments
        bytes32[] memory user1Commitments = registry.getUserCommitments(user1);
        assertEq(user1Commitments.length, 2);
        assertEq(user1Commitments[0], testMerkleRoot1);
        assertEq(user1Commitments[1], root3);
    }

    // Edge case: empty string metadata update
    function testUpdateToEmptyMetadata() public {
        vm.prank(user1);
        registry.commitMerkleRoot(testMerkleRoot1, testMetadata1);

        vm.prank(user1);
        registry.updateMetadata(testMerkleRoot1, "");

        MerkleRootRegistry.Commitment memory commitment = registry.getCommitment(testMerkleRoot1);
        assertEq(bytes(commitment.metadata).length, 0);
    }
}
