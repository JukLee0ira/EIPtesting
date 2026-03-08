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
 * noEIP-7623 NETWORK GAS FORMULA (Legacy)
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
 *   - Legacy: Non-zero=68, Zero=4
 *   - EIP-7623 Floor: Non-zero=40, Zero=10
 *   - Regular ETH transfers (no calldata): Always 21000 gas
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

// ============================================================
// Legacy NETWORK CONSTANTS 
// ============================================================
const LEGACY_NONZERO_BYTE_COST = 68n;  // Legacy: non-zero byte = 68 gas
const LEGACY_ZERO_BYTE_COST = 4n;      // Legacy: zero byte = 4 gas

// EIP-7623 Constants (After EIP-7623)
const STANDARD_TOKEN_COST = 4n;
const TOTAL_COST_FLOOR_PER_TOKEN = 10n;
const ZERO_BYTE_TOKEN_COST = 1n;  // Zero byte = 1 token (standard)
const BASE_GAS = 21000n;

// Helper function: Calculate noEIP-7623 (legacy) gas cost
function calculateLegacyCost(nonZeroBytes: number, zeroBytes: number): bigint {
  return BASE_GAS + LEGACY_NONZERO_BYTE_COST * BigInt(nonZeroBytes) + LEGACY_ZERO_BYTE_COST * BigInt(zeroBytes);
}

// Helper function: Calculate EIP-7623 floor cost
function calculateEIP7623FloorCost(nonZeroBytes: number, zeroBytes: number): bigint {
  const tokens = BigInt(zeroBytes) + BigInt(nonZeroBytes) * STANDARD_TOKEN_COST;
  return BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * tokens;
}

// Helper function: Calculate EIP-7623 full formula (max of STANDARD and FLOOR)
// EIP-7623: gas = 21000 + max(STANDARD_path, FLOOR_path)
//   - STANDARD_path = 21000 + 4 * zero_bytes + 68 * non_zero_bytes (legacy rates)
//   - FLOOR_path = 21000 + 10 * (zero_bytes + 4 * non_zero_bytes)
function calculateEIP7623Cost(nonZeroBytes: number, zeroBytes: number): bigint {
  const standardPath = BASE_GAS + LEGACY_ZERO_BYTE_COST * BigInt(zeroBytes) + LEGACY_NONZERO_BYTE_COST * BigInt(nonZeroBytes);
  const floorPath = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);
  return standardPath > floorPath ? standardPath : floorPath;
}

/** Calculate STANDARD path cost */
function calculateStandardPath(zeroBytes: number, nonZeroBytes: number): bigint {
  return BASE_GAS + LEGACY_ZERO_BYTE_COST * BigInt(zeroBytes) + LEGACY_NONZERO_BYTE_COST * BigInt(nonZeroBytes);
}

/** Calculate FLOOR path cost */
function calculateFloorPath(zeroBytes: number, nonZeroBytes: number): bigint {
  return calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);
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

