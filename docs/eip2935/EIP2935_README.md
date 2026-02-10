# EIP-2935 测试文档

## 测试概述

本测试套件基于EIP-2935规范实现核心功能测试，包括历史区块哈希存储、环形缓冲区操作、系统调用行为以及完整的集成测试。

**测试框架**：Hardhat + Ethers.js v6  
**Solidity版本**：0.8.28

---

## 运行测试

**前置条件**
- 确保您的网络支持EIP-2935。如果在私有网络上测试，可以通过修改节点的`genesis.json`来激活：

```json
{
  "config": {
    "chainId": 20986,
    "pragueBlock": 0,  // 激活高度（示例）
    ...
  }
}
```

**网络配置**
确保在 `hardhat.config.ts` 或 `.env` 中配置正确的网络：

```bash
# 示例：使用 myNet 网络（需要在 .env 中配置 RPC_URL 和 PRIVATE_KEY）
export RPC_URL=http://127.0.0.1:8545
export PRIVATE_KEY=0x...
```

---

### 1. 安装依赖

```bash
npm install
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 运行全部测试

```bash
npx hardhat test test/eip2935.test.ts --network myNet
```

### 4. 查看详细输出

```bash
npx hardhat test test/eip2935.test.ts --network myNet --verbose
```

---

## 测试维度

### A. 核心功能测试：历史存储合约

#### A1. 测试历史存储合约部署

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A1. Test History Storage Contract Deployment" --network myNet
```

**测试目的：**
- 验证EIP-2935预编译合约是否正确部署在指定地址

**测试步骤：**
1. 验证HISTORY_STORAGE_ADDRESS（0x0000F90827F1C53a10cb7A02335B175320002935）是否存在
2. 验证合约字节码是否存在
3. 验证字节码长度是否正确

**预期输出：**
- 合约地址存在且具有正确的代码
- 字节码与EIP-2935规范定义一致
- 输出 "✓ EIP-2935 precompiled contract verified"

---

#### A2. 测试环形缓冲区常量

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A2. Test Ring Buffer Constants" --network myNet
```

**测试目的：**
- 验证环形缓冲区常量是否正确定义

**测试步骤：**
1. 验证HISTORY_SERVE_WINDOW是否为8191
2. 验证HISTORY_STORAGE_ADDRESS是否正确
3. 验证SYSTEM_ADDRESS是否正确

**预期输出：**
- HISTORY_SERVE_WINDOW: 8191
- HISTORY_STORAGE_ADDRESS: 0x0000F90827F1C53a10cb7A02335B175320002935
- SYSTEM_ADDRESS: 0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE
- 输出 "✓ All constants verified correctly"

---

#### A3. 测试存储槽计算

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A3. Test Storage Slot Calculation" --network myNet
```

**测试目的：**
- 验证环形缓冲区存储槽位计算是否正确

**测试步骤：**
1. 验证槽位计算公式：(blockNumber - 1) % HISTORY_SERVE_WINDOW
2. 测试多个边界情况
3. 验证回绕行为

**预期输出：**
- Block 1 → Slot 0
- Block 8191 → Slot 8190
- Block 8192 → Slot 0 (回绕)
- Block 16383 → Slot 0 (两个完整周期后)
- 输出 "✓ All storage slot calculations verified"

---

### B. EVM操作测试

#### B1. 测试Get操作 - 有效范围查询

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B1. Test Get Operation - Valid Range Query" --network myNet
```

**测试目的：**
- 验证Get操作在有效范围内返回正确的区块哈希

**测试步骤：**
1. 获取当前区块信息
2. 查询父区块哈希
3. 比较返回的哈希与预期值

**预期输出：**
- 对有效区块号返回正确的哈希
- 哈希匹配验证通过
- 输出 "✓ Block hash retrieved correctly!" 或验证状态

---

#### B2. 测试Get操作 - 超出范围查询

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B2. Test Get Operation - Out of Range Query" --network myNet
```

**测试目的：**
- 验证Get操作对超出有效范围的查询会revert

**测试步骤：**
1. 查询未来区块（应revert）
2. 查询超出HISTORY_SERVE_WINDOW的旧区块（应revert）

**预期输出：**
- 未来区块查询revert
- 旧区块查询revert
- 输出 "✓ All out-of-range queries correctly revert"

---

#### B3. 测试Get操作 - Calldata验证

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B3. Test Get Operation - Calldata Validation" --network myNet
```

**测试目的：**
- 验证Get操作正确验证calldata长度

**测试步骤：**
1. 使用32字节calldata查询（有效）
2. 使用空calldata查询
3. 验证calldata验证函数

**预期输出：**
- 32字节calldata：查询尝试
- 空calldata：revert
- validateCalldata(32 bytes): true
- validateCalldata(16 bytes): false
- 输出 "✓ Calldata validation working correctly"

---

#### B4. 测试Get操作 - 多重有效查询

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B4. Test Get Operation - Multiple Valid Queries" --network myNet
```

