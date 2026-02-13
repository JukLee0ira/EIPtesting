# EIP-7623 Test Documentation

## Test Overview

本测试套件实现了 EIP-7623 核心功能测试，该提案旨在增加 calldata 成本以减少最大区块大小。共计 5 个测试用例。

**测试方法**: 直接使用 ETH 转账交易携带不同大小的 calldata，验证 gas 消耗模式。

**Test Framework**: Hardhat + Ethers.js v6  
**Solidity Version**: 不需要

---

## EIP-7623 Specification Summary

EIP-7623 通过引入 `TOTAL_COST_FLOOR_PER_TOKEN` 参数来增加数据密集型交易的 calldata 成本：

- **参数**:
  - `STANDARD_TOKEN_COST = 4` (标准 token 成本)
  - `TOTAL_COST_FLOOR_PER_TOKEN = 10` (每 token 的总成本下限)
  - `tokens_in_calldata = zero_bytes + nonzero_bytes * 4`

- **新 Gas 计算公式**:
```
tx.gasUsed = 21000 + max(
    STANDARD_TOKEN_COST * tokens_in_calldata + execution_gas_used,
    TOTAL_COST_FLOOR_PER_TOKEN * tokens_in_calldata
)
```

- **影响**:
  - 数据密集型交易（calldata 多，执行 gas 少）: 成本从 4/16 升至 10/40 gas/字节
  - 执行密集型交易（执行 gas 多）: 成本保持 4/16 gas/字节
  - 常规 ETH 转账完全不受影响

---

## Running Tests

**Prerequisites**
- 确保网络支持 EIP-7623 升级。如果在私有网络上测试，需要在 genesis 配置中启用：

```json
{
  "config": {
    "chainId": 20986,
    "pragueBlock": 0,
    "eip7623Block": 0,
    ...
  }
}
```

- **设置环境变量**: `RPC_URL` + 至少 2 个私钥 (`PRIVATE_KEYS=key1,key2`, 参考根目录 `example.env`)。

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
- 验证当交易的 calldata 很大但执行 gas 很低时，使用 floor cost 计算
- **这是 EIP-7623 的核心测试**

**Test Steps:**
1. 构造一个大 calldata 交易（1000 字节非零数据）
2. 发送交易并获取实际消耗的 gas
3. 计算 floor cost: `10 * (zero_bytes + nonzero_bytes * 4)`
4. 断言实际 gas >= floor cost

**Expected Output:**
- EIP-7623 未启用: ~37000 gas (21000 + 1000*4*4)
- EIP-7623 启用: >= 61000 gas (21000 + 1000*4*10)

**Assertion:**
```typescript
expect(gasUsed).to.be.gte(61000n);
```

---

#### A2. Test Zero vs Non-Zero Byte Cost Ratio

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A2. Test Zero vs Non-Zero Byte Cost Ratio" --network myNet
```

**Test Purpose:**
- 验证 EIP-7623 对 non-zero 字节应用 floor cost (10 gas/token)
- **这是验证 EIP-7623 是否启用的关键测试之一**

**Test Steps:**
1. 发送仅包含 zero bytes 的交易（64 字节，值为 0x00）
2. 发送仅包含 non-zero bytes 的交易（64 字节，值为 0xab）
3. 断言 non-zero 字节满足 EIP-7623 floor cost (>= 23560 gas)

**Expected Output:**
- Without EIP-7623: ~22024 gas (21000 + 64*4*4)
- With EIP-7623: >= 23560 gas (21000 + 64*4*10)

**Key Assertion:**
```typescript
expect(gasUsed2).to.be.gte(23560n);  // Non-zero bytes must meet floor cost
```

**Note:** 此测试验证的是 EIP-7623 的核心机制，而非零字节与零字节之间的比例（该比例无论是否启用 EIP-7623 都是 1:4）。

---

### B. Transaction Validity Tests

#### B2. Test Regular ETH Transfer Unaffected

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "B2. Test Regular ETH Transfer Unaffected" --network myNet
```

**Test Purpose:**
- 验证常规 ETH 转账（无 calldata）不受 EIP-7623 影响

**Test Steps:**
1. 发送 0 ETH 转账交易（无 calldata: `0x`）
2. 验证 gas 消耗 = 21000

**Expected Output:**
- Gas 消耗 = 21000（基础费用）
- 交易成功

---

### C. Edge Cases

#### C1. Test Pure Empty Calldata

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C1. Test Pure Empty Calldata" --network myNet
```

**Test Purpose:**
- 验证空 calldata 的特殊情况

**Test Steps:**
1. 发送无 calldata 的交易
2. 验证 gas 计算正常

**Expected Output:**
- tokens_in_calldata = 0
- 基础 gas = 21000

---

#### C2. Test Medium Calldata

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C2. Test Medium Calldata" --network myNet
```

**Test Purpose:**
- 验证中等大小 calldata（100 字节）的 gas 消耗

**Test Steps:**
1. 发送 100 字节非零 calldata 的交易
2. 验证 gas 满足 floor cost

**Expected Output:**
- Floor cost: 25000 gas (21000 + 100*4*10)
- 实际 gas >= 25000

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

---

## Test Implementation Notes

- **无合约依赖**: 测试使用纯 ETH 转账交易，不需要部署任何智能合约
- **直接验证**: 通过检查实际 gas 消耗来判断 EIP-7623 是否启用
- **自然失败**: 如果 EIP-7623 未启用，关键断言会失败（gas < floor cost）
- **验证方法**: 
  - A1: 1000字节非零 calldata，必须 >= 61000 gas
  - A2: 64字节非零 calldata，必须 >= 23560 gas  
  - C2: 100字节非零 calldata，必须 >= 25000 gas