/** Verify gas used with tolerance for chain variations */
function verifyGasWithTolerance(actual: bigint, expected: bigint, tolerance: bigint = 100n): void {
  const diff = actual > expected ? actual - expected : expected - actual;
  expect(diff).to.lte(tolerance, `Gas difference ${diff} exceeds tolerance ${tolerance}`);
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
  // T1-T4: EIP-7623 公式验证测试 (每个用例 4 字节)
  // ============================================================
  describe("T1-T4: EIP-7623 Formula Verification (4 bytes each)", function () {
    /**
     * T1. 4 零字节
     *
     * 用例: 零=4, 非零=0
     * noEIP-7623: 21000 + 4×4 = 21016
     * EIP-7623 STANDARD: 21000 + 4×4 = 21016
     * EIP-7623 FLOOR: 21000 + 10×4 = 21040
     * MAX(21016, 21040) = 21040
     * 差异: +24 (EIP-7623 更贵)
     *
     * 注意: 在 apothem (无EIP-7623) 上，实际 gas = 21016，断言会失败
     *       在 devnet (有EIP-7623) 上，实际 gas = 21040，断言会通过
     */
    it("T1. 4 Zero Bytes", async function () {
      const zeroBytes = 4;
      const nonZeroBytes = 0;
      const calldata = "0x" + "00".repeat(zeroBytes);
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T1: 4 Zero Bytes ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateLegacyCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);
      const eip7623Cost = calculateEIP7623Cost(nonZeroBytes, zeroBytes);

      console.log("noEIP-7623 Cost :", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("EIP-7623 (max):", eip7623Cost.toString());
      console.log("Difference:", (eip7623Cost - xdcCost).toString());

      // T1: 验证实际 gas 等于 EIP-7623 max
      // apothem (无EIP-7623): 实际 = 21016 ≠ 21040 → 失败
      // devnet (有EIP-7623): 实际 = 21040 = 21040 → 通过
      expect(
        gasUsed,
        `T1: Expected exactly ${eip7623Cost} with EIP-7623, got ${gasUsed}`
      ).to.eq(eip7623Cost);
    });

    /**
     * T2. 8 零字节 + 1 非零字节 (高区分度)
     *
     * 用例: 零=8, 非零=1
     * noEIP-7623: 21000 + 4×8 + 68×1 = 21100
     * EIP-7623 STANDARD: 21000 + 4×8 + 68×1 = 21100
     * EIP-7623 FLOOR: 21000 + 10×(8 + 1×4) = 21200
     * MAX(21100, 21200) = 21200
     * 差异: +100 (FLOOR 更大，EIP-7623 更贵)
     *
     * 注意: 在 apothem (无EIP-7623) 上，实际 gas = 21100，断言会失败
     *       在 devnet (有EIP-7623) 上，实际 gas = 21200，断言会通过
     */
    it("T2. 8 Zero + 1 Non-Zero Bytes (High Discriminability)", async function () {
      const zeroBytes = 8;
      const nonZeroBytes = 1;
      const calldata = "0x" + "00".repeat(zeroBytes) + "ab".repeat(nonZeroBytes);
      
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- T2: 8 Zero + 1 Non-Zero Bytes ---");
      console.log("Zero bytes:", zeroBytes, "| Non-zero bytes:", nonZeroBytes);
      console.log("Actual Gas Used:", gasUsed.toString());

      const xdcCost = calculateLegacyCost(nonZeroBytes, zeroBytes);
      const eip7623Floor = calculateEIP7623FloorCost(nonZeroBytes, zeroBytes);
      const eip7623Cost = calculateEIP7623Cost(nonZeroBytes, zeroBytes);

      console.log("noEIP-7623 Cost :", xdcCost.toString());
      console.log("EIP-7623 Floor:", eip7623Floor.toString());
      console.log("EIP-7623 (max):", eip7623Cost.toString());
      console.log("Difference:", (eip7623Cost - xdcCost).toString());

      // T2: 验证实际 gas 等于 EIP-7623 max
      // apothem (无EIP-7623): 实际 = 21100 ≠ 21200 → 失败
      // devnet (有EIP-7623): 实际 = 21200 = 21200 → 通过
      expect(
        gasUsed,
        `T2: Expected exactly ${eip7623Cost} with EIP-7623, got ${gasUsed}`
      ).to.eq(eip7623Cost);
    });
  });

  // ============================================================
  // T3. FLOOR = STANDARD Critical Point (5 Zero + 1 Non-Zero)
  // ============================================================
  describe("T3. Critical Point: 5 Zero + 1 Non-Zero (FLOOR ≈ STANDARD)", function () {
    /**
     * T3. FLOOR = STANDARD 临界点
     *
     * 用例: 零=5, 非零=1
     * noEIP-7623: 21000 + 4×5 + 68×1 = 21088
     * EIP-7623 STANDARD: 21000 + 4×5 + 68×1 = 21088
     * EIP-7623 FLOOR: 21000 + 10×(5 + 1×4) = 21090
     * MAX(21088, 21090) = 21090
     * 差异: +2 (FLOOR 略大，仅差 2 gas)
     */
    it("T3. Should correctly handle FLOOR ≈ STANDARD boundary", async function () {
      const zeroBytes = 5;
      const nonZeroBytes = 1;
      const calldata = "0x" + "00".repeat(zeroBytes) + "ab".repeat(nonZeroBytes);

      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      const standardPath = calculateStandardPath(zeroBytes, nonZeroBytes);
      const floorPath = calculateFloorPath(zeroBytes, nonZeroBytes);
      const eip7623Cost = calculateEIP7623Cost(nonZeroBytes, zeroBytes);

      console.log(`\n--- T5: ${zeroBytes} Zero + ${nonZeroBytes} Non-Zero (Critical Point) ---`);
      console.log(`Calldata: ${calldata}`);
      console.log(`STANDARD: ${standardPath} | FLOOR: ${floorPath} | EIP-7623: ${eip7623Cost}`);
      console.log(`Actual: ${gasUsed}`);
      console.log(`>>> Path: ${floorPath > standardPath ? "FLOOR (higher)" : "STANDARD (higher)"}`);
      console.log(`>>> Difference: ${floorPath > standardPath ? floorPath - standardPath : standardPath - floorPath} gas`);

      expect(floorPath).to.be.gt(standardPath, "FLOOR should be > STANDARD at this boundary");
      expect(gasUsed).to.eq(eip7623Cost);
      verifyGasWithTolerance(gasUsed, eip7623Cost);
    });
  });

  // ============================================================
  // T4. Large Calldata Test (10KB)
  // ============================================================
  describe("T4. Large Calldata: 10KB", function () {
    /**
     * T4. 极端大数据 - 测试超大 calldata (10KB)
     */
    it("T4. Should handle large calldata correctly", async function () {
      const largeSize = 10240; // 10KB
      const zeroBytes = Math.floor(largeSize / 2);
      const nonZeroBytes = largeSize - zeroBytes;
      const calldata = "0x" + "00".repeat(zeroBytes) + "ab".repeat(nonZeroBytes);

      console.log(`\n--- T7: Large Calldata (${largeSize} bytes) ---`);
      console.log(`Zero: ${zeroBytes}, Non-Zero: ${nonZeroBytes}`);

      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
        gasLimit: 2000000n, // Increase gas limit for large calldata
      });

      const xdcCost = calculateLegacyCost(nonZeroBytes, zeroBytes);
      const standardPath = calculateStandardPath(zeroBytes, nonZeroBytes);
      const floorPath = calculateFloorPath(zeroBytes, nonZeroBytes);
      const eip7623Cost = calculateEIP7623Cost(nonZeroBytes, zeroBytes);

      console.log(`noEIP-7623: ${xdcCost}`);
      console.log(`STANDARD: ${standardPath} | FLOOR: ${floorPath} | EIP-7623: ${eip7623Cost}`);
      console.log(`Actual: ${gasUsed}`);
      console.log(`>>> Path: ${standardPath > floorPath ? "STANDARD" : "FLOOR"}`);

      expect(gasUsed).to.eq(eip7623Cost);
      verifyGasWithTolerance(gasUsed, eip7623Cost);
    });
  });

  // ============================================================
  // T5. Zero Byte Boundary Tests (1-10 bytes)
  // ============================================================
  describe("T5. Zero Byte Boundary: 1-10 Zero Bytes", function () {
    /**
     * T5. 边界测试 - 1-10 零字节递增
     */
    it("T5. Should handle incremental zero bytes correctly", async function () {
      const testCases = [
        { zero: 1, nonZero: 0, desc: "1 Zero" },
        { zero: 2, nonZero: 0, desc: "2 Zero" },
        { zero: 5, nonZero: 0, desc: "5 Zero" },
        { zero: 10, nonZero: 0, desc: "10 Zero" },
      ];

      for (const tc of testCases) {
        const calldata = "0x" + "00".repeat(tc.zero);
        const gasUsed = await sendTxAndGetGas(owner, {
          to: ownerAddress,
          value: 0n,
          data: calldata,
        });

        const xdcCost = calculateLegacyCost(tc.nonZero, tc.zero);
        const eip7623Cost = calculateEIP7623Cost(tc.nonZero, tc.zero);

        console.log(`\n--- T8: ${tc.desc} ---`);
        console.log(`noEIP-7623: ${xdcCost} | EIP-7623: ${eip7623Cost} | Actual: ${gasUsed}`);
        console.log(`>>> Difference: ${eip7623Cost - xdcCost} gas`);

        expect(gasUsed).to.eq(eip7623Cost);
        verifyGasWithTolerance(gasUsed, eip7623Cost);
      }
    });
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  after(function () {
    console.log("\n=== EIP-7623 Test Suite Completed ===");
    console.log("\n=== Test Case Summary ===");
    console.log("| Case | Zero | NonZero | noEIP-7623 | STANDARD | FLOOR  | EIP-7623 | Diff | Path   |");
    console.log("|------|------|---------|------------|----------|---------|----------|------|--------|");
    console.log("| T1   | 4    | 0       | 21016      | 21016    | 21040   | 21040    | +24  | FLOOR  |");
    console.log("| T2   | 8    | 1       | 21100      | 21100    | 21200   | 21200    | +100 | FLOOR  |");
    console.log("| T3   | 5    | 1       | 21088      | 21088    | 21090   | 21090    | +2   | FLOOR* |");
    console.log("| T4   | 5120 | 5120    | huge       | huge     | huge    | huge     | huge | varies |");
    console.log("| T5   | 1-10 | 0       | varies     | varies   | varies  | varies   | varies| FLOOR  |");
    console.log("\nKey: All tests (T1,T2,T3,T5) show FLOOR > STANDARD (distinguishable)");
    console.log("* T3 is critical point where FLOOR ≈ STANDARD (diff only 2 gas)");
  });
});
