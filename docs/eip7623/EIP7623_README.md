# EIP-7623 Test Documentation

## Test Overview

This test suite tests EIP-7623 core functions. The proposal aims to increase calldata cost to reduce max block size. Total: 7 test cases.

**Test Method**: Send real ETH transfer transactions with different calldata sizes. Verify gas usage patterns. 

**Test Framework**: Hardhat + Ethers.js v6  
**Solidity Version**: 0.8.28

---

## EIP-7623 Specification Summary

EIP-7623 adds `TOTAL_COST_FLOOR_PER_TOKEN` to increase calldata cost for data-heavy transactions:

- **Parameters**:
  - `STANDARD_TOKEN_COST = 4`
  - `TOTAL_COST_FLOOR_PER_TOKEN = 10`
  - `tokens_in_calldata = zero_bytes + nonzero_bytes * 4`

- **New Gas Formula**:
```
tx.gasUsed = 21000 + max(
    STANDARD_TOKEN_COST * tokens_in_calldata + execution_gas_used,
    TOTAL_COST_FLOOR_PER_TOKEN * tokens_in_calldata
)
```

- **Impact**:
  - Data-heavy transactions (lots of calldata, low execution gas): cost goes from 4/16 to 10/40 gas/byte
  - Execution-heavy transactions (high execution gas): cost stays at 4/16 gas/byte
  - Regular ETH transfers are NOT affected

---

## Running Tests

**Prerequisites**
- Make sure the network supports EIP-7623 upgrade. For private networks, enable in genesis config:

```json
{
  "config": {
    "chainId": 20986,
    "pragueBlock": 0,
    ...
  }
}
```

- **Set env vars**: `RPC_URL` + at least 2 private keys (`PRIVATE_KEYS=key1,key2`, see `example.env` in root).

---

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

```bash
npx hardhat test test/eip7623.test.ts --network <network option>
```

### 3. View Detailed Output

```bash
npx hardhat test test/eip7623.test.ts --verbose
```

---

## Test Cases

### A. Calldata Cost Calculation Tests

#### A1. Test Data-Heavy Transaction Pays Floor Cost

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A1. Test Data-Heavy Transaction Pays Floor Cost" --network myNet
```

**Test Purpose:**
- Check that floor cost is used when calldata is large but execution gas is low

**Test Steps:**
1. Create a large calldata transaction (1000 bytes of non-zero data)
2. Send transaction and get actual gas used
3. Calculate floor cost: `10 * (zero_bytes + nonzero_bytes * 4)`
4. Assert actual gas >= floor cost

**Expected Output:**
- EIP-7623 NOT enabled: ~37000 gas (21000 + 1000*4*4)
- EIP-7623 enabled: >= 61000 gas (21000 + 1000*4*10)

**Assertion:**
```typescript
expect(gasUsed).to.be.gte(61000n);
```

---

#### A2. Test Non-Zero Bytes Pay Floor Cost

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A2. Test Non-Zero Bytes Pay Floor Cost" --network myNet
```

**Test Purpose:**
- Check that EIP-7623 applies floor cost to non-zero bytes (10 gas/token)
- **This is a key test to verify EIP-7623 is enabled**

**Test Steps:**
1. Send transaction with only zero bytes (64 bytes, value 0x00)
2. Send transaction with only non-zero bytes (64 bytes, value 0xab)
3. Assert non-zero bytes meet EIP-7623 floor cost (>= 23560 gas)

**Expected Output:**
- Without EIP-7623: ~22024 gas (21000 + 64*4*4)
- With EIP-7623: >= 23560 gas (21000 + 64*4*10)

**Key Assertion:**
```typescript
expect(gasUsed2).to.be.gte(23560n);  // Non-zero bytes must meet floor cost
```

---

### B. Transaction Validity Tests