**测试目的：**
- 验证多个连续查询正确处理

**测试步骤：**
1. 重置状态
2. 连续查询多个最近区块
3. 统计成功/失败次数

**预期输出：**
- 多个查询被正确处理
- 统计信息更新
- 输出 "✓ Multiple queries handled correctly"

**注意：** 需要至少5个区块才能运行此测试

---

### C. 边界和安全测试

#### C1. 测试边界条件

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C1. Test Boundary Conditions" --network myNet
```

**测试目的：**
- 验证正确处理边界条件

**测试步骤：**
1. 计算下边界值
2. 测试有效/无效区块号验证
3. 验证边界行为

**预期输出：**
- 父区块：有效
- 最旧有效区块：有效
- 当前区块：无效（未来）
- 未来区块：无效
- 输出 "✓ Boundary conditions verified"

---

#### C2. 测试环形缓冲区溢出行为

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C2. Test Ring Buffer Overflow Behavior" --network myNet
```

**测试目的：**
- 验证环形缓冲区正确处理溢出和回绕

**测试步骤：**
1. 验证缓冲区大小为8191
2. 计算多个回绕点的槽位
3. 验证回绕行为

**预期输出：**
- 缓冲区大小：8191
- 回绕行为正确
- 输出 "✓ Ring buffer overflow behavior verified"

---

#### C3. 测试区块哈希检索准确性

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C3. Test Block Hash Retrieval Accuracy" --network myNet
```

**测试目的：**
- 验证检索的区块哈希与实际区块哈希匹配

**测试步骤：**
1. 重置状态
2. 测试多个区块的哈希检索
3. 比较检索结果与实际值

**预期输出：**
- 匹配的哈希数量统计
- 输出 "✓ Block hash retrieval partially verified" 或相应状态

**注意：** 需要至少2个区块才能运行此测试

---

### D. 集成测试

#### D1. 测试预编译合约状态

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "D1. Test Precompiled Contract State" --network myNet
```

**测试目的：**
- 验证预编译合约正确配置为系统合约

**测试步骤：**
1. 验证预编译合约存在
2. 验证字节码长度
3. 查看字节码内容

**预期输出：**
- 合约地址：0x0000F90827F1C53a10cb7A02335B175320002935
- 字节码长度：大于100
- 输出 "✓ Precompiled contract is properly configured"

---

#### D2. 测试调用统计追踪

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "D2. Test Call Statistics Tracking" --network myNet
```

**测试目的：**
- 验证调用统计信息正确追踪

**测试步骤：**
1. 重置并检查初始状态
2. 进行多次调用
3. 验证统计信息更新

**预期输出：**
- 初始状态：Attempts: 0, Successes: 0
- 调用后：统计信息正确更新
- 输出统计追踪完成信息

---

#### D3. 测试辅助函数

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "D3. Test Helper Functions" --network myNet
```

**测试目的：**
- 验证所有辅助函数正确工作

**测试步骤：**
1. 测试 getRingBufferSize()
2. 测试 getHistoryStorageAddress()
3. 测试 getSystemAddress()
4. 测试 validateCalldata()

**预期输出：**
- 所有辅助函数返回正确值
- validateCalldata(32 bytes): true
- validateCalldata(16 bytes): false
- 输出 "✓ All helper functions working correctly"

---

## 运行示例

### 运行单个测试

```bash
# 运行 A1 测试
npx hardhat test test/eip2935.test.ts --grep "A1. Test History Storage Contract Deployment" --network myNet

# 运行 B2 测试
npx hardhat test test/eip2935.test.ts --grep "B2. Test Get Operation - Out of Range Query" --network myNet
```

### 运行整个测试类别

```bash
# 运行所有核心功能测试
npx hardhat test test/eip2935.test.ts --grep "A\." --network myNet

# 运行所有EVM操作测试
npx hardhat test test/eip2935.test.ts --grep "B\." --network myNet

# 运行所有边界测试
npx hardhat test test/eip2935.test.ts --grep "C\." --network myNet

# 运行所有集成测试
npx hardhat test test/eip2935.test.ts --grep "D\." --network myNet
```

### 查看测试结果统计

```bash
# 运行全部测试并显示详细统计
npx hardhat test test/eip2935.test.ts --network myNet 2>&1 | grep -E "passing|failing"
```

---

## 常见问题

### 1. 测试显示 "Precompiled Contract NOT deployed"

**原因：** 网络不支持EIP-2935
**解决：** 确保在genesis.json中配置 `"pragueBlock": 0`

### 2. 测试显示 "TypeError: Cannot mix BigInt and other types"

**原因：** BigInt类型转换问题（已在最新版本修复）
**解决：** 确保使用最新版本的测试文件

### 3. B4 或 C3 测试被跳过

**原因：** 区块数量不足
**解决：** 等待网络生成更多区块后再运行测试

### 4. 预编译合约调用失败

**原因：** 网络不支持assembly调用预编译合约
**解决：** 检查网络是否完整实现了EIP-2935
