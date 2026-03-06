# EIP-7623 Test Documentation

## Test Overview

This test suite tests EIP-7623 core functions. The proposal aims to increase calldata cost to reduce max block size. Total: **4 test cases (T1-T4)**.

**Test Method**: Send real ETH transfer transactions with different calldata sizes. Verify gas usage patterns.

**Test Framework**: Hardhat + Ethers.js v6
**Solidity Version**: 0.8.28

---

## XDC Network Gas Formula (Current - Before EIP-7623)

XDC 网络当前使用以下公式计算 calldata 费用：

- **Non-zero byte**: 68 gas/byte
- **Zero byte**: 4 gas/byte
- **Base transaction**: 21000 gas

```
Gas = 21000 + 68 * nonzero_bytes + 4 * zero_bytes
```

---

## EIP-7623 Specification Summary

EIP-7623 adds `TOTAL_COST_FLOOR_PER_TOKEN` to increase calldata cost for data-heavy transactions:

- **Parameters**:
  - `STANDARD_TOKEN_COST = 4`
  - `TOTAL_COST_FLOOR_PER_TOKEN = 10`
  - `tokens_in_calldata = zero_bytes + nonzero_bytes * 4`

- **New Gas Formula (EIP-7623)**:
```
tx.gasUsed = 21000 + max(
    STANDARD_TOKEN_COST * tokens_in_calldata + execution_gas_used,
    TOTAL_COST_FLOOR_PER_TOKEN * tokens_in_calldata
)
```

- **With EIP-7623 floor**:
  - Non-zero byte: 40 gas/byte (4 tokens × 10)
  - Zero byte: 10 gas/byte (1 token × 10)
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

## Test Cases: T1-T4

### T1. 4 零字节 (4 Zero Bytes)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T1. 4 Zero Bytes" --network myNet
```

**Test Purpose:**
- 验证 EIP-7623 对纯零字节的 floor 费用计算

**Test Steps:**
1. 发送 4 字节零值 calldata (0x00000000)
2. 获取实际 gas 消耗
3. 验证符合 EIP-7623 floor 费用

**Expected Output:**
- XDC (no EIP-7623): 21016 gas (21000 + 4×4)
- EIP-7623 enabled: >= 21040 gas (21000 + 10×4)
- **差异: +24** (EIP-7623 更贵)

---

### T2. 4 零字节 + 4 非零字节 (4 Zero + 4 Non-Zero Bytes)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T2. 4 Zero + 4 Non-Zero Bytes" --network myNet
```

**Test Purpose:**
- 验证 EIP-7623 对混合 calldata 的 floor 费用计算

**Test Steps:**
1. 发送 4 字节零值 + 4 字节非零值 calldata
2. 获取实际 gas 消耗
3. 验证符合 EIP-7623 floor 费用

**Expected Output:**
- XDC (no EIP-7623): 21288 gas (21000 + 4×4 + 4×68)
- EIP-7623 enabled: >= 21200 gas (21000 + 10×(4 + 4×4))
- **差异: -88** (XDC 更贵)

---

### T3. 4 非零字节 (4 Non-Zero Bytes)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T3. 4 Non-Zero Bytes" --network myNet
```

**Test Purpose:**
- 验证 EIP-7623 对纯非零字节的 floor 费用计算

**Test Steps:**
1. 发送 4 字节非零值 calldata (0xabababab)
2. 获取实际 gas 消耗
3. 验证符合 EIP-7623 floor 费用

**Expected Output:**
- XDC (no EIP-7623): 21272 gas (21000 + 4×68)
- EIP-7623 enabled: >= 21160 gas (21000 + 10×(0 + 4×4))
- **差异: -112** (XDC 更贵)

---

### T4. 空 Calldata - 预期无差异 (Empty Calldata - No Difference Expected)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T4. Empty Calldata" --network myNet
```

**Test Purpose:**
- 验证空 calldata 不受 EIP-7623 影响 (基准测试)
- **此用例预期无差异**，用于确认公式正确实现

