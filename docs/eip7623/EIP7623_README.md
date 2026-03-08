# EIP-7623 Test Documentation

## Test Overview

This test suite tests EIP-7623 core functions. The proposal aims to increase calldata cost to reduce max block size. Total: **5 test cases (T1-T5)**.

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
tx.gasUsed = 21000 + max(STANDARD_path, FLOOR_path)

STANDARD_path = 21000 + 4 * zero_bytes + 68 * nonzero_bytes
FLOOR_path = 21000 + 10 * (zero_bytes + 4 * nonzero_bytes)
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

## Test Cases: T1-T5

### T1. 4 Zero Bytes (FLOOR > STANDARD)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T1. 4 Zero" --network devnet
```

**Test Purpose:**
- 验证 EIP-7623 对纯零字节的 floor 费用计算
- **区分度**: +24 gas

**Expected Output:**
| Metric | Value |
|--------|-------|
| Zero Bytes | 4 |
| Non-Zero Bytes | 0 |
| Tokens | 4 |
| STANDARD | 21016 |
| FLOOR | 21040 |
| **EIP-7623 (max)** | **21040** |
| **Difference** | **+24** (FLOOR > STANDARD) |

---

### T2. 8 Zero + 1 Non-Zero Bytes (High Difference)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T2. 8 Zero" --network devnet
```

**Test Purpose:**
- 验证 EIP-7623 对高零字节比例的 floor 费用计算
- **高区分度**：FLOOR > STANDARD，差异最大 (+100)

**Expected Output:**
| Metric | Value |
|--------|-------|
| Zero Bytes | 8 |
| Non-Zero Bytes | 1 |
| Tokens | 12 |
| STANDARD | 21100 |
| FLOOR | 21200 |
| **EIP-7623 (max)** | **21200** |
| **Difference** | **+100** (FLOOR > STANDARD, 最大差异) |

---

### T3. Critical Point: 5 Zero + 1 Non-Zero (FLOOR ≈ STANDARD)

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T3. Critical" --network devnet
```

**Test Purpose:**
- 验证 FLOOR = STANDARD 临界点
- **差异仅 2 gas**，测试边界条件

**Expected Output:**
| Metric | Value |
|--------|-------|
| Zero Bytes | 5 |
| Non-Zero Bytes | 1 |
| Tokens | 9 |
| STANDARD | 21088 |
| FLOOR | 21090 |
| **EIP-7623 (max)** | **21090** |
| **Difference** | **+2** (FLOOR > STANDARD, 最小差异) |

---

### T4. Large Calldata: 10KB

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T4. Large" --network devnet
```

**Test Purpose:**
- 测试超大 calldata (10KB = 10240 bytes) 的费用计算
- 验证大规模数据的 gas 计算正确性

**⚠️ Note**: This test will **always pass** on both XDC and EIP-7623 networks because:
- `STANDARD = 368640` > `FLOOR = 277000` (always uses STANDARD path)
- XDC and EIP-7623 both use STANDARD, so costs are equal

**Expected Output:**
| Metric | Value |
|--------|-------|
| Total Size | 10240 bytes |
| Zero Bytes | 5120 |
| Non-Zero Bytes | 5120 |
| Tokens | 25600 |

---

### T5. Zero Byte Boundary: 1-10 Zero Bytes

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "T5. Boundary" --network devnet
```

**Test Purpose:**
- 验证 1-10 零字节递增的边界测试
- 测试零字节边界值

**Test Cases:**
| Zero Bytes | Tokens | STANDARD | FLOOR | EIP-7623 | Difference |
|------------|--------|----------|-------|----------|------------|
| 1 | 1 | 21004 | 21010 | 21010 | +6 |
| 2 | 2 | 21008 | 21020 | 21020 | +12 |
| 5 | 5 | 21020 | 21050 | 21050 | +30 |
| 10 | 10 | 21040 | 21100 | 21100 | +60 |

---

## Common Test Commands

```bash
# Run all EIP-7623 tests
npx hardhat test test/eip7623.test.ts --network devnet

