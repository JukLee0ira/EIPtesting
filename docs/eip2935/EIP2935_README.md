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

---

### 1. 安装依赖

```bash
npm install
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 运行测试

```bash
npx hardhat test test/eip2935.test.ts --network <网络选项>
```

### 4. 查看详细输出

```bash
npx hardhat test test/eip2935.test.ts --verbose
```

---

## 测试维度

### A. 核心功能测试：历史存储合约

#### A1. 测试历史存储合约部署

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A1. Test History Storage Contract Deployment" --network <网络选项>
```

**测试目的：**
- 验证历史存储合约是否正确部署在指定地址

**测试步骤：**
1. 验证HISTORY_STORAGE_ADDRESS（0x0000F90827F1C53a10cb7A02335B175320002935）是否存在
2. 验证合约字节码是否符合规范
3. 验证合约nonce是否为1
4. 验证合约是否豁免EIP-161清理

**预期输出：**
- 合约地址存在且具有正确的代码
- 字节码与EIP-2935规范定义一致
- Nonce值为1
- 账户状态表明为系统合约豁免

---

#### A2. 测试环形缓冲区存储逻辑

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A2. Test Ring Buffer Storage Logic" --network <网络选项>
```

**测试目的：**
- 验证环形缓冲区存储机制是否正确工作

**测试步骤：**
1. 验证环形缓冲区大小为8191（HISTORY_SERVE_WINDOW）
2. 验证存储位置计算：(block.number-1) % 8191
3. 处理多个区块以填满缓冲区
4. 验证循环覆盖行为

**预期输出：**
- 环形缓冲区大小等于8191
- 存储位置计算正确
- 缓冲区在达到容量后正确回绕
- 旧值按正确顺序被覆盖

---

#### A3. 测试父区块哈希存储

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "A3. Test Parent Block Hash Storage" --network <网络选项>
```

**测试目的：**
- 验证在区块处理期间父区块哈希是否正确存储

**测试步骤：**
1. 处理新区块
2. 验证在区块开始时触发系统调用
3. 验证calldata包含block.parent.hash
4. 验证存储槽位已更新为父哈希

**预期输出：**
- 系统调用在交易处理之前执行
- Calldata包含正确的父区块哈希
- 存储值与父哈希一致
- 存储位置对应于(block.number-1) % HISTORY_SERVE_WINDOW

---

### B. EVM操作测试

#### B1. 测试Get操作 - 有效范围查询

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B1. Test Get Operation - Valid Range Query" --network <网络选项>
```

**测试目的：**
- 验证Get操作在有效范围内返回正确的区块哈希

**测试步骤：**
1. 查询block.number-1的区块哈希
2. 查询block.number-HISTORY_SERVE_WINDOW的区块哈希
3. 查询中间的区块哈希
4. 验证返回的哈希与预期值匹配

**预期输出：**
- 对[block.number-8191, block.number-1]内有效区块号返回正确的哈希
- 下边界查询（block.number-8191）成功
- 上边界查询（block.number-1）成功

---

#### B2. 测试Get操作 - 超出范围查询

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B2. Test Get Operation - Out of Range Query" --network <网络选项>
```

**测试目的：**
- 验证Get操作对超出有效范围的查询会revert

**测试步骤：**
1. 查询block.number-HISTORY_SERVE_WINDOW-1的区块哈希
2. 查询未来区块的哈希
3. 查询非常旧的区块哈希

**预期输出：**
- 所有超出范围的查询都会触发revert
- 错误消息指示无效的区块号范围
- 不返回不正确的哈希值

---

#### B3. 测试Get操作 - Calldata验证

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B3. Test Get Operation - Calldata Validation" --network <网络选项>
```

**测试目的：**
- 验证Get操作正确验证calldata长度

**测试步骤：**
1. 使用32字节calldata查询（有效）
2. 使用空calldata查询
3. 使用不足32字节的calldata查询
4. 使用超过32字节的calldata查询

**预期输出：**
- 32字节calldata：查询成功
- 空calldata：revert
- 短calldata：revert
- 长calldata：仅使用前32字节，查询成功

---

#### B4. 测试Set操作 - 授权控制

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "B4. Test Set Operation - Authorization Control" --network <网络选项>
```