#### B2. Test Regular ETH Transfer Unaffected

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "B2. Test Regular ETH Transfer Unaffected" --network myNet
```

**Test Purpose:**
- Check that regular ETH transfers (no calldata) are NOT affected by EIP-7623

**Test Steps:**
1. Send 0 ETH transfer (no calldata: `0x`)
2. Verify gas used = 21000

**Expected Output:**
- Gas used = 21000 (base fee)
- Transaction succeeds

---

### C. Edge Cases

#### C1. Test Pure Empty Calldata

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C1. Test Pure Empty Calldata" --network myNet
```

**Test Purpose:**
- Check the special case of empty calldata

**Test Steps:**
1. Send transaction with no calldata
2. Verify gas calculation works

**Expected Output:**
- tokens_in_calldata = 0
- Base gas = 21000

---

#### C2. Test Medium Calldata

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C2. Test Medium Calldata" --network myNet
```

**Test Purpose:**
- Check gas usage for medium calldata (100 bytes)

**Test Steps:**
1. Send transaction with 100 bytes of non-zero calldata
2. Verify gas meets floor cost

**Expected Output:**
- Floor cost: 25000 gas (21000 + 100*4*10)
- Actual gas >= 25000

---

#### C3. Test Pure Zero Bytes

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C3. Test Pure Zero Bytes" --network myNet
```

**Test Purpose:**
- Check EIP-7623 floor cost for zero bytes
- EIP-7623 treats zero and non-zero bytes differently:
  - Zero byte: 1 token (standard) → 10 tokens (floor)
  - Non-zero byte: 4 tokens (standard) → 40 tokens (floor)

**Test Steps:**
1. Send pure zero byte transaction (64 bytes 0x00)
2. Verify gas meets floor cost

**Expected Output:**
- Without EIP-7623: 21064 gas (21000 + 64*1)
- With EIP-7623: 21640 gas (21000 + 64*10)

---

#### C4. Test Mixed Calldata (Zero + Non-Zero Bytes)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C4. Test Mixed Calldata" --network myNet
```

**Test Purpose:**
- Check EIP-7623 handles mixed calldata (zero bytes + non-zero bytes)

**Test Steps:**
1. Send mixed calldata transaction (32 zero bytes + 32 non-zero bytes)
2. Verify gas meets floor cost

**Expected Output:**
- Tokens = 32*1 + 32*4 = 160
- Floor cost: 22600 gas (21000 + 160*10)

---

## Common Test Commands

```bash
# Run all EIP-7623 tests
npx hardhat test test/eip7623.test.ts --network myNet

# Run specific test category
npx hardhat test test/eip7623.test.ts --grep "Calldata Cost" --network myNet
npx hardhat test test/eip7623.test.ts --grep "Transaction Validity" --network myNet
npx hardhat test test/eip7623.test.ts --grep "Edge Cases" --network myNet

# Run single test
npx hardhat test test/eip7623.test.ts --grep "A1. Test Data-Heavy" --network myNet

# Run multiple tests by pattern
npx hardhat test test/eip7623.test.ts --grep "A1" --network myNet
npx hardhat test test/eip7623.test.ts --grep "A2" --network myNet
npx hardhat test test/eip7623.test.ts --grep "C2" --network myNet

# Check gas used in detail
npx hardhat test test/eip7623.test.ts --grep "Test Name" --network myNet --verbose

# Quick check: just show pass/fail
npx hardhat test test/eip7623.test.ts --network myNet 2>&1 | grep -E "passing|failing"
```

---

## Expected Results

| Test Case | Without EIP-7623 | With EIP-7623 |
|-----------|------------------|---------------|
| A1: Data-heavy tx (1000 bytes) | ~37000 gas | >= 61000 gas |
| A2: Non-zero bytes (64 bytes) | ~22024 gas | >= 23560 gas |
| B2: ETH transfer | 21000 gas | 21000 gas |
| C1: Empty calldata | 21000 gas | 21000 gas |
| C2: Medium calldata (100 bytes) | ~22600 gas | >= 25000 gas |
| C3: Pure zero bytes (64 bytes) | 21064 gas | 21640 gas |
| C4: Mixed (32+32 bytes) | 21160 gas | >= 22600 gas |
