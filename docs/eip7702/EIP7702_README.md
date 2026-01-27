# EIP-7702 Test Documentation

## Test Overview

This test suite implements EIP-7702 core functionality tests based on the specification, including four core test dimensions and comprehensive tests, totaling 10 test cases.

**Test Framework**: Hardhat + Ethers.js v6  
**Solidity Version**: 0.8.28

---


## Running Tests

**Prerequisites**
- Ensure your network supports EIP-7702. If testing on a private network, you can activate it by modifying the node's `genesis.json`:

```json
{
  "config": {
    "chainId": 20986,
    "pragueBlock": 0,  // Activation height
    ...
  }
}
```

- **Set environment variables**: `RPC_URL` + at least 4 private keys (`PRIVATE_KEYS=key1,key2,key3,key4`, see `example.env` in the root directory).

---

### 1. Install Dependencies

```bash
npm install
```
 
### 2. Compile Contracts

```bash
npx hardhat compile
```

### 3. Run Tests

```bash
# Run on private network myNet (requires EIP-7702 support)
npx hardhat test test/eip7702.test.ts --network myNet
```


### 4. View Detailed Output

```bash
npx hardhat test test/eip7702.test.ts --verbose
```



## Test Dimensions

### A. Core Functionality Test: Code Delegation

#### A1. Test EOA Successfully Sets Code Delegation

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "A1. Test EOA Successfully Sets Code Delegation" --network myNet
```

**Test Purpose:**
- Verify that an EOA account can successfully set its code to the target contract via a `0x04` transaction

**Test Steps:**
1. Get accountA's initial nonce
2. Create authorization signature pointing to SimpleLogic contract
3. Send Type `0x04` transaction
4. Verify accountA's code becomes delegation marker

**Expected Output:**
- Calling `eth_getCode` returns: `0xef0100 || contract address`
- Can call SimpleLogic functions through EOA
- accountA's nonce increases by 1


---

#### A2. Test Calling Functions Through Delegated EOA

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "A2. Test Calling Functions Through Delegated EOA" --network myNet
```

**Test Purpose:**
- Verify that a delegated EOA can successfully execute target contract functions

**Test Steps:**
1. Delegate accountA to SimpleLogic
2. Call `setValue(12345)` through accountA
3. Call `getValue()` through accountA to verify result

**Expected Output:**
- setValue transaction succeeds
- getValue returns 12345
- `ValueSet` event is emitted

---

#### A3. Test Getting Contract Version Info

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "A3. Test Getting Contract Version Info" --network myNet
```

**Test Purpose:**
- Verify that view functions can be called after delegation

**Test Steps:**
1. Call `getVersion()` function

**Expected Output:**
- Returns "SimpleLogic v1.0"
- No gas consumption (view function)

---

### B. Account Abstraction Features Test

#### B1. Test Gas Sponsorship

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "B1. Test Gas Sponsorship" --network myNet
```

**Test Purpose:**
- Verify that account A signs authorization, but account B initiates transaction and pays gas

**Test Steps:**
1. accountA signs authorization (delegating to SimpleLogic)
2. accountB acts as transaction initiator (`tx.origin`)
3. accountB pays gas, but accountA's logic is executed

**Expected Output:**
- accountB's balance decreases (paid gas)
- accountA's logic is executed
- `msg.sender` is accountB
- Authorization signer is accountA


---

#### B2. Test Transaction Batching

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "B2. Test Transaction Batching" --network myNet
```

**Test Purpose:**
- Verify executing multiple operations in a single transaction

**Test Steps:**
1. Call `batchOperation(100)` function
2. This function internally executes: set value to 100, then add 10

**Expected Output:**
- Initial value: 100
- Final value: 110 (initial value + 10)
- Single transaction completes multiple state changes

---


### C. Boundary and Security Tests

#### C1. Test Invalid Nonce Authorization

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "C1. Test Invalid Nonce Authorization" --network myNet
```

**Test Purpose:**
- Verify that authorization tuple is skipped when nonce doesn't match

**Test Steps:**
1. Get accountC's current nonce
2. Create authorization with wrong nonce (current nonce + 999)
3. Attempt to send transaction

**Expected Output:**
- The authorization tuple is skipped
- Transaction doesn't fail, but authorization doesn't take effect
- accountC remains as normal EOA
- Code remains as `0x`


---


#### C4. Test Conditional Revert

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "C4. Test Conditional Revert" --network myNet
```

**Test Purpose:**
- Test revert when require condition fails

**Test Steps:**
1. Call `conditionalRevert(50)` - should fail
2. Call `conditionalRevert(150)` - should succeed

**Expected Output:**
- Value < 100: reverts with error message "Value must be greater than 100"
- Value > 100: succeeds, counter updates to 150

---

### D. Override and Cleanup Tests

#### D1. Test Reset Authorization (Clear Code Delegation)

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "D1. Test Reset Authorization" --network myNet
```

**Test Purpose:**
- Verify that sending authorization with address `0x0` can clear code delegation

**Test Steps:**
1. First set code delegation
2. Send authorization with address `0x0`
3. Verify account reverts to normal EOA

**Expected Output:**
- EOA's code is cleared
- Account code hash reverts to empty hash:
  ```
  0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
  ```
- Account reverts to normal EOA state


---

#### D2. Test Multiple Delegation Overrides

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "D2. Test Multiple Delegation Overrides" --network myNet
```

**Test Purpose:**
- Verify that when delegating multiple times, the last valid authorization takes effect

**Test Steps:**
1. First delegate to SimpleLogic
2. Then delegate to BatchOperations
3. Verify final code uses BatchOperations

**Expected Output:**
- If multiple authorizations point to the same account, use the last valid authorization
- Account code updates to the latest delegation target
- Old delegation is overridden

---


### E. Comprehensive Test

#### E1. Complete Flow Test

**Test Command:**
```bash
npx hardhat test test/eip7702.test.ts --grep "E1. Complete Flow Test" --network myNet
```

**Test Purpose:**
- Execute a complete EIP-7702 usage flow

**Flow:**
1. ✓ Deploy logic contract
2. EOA signs authorization
3. Send Type 0x04 transaction
4. Verify code delegation
5. Execute delegated contract functions (setValue, increment)
6. Clear delegation

**Expected Output:**
- All steps execute successfully
- Final state is correct

---


## Contract Descriptions

### SimpleLogic.sol

**Features:**
- Basic state storage and retrieval
- Increment operation
- Batch operations
- Revert testing

**Main Functions:**
```solidity
function setValue(uint256 _value) external
function getValue() external view returns (uint256)
function increment() external
function batchOperation(uint256 _value) external
function revertOperation() external pure
function getVersion() external pure returns (string memory)
```

---

### BatchOperations.sol

**Features:**
- Complex batch operations
- Operation history tracking

**Main Functions:**
```solidity
function executeOperation(uint256 operationId, uint256 value) external
function executeBatch(uint256[] calldata values) external
function getOperationCount(address user) external view returns (uint256)
function clearHistory() external
```

---

### RevertTest.sol

**Features:**
- Test revert scenarios
- Conditional validation

**Main Functions:**
```solidity
function successfulOperation(uint256 _value) external
function failingOperation() external pure
function conditionalRevert(uint256 _value) external
```