**测试目的：**
- 验证Set操作只能由SYSTEM_ADDRESS调用

**测试步骤：**
1. 尝试从非系统地址调用set
2. 尝试从随机地址调用set
3. 验证从SYSTEM_ADDRESS调用set成功

**预期输出：**
- 非系统地址调用触发revert
- 只有SYSTEM_ADDRESS（0xfffffffffffffffffffffffffffffffffffffffe）可以执行set
- 授权调用者正确执行set操作

---

### C. 系统调用行为测试

#### C1. 测试系统调用Gas行为

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C1. Test System Call Gas Behavior" --network <网络选项>
```

**测试目的：**
- 验证系统调用具有特殊的Gas处理方式

**测试步骤：**
1. 处理包含系统调用的区块
2. 验证系统调用的Gas不计入区块Gas限制
3. 验证使用30_000_000的Gas限制

**预期输出：**
- 系统调用Gas与区块Gas限制分离
- 区块仍可接受正常Gas限制的交易
- 系统调用使用30_000_000 Gas限制

---

#### C2. 测试系统调用价值转移

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C2. Test System Call Value Transfer" --network <网络选项>
```

**测试目的：**
- 验证系统调用不转移价值

**测试步骤：**
1. 验证系统调用期间不转移ETH
2. 验证HISTORY_STORAGE_ADDRESS余额保持不变
3. 验证SYSTEM_ADDRESS余额保持不变

**预期输出：**
- 不转移任何价值（ETH）
- 交易value为0
- 账户余额不受影响

---

#### C3. 测试无代码时的静默失败

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "C3. Test Silent Failure on No Code" --network <网络选项>
```

**测试目的：**
- 验证调用没有代码的地址时静默失败

**测试步骤：**
1. 尝试在合约未部署的网络上调用历史存储
2. 验证没有抛出异常
3. 验证区块处理正常继续

**预期输出：**
- 发生静默失败（没有revert，没有异常）
- 区块处理正常继续
- 没有状态变化发生

---

### D. 区块处理集成测试

#### D1. 测试区块处理集成

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "D1. Test Block Processing Integration" --network <网络选项>
```

**测试目的：**
- 验证EIP-2935与区块处理正确集成

**测试步骤：**
1. 处理激活后的多个区块
2. 验证状态根包含历史存储
3. 验证区块验证成功
4. 验证历史数据连续性

**预期输出：**
- 所有区块处理成功
- 状态根反映历史存储变化
- 区块验证通过，历史数据正确
- 历史哈希正确且连续地存储

---

#### D2. 测试激活场景

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "D2. Test Activation Scenarios" --network <网络选项>
```

**测试目的：**
- 验证不同激活场景的正确处理

**测试步骤：**
1. 测试创世激活
2. 测试区块1激活
3. 测试区块32激活
4. 验证每种场景的初始存储状态

**预期输出：**
- 创世激活：区块1开始将创世哈希写入slot 0
- 区块1激活：只有创世哈希在slot 0
- 区块32激活：区块31的哈希在slot 31，其他为空
- 所有场景正确初始化

---

### E. 边界条件和安全测试

#### E1. 测试边界条件

**测试命令：**
```bash
npx hardhat test test/eip2935.test.ts --grep "E1. Test Boundary Conditions" --network <网络选项>
```

**测试目的：**
- 验证正确处理边界条件

**测试步骤：**
1. 在精确下边界查询（block.number-HISTORY_SERVE_WINDOW）
2. 在精确上边界查询（block.number-1）
3. 在边界外查询
4. 测试缓冲区饱和和回绕

**预期输出：**
- 边界查询成功
- 边界外查询revert
- 缓冲区在8191个区块后正确回绕

