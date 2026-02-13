# EIP-7623 Test Documentation

## Test Overview

本测试套件实现了 EIP-7623 核心功能测试，该提案旨在增加 calldata 成本以减少最大区块大小。测试涵盖 6 个核心测试维度，共计 10 个测试用例。

**Test Framework**: Hardhat + Ethers.js v6  
**Solidity Version**: 0.8.28

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
    STANDARD_TOKEN_COST * tokens_in_calldata + execution_gas_used + contract_creation_gas,
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

### 2. Compile Contracts

```bash
npx hardhat compile
```

### 3. Run Tests

```bash
npx hardhat test test/eip7623.test.ts --network <network option>
```

### 4. View Detailed Output

```bash
npx hardhat test test/eip7623.test.ts --verbose
```


---

## Test Dimensions

### A. Calldata Cost Calculation Tests

#### A1. Test Data-Heavy Transaction Pays Floor Cost

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A1. Test Data-Heavy Transaction Pays Floor Cost" --network <network option>
```

**Test Purpose:**
- 验证当交易的执行 gas 低于 floor cost 时，按照 `TOTAL_COST_FLOOR_PER_TOKEN * tokens_in_calldata` 计算 gas

**Test Steps:**
1. 构造一个 calldata 很大但执行 gas 很低的交易（如调用一个空函数）
2. 发送交易并获取实际消耗的 gas
3. 计算 floor cost: `10 * (zero_bytes + nonzero_bytes * 4)`
4. 验证实际 gas 消耗 >= floor cost

**Expected Output:**
- 实际 gas 消耗 >= `21000 + floor cost`
- 交易成功执行

---

#### A2. Test Execution-Heavy Transaction Uses Standard Cost

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A2. Test Execution-Heavy Transaction Uses Standard Cost" --network <network option>
```

**Test Purpose:**
- 验证执行 gas 充足时，使用标准的 `STANDARD_TOKEN_COST` 计算

**Test Steps:**
1. 构造一个执行 gas 很高的交易（如复杂计算循环）
2. 发送交易并获取实际消耗的 gas
3. 验证实际 gas 消耗 = `21000 + execution_gas + calldata_cost (4/16)`

**Expected Output:**
- 实际 gas 消耗 = `21000 + execution_gas + STANDARD_TOKEN_COST * tokens_in_calldata`
- floor cost 不生效（因为执行 gas 更高）

---

#### A3. Test Zero vs Non-Zero Byte Cost Ratio

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "A3. Test Zero vs Non-Zero Byte Cost Ratio" --network <network option>
```

**Test Purpose:**
- 验证 zero byte (1 gas) 和 non-zero byte (4 gas) 的成本比例保持不变

**Test Steps:**
1. 发送仅包含 zero bytes 的交易
2. 发送仅包含 non-zero bytes 的交易（相同大小）
3. 对比两次的 calldata gas 成本

**Expected Output:**
- zero bytes: 1 gas per byte
- non-zero bytes: 4 gas per byte
- 比例维持 1:4

---

### B. Transaction Validity Tests

#### B1. Test Minimum Gas Limit Requirement

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "B1. Test Minimum Gas Limit Requirement" --network <network option>
```

**Test Purpose:**
- 验证交易必须满足最低 gas limit 才能被打包

**Test Steps:**
1. 构造一个大 calldata 交易
2. 设置低于最低要求的 gas limit
3. 尝试发送交易

**Expected Output:**
- 交易被拒绝 (intrinsic gas insufficient)
- 错误信息提示 gas 不足

---

#### B2. Test Regular ETH Transfer Unaffected

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "B2. Test Regular ETH Transfer Unaffected" --network <network option>
```

**Test Purpose:**
- 验证常规 ETH 转账（无 calldata）不受 EIP-7623 影响

**Test Steps:**
1. 发送 0 ETH 转账交易（无 calldata）
2. 验证 gas 消耗 = 21000

**Expected Output:**
- Gas 消耗 = 21000（基础费用）
- 交易成功

---

### C. Contract Creation Tests

#### C1. Test Contract Creation Follows New Formula

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C1. Test Contract Creation Follows New Formula" --network <network option>
```

**Test Purpose:**
- 验证合约创建交易遵循新的 gas 计算公式

**Test Steps:**
1. 部署一个包含大量 initcode 的合约
2. 获取实际 gas 消耗
3. 验证符合新公式

**Expected Output:**
- Gas 消耗遵循: `32000 + 2 * words(initcode) + max(execution, floor)`

---

#### C2. Test Small Contract Creation

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "C2. Test Small Contract Creation" --network <network option>
```

**Test Purpose:**
- 验证小型合约创建不受 floor cost 影响

**Test Steps:**
1. 部署一个极简合约
2. 检查执行成本是否高于 floor cost

**Expected Output:**
- 小型合约的 gas 成本由执行成本决定，floor 不生效

---

### D. Edge Cases

#### D1. Test Pure Empty Calldata

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "D1. Test Pure Empty Calldata" --network <network option>
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

#### D2. Test Maximum Calldata Size Before Revert

**Test Command:**
```bash
npx hardhat test test/eip7623.test.ts --grep "D2. Test Maximum Calldata Size Before Revert" --network <network option>
```

**Test Purpose:**
- 测试在 floor cost 下，最大可容纳的 calldata 大小

**Test Steps:**
1. 计算最大 calldata: `block_gas_limit / TOTAL_COST_FLOOR_PER_TOKEN`
2. 构造接近该限制的交易
3. 验证交易成功或失败

**Expected Output:**
- 在 30M gas limit 下，最大 calldata 约为 3M 字节
- 超过限制的交易将被拒绝

---

## Contract Descriptions

### CalldataTester.sol

**Features:**
- 提供了用于测试不同 calldata 场景的合约
- 支持执行密集型和空闲型函数调用

**Main Functions:**
```solidity
function emptyCall() external pure returns (uint256)
function expensiveComputation(uint256 iterations) external returns (uint256)
function writeStorage(uint256 slot, uint256 value) external returns (bool)
```

---

## Common Test Commands

```bash
# Run all EIP-7623 tests
npx hardhat test test/eip7623.test.ts --network myNet

# Run specific test category
npx hardhat test test/eip7623.test.ts --grep "Calldata Cost" --network myNet

# Run single test
npx hardhat test test/eip7623.test.ts --grep "A1. Test Data-Heavy Transaction Pays Floor Cost" --network myNet

# Check gas used in detail
npx hardhat test test/eip7623.test.ts --grep "Test Name" --network myNet --verbose
```

---

## Expected Results on EIP-7623 Enabled Network

| Test Case | Expected Gas Behavior |
|-----------|----------------------|
| Data-heavy tx | Uses floor cost (10/40) |
| Execution-heavy tx | Uses standard cost (4/16) |
| ETH transfer | 21000 gas |
| Contract creation | 32000 + initcode cost + max() |

