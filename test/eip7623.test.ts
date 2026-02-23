/**
 * EIP-7623 Test Suite
 *
 * Calldata cost test suite for EIP-7623
 * Tests for calldata cost changes using REAL transactions with calldata
 *
 * EIP-7623: Increase calldata cost to reduce maximum block size
 * https://eips.ethereum.org/EIPS/eip-7623
 *
 * EIP-7623 PARAMETERS:
 *   - STANDARD_TOKEN_COST: 4 (standard token cost)
 *   - TOTAL_COST_FLOOR_PER_TOKEN: 10 (minimum cost per token)
 *   - Zero byte: 1 gas (standard), 10 gas (with floor)
 *   - Non-zero byte: 4 gas (standard), 40 gas (with floor)
 *
 * GAS FORMULA:
 *   - Old: tx.gasUsed = 21000 + STANDARD_TOKEN_COST * tokens + execution_gas
 *   - New: tx.gasUsed = 21000 + max(STANDARD path, FLOOR path)
 *     where FLOOR path = TOTAL_COST_FLOOR_PER_TOKEN * tokens
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

// EIP-7623 Constants
const STANDARD_TOKEN_COST = 4n;
const TOTAL_COST_FLOOR_PER_TOKEN = 10n;
const ZERO_BYTE_TOKEN_COST = 1n;  // Zero byte = 1 token (standard)
const BASE_GAS = 21000n;

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
  // A. CALLDATA COST CALCULATION TESTS
  // ============================================================

  /**
   * A1. Test Data-Heavy Transaction Pays Floor Cost
   *
   * KEY TEST: This is the main test for EIP-7623.
   * Uses REAL transaction to verify floor cost is applied.
   *
   * Without EIP-7623: ~37000 gas (21000 + 1000*4*4)
   * With EIP-7623: >= 61000 gas (21000 + 1000*4*10)
   */
  describe("A. Calldata Cost Calculation Tests", function () {
    it("A1. Test Data-Heavy Transaction Pays Floor Cost", async function () {
      // Create large calldata (1000 non-zero bytes)
      const calldataSize = 1000;
      const calldata = "0x" + "ab".repeat(calldataSize);
      
      // Send REAL transaction and get actual gas used
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- A1: Data-Heavy Transaction (1000 bytes) ---");
      console.log("Calldata size:", calldataSize, "bytes");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Calculate expected gas with and without EIP-7623
      // tokens = nonzero_bytes * 4 = 1000 * 4 = 4000
      const tokensInCalldata = BigInt(calldataSize) * STANDARD_TOKEN_COST;
      
      // WITHOUT EIP-7623: 21000 + 4 * tokens = 21000 + 4*4000 = 21000 + 16000 = 37000
      const gasWithoutEIP7623 = BASE_GAS + STANDARD_TOKEN_COST * tokensInCalldata;
      
      // WITH EIP-7623: 21000 + 10 * tokens = 21000 + 10*4000 = 21000 + 40000 = 61000
      const gasWithEIP7623Floor = BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * tokensInCalldata;

      console.log("Tokens in calldata:", tokensInCalldata.toString());
      console.log("Gas WITHOUT EIP-7623:", gasWithoutEIP7623.toString(), "(approximately)");
      console.log("Gas WITH EIP-7623 (floor):", gasWithEIP7623Floor.toString());

      // KEY ASSERTION: Gas must be >= floor cost to prove EIP-7623 is enabled
      expect(
        gasUsed,
        `EIP-7623 not enabled: gas ${gasUsed} < floor ${gasWithEIP7623Floor}. Expected >= ${gasWithEIP7623Floor} with EIP-7623`
      ).to.be.gte(gasWithEIP7623Floor);
    });

    it("A2. Test Non-Zero Bytes Pay Floor Cost", async function () {
      // Test: Only non-zero bytes (64 bytes)
      const nonZeroBytesSize = 64;
      const nonZeroBytesCalldata = "0x" + "ab".repeat(nonZeroBytesSize);

      // Send REAL transaction
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: nonZeroBytesCalldata,
      });

      console.log("\n--- A2: Non-Zero Byte Cost (64 bytes) ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Calculate expected values
      const nonZeroTokens = BigInt(nonZeroBytesSize) * STANDARD_TOKEN_COST; // non-zero = 4 tokens
      
      // Floor cost with EIP-7623
      const nonZeroFloor = BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * nonZeroTokens;

      // Standard cost without EIP-7623
      const nonZeroStandard = BASE_GAS + STANDARD_TOKEN_COST * nonZeroTokens;

      console.log("Non-zero standard cost (no EIP):", nonZeroStandard.toString());
      console.log("Non-zero floor cost (EIP-7623):", nonZeroFloor.toString());

      // CRITICAL ASSERTION: Non-zero bytes must meet EIP-7623 floor cost
      expect(
        gasUsed,
        `Non-zero bytes should use EIP-7623 floor cost (>= ${nonZeroFloor}). Got ${gasUsed}. Without EIP-7623, expected ~${nonZeroStandard}`
      ).to.be.gte(nonZeroFloor);
    });
  });

  // ============================================================
  // B. TRANSACTION VALIDITY TESTS
  // ============================================================

  describe("B. Transaction Validity Tests", function () {

    it("B2. Test Regular ETH Transfer Unaffected", async function () {
      // Send REAL ETH transfer transaction (no calldata)
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: "0x",
      });

      console.log("\n--- B2: Regular ETH Transfer ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Regular ETH transfer should always use 21000 gas
      // This should NOT be affected by EIP-7623
      expect(gasUsed).to.eq(BASE_GAS, "ETH transfer should use exactly 21000 gas");
      console.log("ETH transfer test completed - 21000 gas as expected");
    });
  });

  // ============================================================
  // C. EDGE CASES
  // ============================================================

  describe("C. Edge Cases", function () {
    it("C1. Test Pure Empty Calldata", async function () {
      // Send REAL transaction with empty calldata
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: "0x",
      });

      console.log("\n--- C1: Empty Calldata ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Should be exactly 21000 for empty calldata
      expect(gasUsed).to.eq(BASE_GAS, "Empty calldata should use exactly 21000 gas");
      console.log("Empty calldata test completed");
    });

    it("C2. Test Medium Calldata", async function () {
      // Test with 100 bytes to verify scaling
      const calldataSize = 100;
      const calldata = "0x" + "cd".repeat(calldataSize);
      
      // Send REAL transaction
      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- C2: Medium Calldata (100 bytes) ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Calculate floor cost
      const tokens = BigInt(calldataSize) * STANDARD_TOKEN_COST;
      const floor = BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * tokens;
      
      console.log("Floor cost:", floor.toString());

      // Should meet floor cost if EIP-7623 is enabled
      expect(
        gasUsed,
        `Should meet EIP-7623 floor cost (>= ${floor})`
      ).to.be.gte(floor);
    });

    /**
     * C3. Test Pure Zero Bytes
     *
     * EIP-7623 has different costs for zero and non-zero bytes:
     * - Zero byte: 1 gas (standard) → 10 gas (with floor)
     * - Non-zero byte: 4 gas (standard) → 40 gas (with floor)
     *
     * This tests the floor cost specifically for zero bytes.
     */
    it("C3. Test Pure Zero Bytes", async function () {
      // Pure zero bytes (all "00")
      const zeroBytesSize = 64;
      const calldata = "0x" + "00".repeat(zeroBytesSize);

      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- C3: Pure Zero Bytes (64 bytes) ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Zero byte = 1 token (standard), 10 tokens (floor)
      const zeroTokens = BigInt(zeroBytesSize) * ZERO_BYTE_TOKEN_COST;

      // Without EIP-7623: 21000 + 1*64 = 21064
      const standardCost = BASE_GAS + zeroTokens;

      // With EIP-7623: 21000 + 10*64 = 21640
      const floorCost = BASE_GAS + (zeroTokens * TOTAL_COST_FLOOR_PER_TOKEN);

      console.log("Zero bytes:", zeroBytesSize);
      console.log("Tokens (1 per byte):", zeroTokens.toString());
      console.log("Standard cost (1/token):", standardCost.toString());
      console.log("Floor cost (10/token):", floorCost.toString());

      // With EIP-7623, zero bytes should meet floor cost
      expect(
        gasUsed,
        `Pure zero bytes should meet EIP-7623 floor cost (>= ${floorCost}). Got ${gasUsed}. Without EIP-7623, expected ~${standardCost}`
      ).to.be.gte(floorCost);
    });

    /**
     * C4. Test Mixed Calldata (Zero + Non-Zero Bytes)
     *
     * Tests the interaction between zero and non-zero bytes.
     * EIP-7623 should apply floor to BOTH types of bytes.
     */
    it("C4. Test Mixed Calldata (Zero + Non-Zero Bytes)", async function () {
      // Create mixed calldata: 32 zero bytes + 32 non-zero bytes = 64 bytes total
      const zeroBytes = 32;
      const nonZeroBytes = 32;
      const totalBytes = zeroBytes + nonZeroBytes;

      // "00" is zero byte, "ab" is non-zero byte
      const calldata = "0x" + "00".repeat(zeroBytes) + "ab".repeat(nonZeroBytes);

      const gasUsed = await sendTxAndGetGas(owner, {
        to: ownerAddress,
        value: 0n,
        data: calldata,
      });

      console.log("\n--- C4: Mixed Calldata (32 zero + 32 non-zero bytes) ---");
      console.log("Actual Gas Used:", gasUsed.toString());

      // Calculate expected values
      // Zero bytes: 1 token each (standard), 10 tokens each (floor)
      // Non-zero bytes: 4 tokens each (standard), 40 tokens each (floor)
      const zeroTokens = BigInt(zeroBytes) * ZERO_BYTE_TOKEN_COST;
      const nonZeroTokens = BigInt(nonZeroBytes) * STANDARD_TOKEN_COST;

      // Total tokens
      const totalTokens = zeroTokens + nonZeroTokens;

      // Without EIP-7623: 21000 + 1*zero + 4*nonZero = 21000 + 32 + 128 = 21160
      const standardCost = BASE_GAS + zeroTokens + nonZeroTokens;

      // With EIP-7623 floor: 21000 + 10*zero + 40*nonZero = 21000 + 320 + 1280 = 23600
      // Actually: 10 * (zeroTokens + nonZeroTokens) = 10 * (32 + 128) = 10 * 160 = 1600
      // But EIP-7623 uses: TOTAL_COST_FLOOR_PER_TOKEN * tokens where tokens = zero + nonZero*4
      // So floor = 21000 + 10 * (32 + 128) = 21000 + 1600 = 22600
      const floorCost = BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * (zeroTokens + nonZeroTokens);

      console.log("Zero bytes:", zeroBytes, "-> tokens:", zeroTokens.toString());
      console.log("Non-zero bytes:", nonZeroBytes, "-> tokens:", nonZeroTokens.toString());
      console.log("Total tokens:", totalTokens.toString());
      console.log("Standard cost (no EIP):", standardCost.toString());
      console.log("Floor cost (EIP-7623):", floorCost.toString());

      // With EIP-7623, should meet floor cost
      expect(
        gasUsed,
        `Mixed calldata should meet EIP-7623 floor cost (>= ${floorCost}). Got ${gasUsed}`
      ).to.be.gte(floorCost);
    });
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  after(function () {
    console.log("\n=== EIP-7623 Test Suite Completed ===");
  });
});
