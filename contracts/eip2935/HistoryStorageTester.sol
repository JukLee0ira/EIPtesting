// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * EIP-2935 History Storage Tester
 *
 * This contract is used to test the EIP-2935 precompiled contract
 * for block hash history storage.
 *
 * EIP-2935: History storage extension
 * https://eips.ethereum.org/EIPS/eip-2935
 *
 * Key Constants:
 * - HISTORY_STORAGE_ADDRESS: 0x0000F90827F1C53a10cb7A02335B175320002935
 * - HISTORY_SERVE_WINDOW: 8191 (ring buffer size)
 * - SYSTEM_ADDRESS: 0xfffffffffffffffffffffffffffffffffffffffe
 */
contract HistoryStorageTester {

    /// @notice EIP-2935 history storage precompiled contract address
    address constant HISTORY_STORAGE_ADDRESS = 0x0000F90827F1C53a10cb7A02335B175320002935;

    /// @notice Ring buffer size defined by EIP-2935
    uint256 constant HISTORY_SERVE_WINDOW = 8191;

    /// @notice System address that can perform set operations
    address constant SYSTEM_ADDRESS = 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE;

    /// @notice Error returned when block number is out of valid range
    error InvalidBlockNumber();

    /// @notice Error returned when calldata validation fails
    error InvalidCalldata();

    /// @notice Stores the result of the last getBlockHash call
    bytes32 public lastRetrievedHash;

    /// @notice Stores the block number used in the last getBlockHash call
    uint256 public lastQueriedBlockNumber;

    /// @notice Flag indicating if the last call was successful
    bool public lastCallSuccess;

    /// @notice Counter for tracking call attempts
    uint256 public callAttemptCount;

    /// @notice Counter for successful calls
    uint256 public successfulCallCount;

    /**
     * @notice Get block hash for a given block number
     * @dev Calls the EIP-2935 precompiled contract
     * @param blockNumber The block number to query (must be within valid range)
     */
    function getBlockHash(uint256 blockNumber) external {
        callAttemptCount++;

        // EIP-2935 uses raw call with 32-byte calldata
        // Using assembly for direct EVM call
        bytes32 result;
        bool success;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, blockNumber)
            success := call(gas(), HISTORY_STORAGE_ADDRESS, 0, ptr, 32, ptr, 32)
            result := mload(ptr)
        }

        lastQueriedBlockNumber = blockNumber;

        if (success) {
            lastRetrievedHash = result;
            lastCallSuccess = true;
            successfulCallCount++;
        } else {
            lastRetrievedHash = bytes32(0);
            lastCallSuccess = false;
            revert InvalidBlockNumber();
        }
    }

    /**
     * @notice Try to get block hash, stores result in state variables
     * @param blockNumber The block number to query
     * @return success Whether the call succeeded (via lastCallSuccess)
     */
    function tryGetBlockHash(uint256 blockNumber) external returns (bool) {
        callAttemptCount++;

        // Using assembly for direct EVM call
        bytes32 result;
        bool success;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, blockNumber)
            success := call(gas(), HISTORY_STORAGE_ADDRESS, 0, ptr, 32, ptr, 32)
            result := mload(ptr)
        }

        lastQueriedBlockNumber = blockNumber;

        if (success) {
            lastRetrievedHash = result;
            lastCallSuccess = true;
            successfulCallCount++;
            return true;
        } else {
            lastRetrievedHash = bytes32(0);
            lastCallSuccess = false;
            return false;
        }
    }

    /**
     * @notice Get block hash using inline assembly
     * @param blockNumber The block number to query
     * @return success Whether the call succeeded
     * @return hash The block hash if successful
     */
    function getBlockHashAssembly(uint256 blockNumber) external view returns (bool success, bytes32 hash) {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, blockNumber)
            success := staticcall(gas(), HISTORY_STORAGE_ADDRESS, ptr, 32, ptr, 32)
            hash := mload(ptr)
        }
    }

    /**
     * @notice Get the storage slot for a specific block number
     * @dev Calculates the ring buffer slot: (blockNumber - 1) % HISTORY_SERVE_WINDOW
     * @param blockNumber The block number to calculate slot for
     * @return slot The storage slot index
     */
    function getStorageSlot(uint256 blockNumber) external pure returns (uint256) {
        return (blockNumber - 1) % HISTORY_SERVE_WINDOW;
    }

    /**
     * @notice Check if a block number is within valid retrieval range
     * @param blockNumber The block number to check
     * @param currentBlockNumber The current block number
     * @return True if block number is valid (within HISTORY_SERVE_WINDOW of current)
     */
    function isValidBlockNumber(uint256 blockNumber, uint256 currentBlockNumber) external pure returns (bool) {
        if (blockNumber >= currentBlockNumber) {
            return false; // Future block
        }
        uint256 diff = currentBlockNumber - blockNumber;
        return diff > 0 && diff <= HISTORY_SERVE_WINDOW;
    }

    /**
     * @notice Get the effective lower bound block number
     * @param currentBlockNumber The current block number
     * @return The oldest block number that can be queried
     */
    function getLowerBoundBlockNumber(uint256 currentBlockNumber) external pure returns (uint256) {
        if (currentBlockNumber <= HISTORY_SERVE_WINDOW) {
            return 0; // Before history window is full
        }
        return currentBlockNumber - HISTORY_SERVE_WINDOW;
    }

    /**
     * @notice Validate calldata for get operation
     * @param data The calldata to validate
     * @return True if calldata is valid (32 bytes)
     */
    function validateCalldata(bytes calldata data) external pure returns (bool) {
        return data.length == 32;
    }

    /**
     * @notice Test with empty calldata (should revert)
     */
    function testEmptyCalldata() external returns (bool) {
        callAttemptCount++;

        bool success;
        assembly {
            success := call(gas(), HISTORY_STORAGE_ADDRESS, 0, 0x00, 0x00, 0x00, 0x00)
        }

        if (!success) {
            lastCallSuccess = false;
            return false;
        }
        lastCallSuccess = true;
        return true;
    }

    /**
     * @notice Test with short calldata (should revert)
     * @param data The short calldata
     */
    function testShortCalldata(bytes calldata data) external returns (bool) {
        callAttemptCount++;

        require(data.length < 32, "Data must be less than 32 bytes");
        bool success;
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 4, data.length)
            success := call(gas(), HISTORY_STORAGE_ADDRESS, 0, ptr, data.length, 0x00, 0x00)
        }
        if (!success) {
            lastCallSuccess = false;
            return false;
        }
        lastCallSuccess = true;
        return true;
    }

    /**
     * @notice Get the ring buffer size (HISTORY_SERVE_WINDOW)
     * @return The ring buffer size
     */
    function getRingBufferSize() external pure returns (uint256) {
        return HISTORY_SERVE_WINDOW;
    }

    /**
     * @notice Get the history storage address
     * @return The precompiled contract address
     */
    function getHistoryStorageAddress() external pure returns (address) {
        return HISTORY_STORAGE_ADDRESS;
    }

    /**
     * @notice Get the system address
     * @return The system address for set operations
     */
    function getSystemAddress() external pure returns (address) {
        return SYSTEM_ADDRESS;
    }

    /**
     * @notice Reset all counters and state
     */
    function resetState() external {
        callAttemptCount = 0;
        successfulCallCount = 0;
        lastCallSuccess = false;
        lastRetrievedHash = bytes32(0);
        lastQueriedBlockNumber = 0;
    }

    /**
     * @notice Get call statistics
     * @return attempts Total call attempts
     * @return successes Successful calls
     */
    function getCallStats() external view returns (uint256 attempts, uint256 successes) {
        return (callAttemptCount, successfulCallCount);
    }
}
