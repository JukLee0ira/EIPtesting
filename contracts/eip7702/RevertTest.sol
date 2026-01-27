// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title RevertTest
 * @notice Contract for testing revert scenarios
 */
contract RevertTest {
    uint256 public counter;
    
    event CounterUpdated(uint256 newValue);
    
    /**
     * @notice Successful operation
     */
    function successfulOperation(uint256 _value) external {
        counter = _value;
        emit CounterUpdated(_value);
    }
    
    /**
     * @notice Operation that will revert
     */
    function failingOperation() external pure {
        revert("This operation always fails");
    }
    
    /**
     * @notice Conditional revert
     */
    function conditionalRevert(uint256 _value) external {
        require(_value > 100, "Value must be greater than 100");
        counter = _value;
        emit CounterUpdated(_value);
    }
}