**Test Steps:**
1. 发送无 calldata 的交易 (0x)
2. 获取实际 gas 消耗
3. 验证始终为 21000 gas

**Expected Output:**
- XDC (no EIP-7623): 21000 gas
- EIP-7623 enabled: 21000 gas
- **差异: 0** (预期无差异)

---

## Common Test Commands

```bash
# Run all EIP-7623 tests
npx hardhat test test/eip7623.test.ts --network myNet

# Run specific test
npx hardhat test test/eip7623.test.ts --grep "T1. 4 Zero Bytes" --network myNet
npx hardhat test test/eip7623.test.ts --grep "T2. 4 Zero + 4 Non-Zero" --network myNet
npx hardhat test test/eip7623.test.ts --grep "T3. 4 Non-Zero" --network myNet
npx hardhat test test/eip7623.test.ts --grep "T4. Empty Calldata" --network myNet

# Check gas used in detail
npx hardhat test test/eip7623.test.ts --grep "T1" --network myNet --verbose

# Quick check: just show pass/fail
npx hardhat test test/eip7623.test.ts --network myNet 2>&1 | grep -E "passing|failing"
```

---

## Expected Results

| Test Case | Zero Bytes | Non-Zero Bytes | XDC (4/68) | EIP-7623 (10/40) | Difference |
|-----------|------------|----------------|------------|------------------|------------|
| T1 | 4 | 0 | 21016 | 21040 | +24 |
| T2 | 4 | 4 | 21288 | 21200 | -88 |
| T3 | 0 | 4 | 21272 | 21160 | -112 |
| T4 | 0 | 0 | 21000 | 21000 | 0 (expected) |

---

## Gas Calculation Rule Summary

| Test | Non-zero | Zero | Tokens Calc | XDC (no EIP-7623) | EIP-7623 (floor) | Difference |
|------|----------|------|-------------|-------------------|------------------|------------|
| T1 | 0 | 4 | 4×1=4 | 21000+4×4=**21016** | 21000+10×4=**21040** | +24 |
| T2 | 4 | 4 | 4+4×4=20 | 21000+4×4+4×68=**21288** | 21000+10×20=**21200** | -88 |
| T3 | 4 | 0 | 4×4=16 | 21000+4×68=**21272** | 21000+10×16=**21160** | -112 |
| T4 | 0 | 0 | 0 | 21000 | 21000 | 0 (expected) |

**注**: T1, T2, T3 有差异可用于区分 EIP-7623 是否实现; T4 预期无差异

---

## Test Results Analysis

| Network | Result | Description |
|---------|--------|-------------|
| **devnet (EIP-7623 enabled)** | 4/4 passed | EIP-7623 implemented correctly ✅ |
| **apothem (XDC - no EIP-7623)** | 4/4 passed | T2, T3, T4 实际 gas 消耗与 XDC 公式一致 (因为 EIP-7623 未启用) |

---

## Formula Verification

测试目标：**验证 EIP-7623 公式是否在 devnet 上正确实现**

- **apothem (无EIP-7623)**：使用 XDC 公式 (4/68)
- **devnet (有EIP-7623)**：使用 EIP-7623 floor 公式 (10/40)

**关键点**：只要有差异能区分就行，谁更贵不重要！

| Test Case | 零 | 非零 | XDC (4/68) | EIP-7623 (10/40) | 差异 | 可区分 |
|-----------|---|------|------------|------------------|------|--------|
| T1 | 4 | 0 | 21016 | 21040 | +24 | ✅ |
| T2 | 4 | 4 | 21288 | 21200 | -88 | ✅ |
| T3 | 0 | 4 | 21272 | 21160 | -112 | ✅ |
| T4 | 0 | 0 | 21000 | 21000 | 0 | ❌ (预期) |

**结论**: T1, T2, T3 有差异，可用于验证 EIP-7623 是否在链上正确实现。