# Run specific test
npx hardhat test test/eip7623.test.ts --grep "T1" --network devnet
npx hardhat test test/eip7623.test.ts --grep "T2" --network devnet
npx hardhat test test/eip7623.test.ts --grep "T3" --network devnet
npx hardhat test test/eip7623.test.ts --grep "T4" --network devnet
npx hardhat test test/eip7623.test.ts --grep "T5" --network devnet

# Check gas used in detail
npx hardhat test test/eip7623.test.ts --grep "T1" --network devnet --verbose

# Quick check: just show pass/fail
npx hardhat test test/eip7623.test.ts --network devnet 2>&1 | grep -E "passing|failing"
```

---

## Expected Results

| Test Case | Zero | Non-Zero | Tokens | XDC (4/68) | STANDARD | FLOOR | EIP-7623 | Diff | Path |
|-----------|------|----------|--------|------------|----------|-------|----------|------|------|
| T1 | 4 | 0 | 4 | 21016 | 21016 | 21040 | 21040 | +24 | FLOOR |
| T2 | 8 | 1 | 12 | 21100 | 21100 | 21200 | 21200 | +100 | FLOOR |
| T3 | 5 | 1 | 9 | 21088 | 21088 | 21090 | 21090 | +2 | FLOOR* |
| T4 | 5120 | 5120 | 25600 | huge | huge | huge | huge | huge | varies |
| T5 | 1-10 | 0 | 1-10 | varies | varies | varies | varies | varies | FLOOR |

**Note**: T3 is the critical point where FLOOR ≈ STANDARD (diff only 2 gas)

---

## Gas Calculation Rule Summary

| Test | Non-zero | Zero | Tokens | XDC (no EIP) | STANDARD | FLOOR | EIP-7623 | Diff | Path |
|------|----------|------|--------|--------------|----------|-------|----------|------|------|
| T1 | 0 | 4 | 4 | 21016 | 21016 | 21040 | 21040 | +24 | FLOOR |
| T2 | 1 | 8 | 12 | 21100 | 21100 | 21200 | 21200 | +100 | FLOOR |
| T3 | 1 | 5 | 9 | 21088 | 21088 | 21090 | 21090 | +2 | FLOOR* |
| T4 | 5120 | 5120 | 25600 | huge | huge | huge | huge | huge | varies |
| T5 | 0 | 1-10 | 1-10 | varies | lower | FLOOR | FLOOR | varies | FLOOR |

**Key**: All tests show FLOOR >= STANDARD (distinguishable on both XDC and EIP-7623 networks)

---

## Test Results Analysis

| Network | Result | Description |
|---------|--------|-------------|
| **devnet (EIP-7623 enabled)** | 4/5 passed | T1,T2,T3,T5 pass; T4 always passes (see note) ✅ |
| **apothem (XDC - no EIP-7623)** | 4/5 failed | T1,T2,T3,T5 expect EIP-7623 values; T4 always passes |

---

## Formula Verification

测试目标：**验证 EIP-7623 公式是否在 devnet 上正确实现**

- **apothem (无EIP-7623)**：使用 XDC 公式 (4/68)
- **devnet (有EIP-7623)**：使用 EIP-7623 floor 公式 (10/40)

**关键点**：只要有差异能区分就行，谁更贵不重要！

| Test Case | Zero | Non-Zero | XDC (4/68) | EIP-7623 | Diff | Distinguishable |
|-----------|------|----------|------------|----------|------|-----------------|
| T1 | 4 | 0 | 21016 | 21040 | +24 | ✅ |
| T2 | 8 | 1 | 21100 | 21200 | +100 | ✅ (最大) |
| T3 | 5 | 1 | 21088 | 21090 | +2 | ✅ (最小) |
| T4 | 5120 | 5120 | huge | huge | huge | ✅ (大) |
| T5 | 1-10 | 0 | varies | varies | varies | ✅ |

**结论**: T1, T2, T3, T5 有差异，可区分 EIP-7623 是否实现；T4 无差异（始终通过）。

- T2 差异最大 (+100)
- T3 差异最小 (+2)
- T4 无差异 (STANDARD > FLOOR, XDC=EIP-7623)
