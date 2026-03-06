/**
 * EIP-7623 Test Suite
 *
 * Calldata cost test suite for EIP-7623
 * Tests for calldata cost changes using REAL transactions with calldata
 *
 * EIP-7623: Increase calldata cost to reduce maximum block size
 * https://eips.ethereum.org/EIPS/eip-7623
 *
 * ============================================================
 * XDC NETWORK GAS FORMULA (Current - Before EIP-7623)
 * ============================================================
 *   - Non-zero byte: 68 gas/byte
 *   - Zero byte: 4 gas/byte
 *   - Base transaction: 21000 gas
 *   Formula: Gas = 21000 + 68 * nonzero_bytes + 4 * zero_bytes
 *
 * ============================================================
 * EIP-7623 PARAMETERS (After EIP-7623)
 * ============================================================
 *   - STANDARD_TOKEN_COST: 4 (standard token cost)
 *   - TOTAL_COST_FLOOR_PER_TOKEN: 10 (minimum cost per token)
 *   - Zero byte: 1 token → 10 gas (with floor)
 *   - Non-zero byte: 4 tokens → 40 gas (with floor)
 *
 * GAS FORMULA (EIP-7623):
 *   tx.gasUsed = 21000 + max(STANDARD path, FLOOR path)
 *   where FLOOR path = TOTAL_COST_FLOOR_PER_TOKEN * tokens
 *   and tokens = zero_bytes + nonzero_bytes * 4
 *
 * ============================================================
 * IMPACT
 * ============================================================
 *   - XDC Old: Non-zero=68, Zero=4
 *   - EIP-7623 Floor: Non-zero=40, Zero=10
 *   - Regular ETH transfers (no calldata): Always 21000 gas
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

// ============================================================
// XDC NETWORK CONSTANTS (Current - Before EIP-7623)
// ============================================================
const XDC_NONZERO_BYTE_COST = 68n;  // XDC: non-zero byte = 68 gas
const XDC_ZERO_BYTE_COST = 4n;      // XDC: zero byte = 4 gas

// EIP-7623 Constants (After EIP-7623)
const STANDARD_TOKEN_COST = 4n;
const TOTAL_COST_FLOOR_PER_TOKEN = 10n;
const ZERO_BYTE_TOKEN_COST = 1n;  // Zero byte = 1 token (standard)
const BASE_GAS = 21000n;

// Helper function: Calculate XDC (old) gas cost
function calculateXDCCost(nonZeroBytes: number, zeroBytes: number): bigint {
  return BASE_GAS + XDC_NONZERO_BYTE_COST * BigInt(nonZeroBytes) + XDC_ZERO_BYTE_COST * BigInt(zeroBytes);
}

// Helper function: Calculate EIP-7623 floor cost
function calculateEIP7623FloorCost(nonZeroBytes: number, zeroBytes: number): bigint {
  const tokens = BigInt(zeroBytes) + BigInt(nonZeroBytes) * STANDARD_TOKEN_COST;
  return BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * tokens;
}

// Helper function to send transaction and get receipt
async function sendTxAndGetGas(signer: Signer, tx: {
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
}): Promise<bigint> {
  // Estimate gas first to get a reasonable limit
  const estimate = await signer.estimateGas({
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? "0x",
  });
  
  // Add 20% buffer to estimated gas
  const gasLimit = tx.gasLimit ?? (estimate * 120n / 100n);
  
  const response = await signer.sendTransaction({
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data ?? "0x",
    gasLimit: gasLimit,
  });
  const receipt = await response.wait();
  return receipt!.gasUsed;
}

describe("EIP-7623 Complete Test Suite", function () {
  let owner: Signer;
  let ownerAddress: string;
  let chainId: bigint;
  let currentBlockNumber: bigint;

  // ============================================================
  // BEFORE EACH: Setup test environment (per SKILL.md - use beforeEach for independence)
  // ============================================================
  before(async function () {
    // Get test accounts
    const signers = await ethers.getSigners();
    if (signers.length < 1) {
      throw new Error(
        [
          "Test initialization failed: At least 1 account required (owner).",
          `Currently ethers.getSigners() only returned ${signers.length}.`,
          "",
          "Fix:",
          "- Run on local hardhat network (without --network myNet); or",
          "- Configure at least 1 private key in environment variable: PRIVATE_KEY",
          "  (See example.env in project root directory)",
        ].join("\n")
      );
    }

    [owner] = signers;
    ownerAddress = await owner.getAddress();

    // Get chain ID
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    // Get current block number
    currentBlockNumber = BigInt(await ethers.provider.getBlockNumber());

    console.log("\n=== EIP-7623 Test Environment Info ===");
    console.log("Chain ID:", chainId.toString());
    console.log("Current Block Number:", currentBlockNumber.toString());
    console.log("Owner Address:", ownerAddress);
  });

  // ============================================================
  // T2-T5: EIP-7623 公式验证测试 (每个用例 4 字节)
  // ============================================================
  describe("T2-T5: EIP-7623 Formula Verification (4 bytes each)", function () {
    /**
     * T2. 4 零字节
     *
     * 用例: 零=4, 非零=0
     * XDC: 21000 + 4×4 = 21016
     * EIP-7623: 21000 + 10×(4 + 0) = 21040
     * 差异: +24 (EIP-7623 更贵)
     *
     * 注意: 在 apothem (无EIP-7623) 上，实际 gas = 21016，断言会失败
     *       在 devnet (有EIP-7623) 上，实际 gas = 21040，断言会通过
     */
    it("T2. 4 Zero Bytes", async function () {
      const zeroBytes = 4;
      const nonZeroBytes = 0;
      const calldata = "0x" + "00".repeat(zeroBytes);
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T2: 4 Zero Bytes ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateXDCCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);

      console.log("XDC Cost (no EIP-7623):", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("Difference:", (eip7623Floor - xdcCost).toString());

      // T2: 验证实际 gas 等于 EIP-7623 floor (不是 >=)
      // apothem (无EIP-7623): 实际 = 21016 ≠ 21040 → 失败
      // devnet (有EIP-7623): 实际 = 21040 = 21040 → 通过
      expect(
        gasUsed,
        `T2: Expected exactly ${eip7623Floor} with EIP-7623, got ${gasUsed}`
      ).to.eq(eip7623Floor);
    });

    /**
     * T3. 4 零字节 + 4 非零字节
     *
     * 用例: 零=4, 非零=4
     * XDC: 21000 + 4×4 + 4×68 = 21288
     * EIP-7623: 21000 + 10×(4 + 4×4) = 21200
     * 差异: -88 (XDC 更贵)
     *
     * 注意: 在 apothem (无EIP-7623) 上，实际 gas = 21288，断言会失败
     *       在 devnet (有EIP-7623) 上，实际 gas = 21200，断言会通过
     */
    it("T3. 4 Zero + 4 Non-Zero Bytes", async function () {
      const zeroBytes = 4;
      const nonZeroBytes = 4;
      const calldata = "0x" + "00".repeat(zeroBytes) + "ab".repeat(nonZeroBytes);
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T3: 4 Zero + 4 Non-Zero Bytes ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateXDCCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);

      console.log("XDC Cost (no EIP-7623):", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("Difference:", (xdcCost - eip7623Floor).toString());

      // T3: 验证实际 gas 等于 EIP-7623 floor (不是 >=)
      // apothem (无EIP-7623): 实际 = 21288 ≠ 21200 → 失败
      // devnet (有EIP-7623): 实际 = 21200 = 21200 → 通过
      expect(
        gasUsed,
        `T3: Expected exactly ${eip7623Floor} with EIP-7623, got ${gasUsed}`
      ).to.eq(eip7623Floor);
    });

    /**
     * T4. 4 非零字节
     *
     * 用例: 零=0, 非零=4
     * XDC: 21000 + 4×68 = 21272
     * EIP-7623: 21000 + 10×(0 + 4×4) = 21160
     * 差异: -112 (XDC 更贵)
     *
     * 注意: 在 apothem (无EIP-7623) 上，实际 gas = 21272，断言会失败
     *       在 devnet (有EIP-7623) 上，实际 gas = 21160，断言会通过
     */
    it("T4. 4 Non-Zero Bytes", async function () {
      const zeroBytes = 0;
      const nonZeroBytes = 4;
      const calldata = "0x" + "ab".repeat(nonZeroBytes);
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T4: 4 Non-Zero Bytes ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateXDCCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);

      console.log("XDC Cost (no EIP-7623):", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("Difference:", (xdcCost - eip7623Floor).toString());

      // T4: 验证实际 gas 等于 EIP-7623 floor (不是 >=)
      // apothem (无EIP-7623): 实际 = 21272 ≠ 21160 → 失败
      // devnet (有EIP-7623): 实际 = 21160 = 21160 → 通过
      expect(
        gasUsed,
        `T4: Expected exactly ${eip7623Floor} with EIP-7623, got ${gasUsed}`
      ).to.eq(eip7623Floor);
    });

    /**
     * T5. 空 Calldata (基准 - 预期无差异)
     *
     * 用例: 零=0, 非零=0
     * XDC: 21000
     * EIP-7623: 21000
     * 差异: 0 (预期无差异)
     */
    it("T5. Empty Calldata (Baseline - No Difference Expected)", async function () {
      const zeroBytes = 0;
      const nonZeroBytes = 0;
      const calldata = "0x";
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T5: Empty Calldata (No Difference Expected) ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateXDCCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);

      console.log("XDC Cost (no EIP-7623):", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("Difference: 0 (expected)");

      // T5: 空 calldata 应该始终是 21000
      expect(gasUsed).to.eq(BASE_GAS, "T5: Empty calldata should always be 21000 gas");
    });
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  after(function () {
    console.log("\n=== EIP-7623 Test Suite Completed ===");
    console.log("\n=== Test Case Summary ===");
    console.log("| 用例 | 零 | 非零 | XDC (4/68) | EIP-7623 (10/40) | 差异 |");
    console.log("|------|---|------|------------|------------------|------|");
    console.log("| T2   | 4 | 0    | 21016      | 21040            | +24  |");
    console.log("| T3   | 4 | 4    | 21288      | 21200            | -88  |");
    console.log("| T4   | 0 | 4    | 21272      | 21160            | -112 |");
    console.log("| T5   | 0 | 0    | 21000      | 21000            | 0    |");
    console.log("\n注: T2, T3, T4 有差异可区分 EIP-7623 是否实现; T5 预期无差异");
  });
});
