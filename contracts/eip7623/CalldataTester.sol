// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * EIP-7623 Calldata Cost Tester
 *
 * This contract is used to test the EIP-7623 calldata cost changes.
 *
 * EIP-7623: Increase calldata cost to reduce maximum block size
 * https://eips.ethereum.org/EIPS/eip-7623
 *
 * Key Parameters:
 * - STANDARD_TOKEN_COST: 4 (standard calldata cost)
 * - TOTAL_COST_FLOOR_PER_TOKEN: 10 (floor cost for data-heavy tx)
 * - Zero byte: 1 gas
 * - Non-zero byte: 4 gas (normally), 10 gas (with floor)
 *
 * Test Scenarios:
 * 1. Data-heavy tx: calldata cost dominated, uses floor cost (10/40)
 * 2. Execution-heavy tx: execution gas high, uses standard cost (4/16)
 * 3. ETH transfer: 21000 gas, no calldata
 * 4. Contract creation: 32000 + initcode cost
 */

contract CalldataTester {

    /// @notice Counter for tracking calls
    uint256 public callCount;

    /// @notice Storage slot for testing storage writes
    mapping(uint256 => uint256) public storageSlots;

    /// @notice Event for testing
    event ValueSet(uint256 indexed slot, uint256 value);
    event ComputationCompleted(uint256 iterations, uint256 result);

    /**
     * @notice Empty call - minimal execution gas, tests floor cost
     * @dev This function does nothing, so execution gas is minimal
     *      Calldata cost will dominate, triggering floor cost
     *      Changed to nonpayable to create actual transaction
     */
    function emptyCall() external returns (uint256) {
        callCount++;
        return 0;
    }

    /**
     * @notice Empty call with return data - tests zero bytes
     * @dev Returns fixed 32 bytes of zeros
     */
    function emptyCallZeroBytes() external returns (bytes32) {
        callCount++;
        return bytes32(0);
    }

    /**
     * @notice Empty call with return data - tests non-zero bytes
     * @dev Returns 32 bytes of non-zero data
     */
    function emptyCallNonZeroBytes() external returns (bytes32) {
        callCount++;
        return bytes32(uint256(1));
    }

    /**
     * @notice Expensive computation - high execution gas
     * @dev Loop runs many times to consume execution gas
     *      When execution gas > floor cost, uses standard calldata cost
     */
    function expensiveComputation(uint256 iterations) external returns (uint256) {
        uint256 result = 0;
        for (uint256 i = 0; i < iterations; i++) {
            // Use checked math to avoid overflow
            result += i;
            // Some storage operations to increase gas
            if (result > 1000000) {
                result = result % 1000000;
            }
        }
        emit ComputationCompleted(iterations, result);
        return result;
    }

    /**
     * @notice Write to storage - tests storage operations
     * @dev Each SSTORE costs significant gas
     */
    function writeStorage(uint256 slot, uint256 value) external returns (bool) {
        storageSlots[slot] = value;
        emit ValueSet(slot, value);
        return true;
    }

    /**
     * @notice Batch write to storage - for EIP-7623 execution-heavy tests
     * @dev Each SSTORE costs significant gas (~20000 for cold storage)
     *      This is used to test that execution gas is counted in EIP-7623 formula
     */
    function batchWriteStorage(uint256 count) external returns (uint256) {
        for (uint256 i = 0; i < count; i++) {
            storageSlots[i] = i;
        }
        return count;
    }

    /**
     * @notice Read from storage - cheaper than write
     */
    function readStorage(uint256 slot) external view returns (uint256) {
        return storageSlots[slot];
    }

    /**
     * @notice Multiple storage reads
     */
    function multiRead(uint256[] calldata slots) external view returns (uint256[] memory) {
        uint256[] memory values = new uint256[](slots.length);
        for (uint256 i = 0; i < slots.length; i++) {
            values[i] = storageSlots[slots[i]];
        }
        return values;
    }

    /**
     * @notice Function with large calldata - pure data
     * @dev Accepts large bytes array, does nothing with it
     */
    function processCalldata(bytes calldata data) external pure returns (uint256) {
        // Just return the length, no processing
        return data.length;
    }

    /**
     * @notice Reverting function for testing failed transactions
     */
    function revertWithReason(string calldata reason) external pure {
        revert(reason);
    }

    /**
     * @notice Function that uses all gas (for testing gas limit)
     */
    function consumeAllGas() external {
        while (true) {
            // Will run out of gas
        }
    }

    /**
     * @notice Get contract code size (for EOF tests)
     */
    function getCodeSize() external view returns (uint256) {
        return address(this).code.length;
    }

    /**
     * @notice Counter increment
     */
    function increment() external returns (uint256) {
        callCount++;
        return callCount;
    }
}

