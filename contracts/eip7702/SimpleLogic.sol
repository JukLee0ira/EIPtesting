// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title SimpleLogic
 * @notice Simple logic contract for testing EIP-7702 code delegation functionality
 * @dev This contract will be used by EOA accounts through EIP-7702 authorization
 */
contract SimpleLogic {
    // Storage value
    uint256 private value;
    
    // Events
    event ValueSet(address indexed setter, uint256 newValue);
    event ValueIncremented(address indexed caller, uint256 newValue);
    
    /**
     * @notice Set storage value
     * @param _value New value to set
     */
    function setValue(uint256 _value) external {
        value = _value;
        emit ValueSet(msg.sender, _value);
    }
    
    /**
     * @notice Get current storage value
     * @return Current value
     */
    function getValue() external view returns (uint256) {
        return value;
    }
    
    /**
     * @notice Increment counter
     */
    function increment() external {
        value += 1;
        emit ValueIncremented(msg.sender, value);
    }
    
    /**
     * @notice Execute multiple operations (test batch transactions)
     * @param _value Value to set
     */
    function batchOperation(uint256 _value) external {
        value = _value;
        value += 10;
        emit ValueSet(msg.sender, value);
    }
    
    /**
     * @notice Function that will revert
     */
    function revertOperation() external pure {
        revert("Intentional revert for testing");
    }
    
    /**
     * @notice Get contract version
     */
    function getVersion() external pure returns (string memory) {
        return "SimpleLogic v1.0";
    }

    /**
     * @notice Receive function to accept ETH transfers / empty calldata calls
     * @dev Helps EIP-7702 "delegation-only" txs with empty data not revert
     */
    receive() external payable {}

    /**
     * @notice Fallback function to handle unknown / empty function calls
     * @dev Helps EIP-7702 tests where delegation is updated without calling a known function
     */
    fallback() external payable {}
}



