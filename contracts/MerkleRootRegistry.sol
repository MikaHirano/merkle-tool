// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MerkleRootRegistry
 * @author Mika Hirano
 * @notice A registry for committing Merkle roots to the blockchain for timestamping purposes.
 * @dev This contract allows users to commit Merkle roots with metadata for immutable timestamping.
 *      Each Merkle root can only be committed once, and metadata can be updated by the original committer.
 */
contract MerkleRootRegistry {
    /// @notice Maximum allowed length for metadata strings (2048 bytes to prevent gas exhaustion)
    uint256 public constant MAX_METADATA_LENGTH = 2048;

    /// @notice Custom error for when a Merkle root has already been committed
    error MerkleRootAlreadyCommitted(bytes32 merkleRoot);
    
    /// @notice Custom error for when metadata exceeds maximum length
    error MetadataTooLong(uint256 length, uint256 maxLength);
    
    /// @notice Custom error for when only the committer can update metadata
    error OnlyCommitterCanUpdate(address caller, address committer);
    
    /// @notice Custom error for when attempting to update non-existent commitment
    error CommitmentDoesNotExist(bytes32 merkleRoot);

    /**
     * @notice Commitment structure storing all details about a committed Merkle root
     * @dev Fields are ordered to optimize storage packing:
     *      - merkleRoot: bytes32 (1 slot)
     *      - committer: address (1 slot, but can be packed with blockNumber)
     *      - blockNumber: uint256 (1 slot)
     *      - timestamp: uint256 (1 slot)
     *      - metadata: string (dynamic, stored separately)
     */
    struct Commitment {
        bytes32 merkleRoot;
        address committer;
        uint256 blockNumber;
        uint256 timestamp;
        string metadata; // JSON metadata about the commitment (file count, size, etc.)
    }

    /// @notice Mapping from merkle root to commitment details
    mapping(bytes32 => Commitment) public commitments;

    /// @notice Mapping from user address to their committed roots
    mapping(address => bytes32[]) public userCommitments;

    /**
     * @notice Emitted when a Merkle root is committed to the blockchain
     * @param merkleRoot The committed Merkle root hash
     * @param committer The address that committed the root
     * @param blockNumber The block number at which the commitment was made
     * @param metadata JSON string containing metadata about the commitment
     */
    event MerkleRootCommitted(
        bytes32 indexed merkleRoot,
        address indexed committer,
        uint256 indexed blockNumber,
        string metadata
    );

    /**
     * @notice Emitted when metadata for a commitment is updated
     * @param merkleRoot The Merkle root whose metadata was updated
     * @param oldMetadata The previous metadata string
     * @param newMetadata The new metadata string
     */
    event MetadataUpdated(
        bytes32 indexed merkleRoot,
        string oldMetadata,
        string newMetadata
    );

    /**
     * @notice Commit a Merkle root to the blockchain with associated metadata
     * @dev Each Merkle root can only be committed once. Metadata length is limited to prevent gas exhaustion.
     * @param merkleRoot The Merkle root hash to commit (32 bytes)
     * @param metadata JSON string containing metadata about the commitment (max 2048 bytes)
     * @custom:security This function validates that the root hasn't been committed and metadata length is within limits
     */
    function commitMerkleRoot(bytes32 merkleRoot, string calldata metadata) external {
        // Check if root already committed (using custom error for gas efficiency)
        if (commitments[merkleRoot].committer != address(0)) {
            revert MerkleRootAlreadyCommitted(merkleRoot);
        }

        // Validate metadata length to prevent gas exhaustion attacks
        bytes memory metadataBytes = bytes(metadata);
        if (metadataBytes.length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(metadataBytes.length, MAX_METADATA_LENGTH);
        }

        Commitment memory commitment = Commitment({
            merkleRoot: merkleRoot,
            committer: msg.sender,
            blockNumber: block.number,
            timestamp: block.timestamp,
            metadata: metadata
        });

        commitments[merkleRoot] = commitment;
        userCommitments[msg.sender].push(merkleRoot);

        emit MerkleRootCommitted(merkleRoot, msg.sender, block.number, metadata);
    }

    /**
     * @notice Get commitment details for a Merkle root
     * @param merkleRoot The Merkle root to query
     * @return Commitment struct with all details (committer will be address(0) if not committed)
     */
    function getCommitment(bytes32 merkleRoot) external view returns (Commitment memory) {
        return commitments[merkleRoot];
    }

    /**
     * @notice Get all commitments by a user
     * @param user The address to query
     * @return Array of Merkle roots committed by the user
     */
    function getUserCommitments(address user) external view returns (bytes32[] memory) {
        return userCommitments[user];
    }

    /**
     * @notice Check if a Merkle root has been committed
     * @param merkleRoot The Merkle root to check
     * @return bool True if committed, false otherwise
     */
    function isCommitted(bytes32 merkleRoot) external view returns (bool) {
        return commitments[merkleRoot].committer != address(0);
    }

    /**
     * @notice Get the total number of commitments by a user
     * @param user The address to query
     * @return uint256 Number of commitments
     */
    function getUserCommitmentCount(address user) external view returns (uint256) {
        return userCommitments[user].length;
    }

    /**
     * @notice Update metadata for an existing commitment (only by committer)
     * @dev Only the original committer can update metadata. Metadata length is validated.
     * @param merkleRoot The Merkle root whose metadata to update
     * @param newMetadata The new metadata string (max 2048 bytes)
     * @custom:security This function validates ownership and metadata length
     */
    function updateMetadata(bytes32 merkleRoot, string calldata newMetadata) external {
        Commitment storage commitment = commitments[merkleRoot];
        
        // Check if commitment exists
        if (commitment.committer == address(0)) {
            revert CommitmentDoesNotExist(merkleRoot);
        }
        
        // Check if caller is the committer
        if (commitment.committer != msg.sender) {
            revert OnlyCommitterCanUpdate(msg.sender, commitment.committer);
        }

        // Validate new metadata length
        bytes memory metadataBytes = bytes(newMetadata);
        if (metadataBytes.length > MAX_METADATA_LENGTH) {
            revert MetadataTooLong(metadataBytes.length, MAX_METADATA_LENGTH);
        }

        string memory oldMetadata = commitment.metadata;
        commitment.metadata = newMetadata;

        emit MetadataUpdated(merkleRoot, oldMetadata, newMetadata);
    }
}
