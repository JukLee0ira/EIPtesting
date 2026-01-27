// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title BatchOperations
 * @notice Contract for testing batch operations and complex transactions
 */
contract BatchOperations {
    // Store results of multiple operations
    mapping(address => uint256[]) public operationHistory;
    
    event OperationExecuted(address indexed executor, uint256 operationId, uint256 value);
    event BatchCompleted(address indexed executor, uint256 operationCount);
    
    /**
     * @notice Execute single operation
     */
    function executeOperation(uint256 operationId, uint256 value) external {
        operationHistory[msg.sender].push(value);
        emit OperationExecuted(msg.sender, operationId, value);
    }
    
    /**
     * @notice Execute batch operations
     */
    function executeBatch(uint256[] calldata values) external {
        for (uint256 i = 0; i < values.length; i++) {
            operationHistory[msg.sender].push(values[i]);
            emit OperationExecuted(msg.sender, i, values[i]);
        }
        emit BatchCompleted(msg.sender, values.length);
    }
    
    /**
     * @notice Get operation history count
     */
    function getOperationCount(address user) external view returns (uint256) {
        return operationHistory[user].length;
    }
    
    /**
     * @notice Clear operation history
     */
    function clearHistory() external {
        delete operationHistory[msg.sender];
    }
}



