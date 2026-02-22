/**
 * EIP-7623 Test Suite
 *
 * Calldata cost test suite for EIP-7623
 * Tests for calldata cost changes using simple ETH transfers with calldata
 *
 * EIP-7623: Increase calldata cost to reduce maximum block size
 * https://eips.ethereum.org/EIPS/eip-7623
 *
 * EIP-7623 PARAMETERS:
 *   - STANDARD_TOKEN_COST: 4 (标准 token 成本)
 *   - TOTAL_COST_FLOOR_PER_TOKEN: 10 (每 token 的总成本下限)
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
import type { CalldataTester } from "../typechain-types";

// EIP-7623 Constants
const STANDARD_TOKEN_COST = 4n;
const TOTAL_COST_FLOOR_PER_TOKEN = 10n;
const ZERO_BYTE_TOKEN_COST = 1n;  // Zero byte = 1 token (standard)
const BASE_GAS = 21000n;

describe("EIP-7623 Complete Test Suite", function () {
  let owner: Signer;
  let ownerAddress: string;
  let chainId: bigint;
  let currentBlockNumber: bigint;
  let calldataTester: CalldataTester;

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

    // Deploy CalldataTester contract for execution-heavy tests
    const CalldataTesterFactory = await ethers.getContractFactory("CalldataTester");
    calldataTester = await CalldataTesterFactory.deploy() as CalldataTester;

    console.log("\n=== EIP-7623 Test Environment Info ===");
    console.log("Chain ID:", chainId.toString());
    console.log("Current Block Number:", currentBlockNumber.toString());
    console.log("Owner Address:", ownerAddress);
    console.log("CalldataTester Address:", await calldataTester.getAddress());
  });

  // ============================================================
  // A. CALLDATA COST CALCULATION TESTS
  // ============================================================

  /**
   * A1. Test Data-Heavy Transaction Pays Floor Cost
   *
   * KEY TEST: This is the main test for EIP-7623.
   * Without EIP-7623: ~37000 gas (21000 + 1000*4*4)
   * With EIP-7623: >= 61000 gas (21000 + 1000*4*10)
   */
  describe("A. Calldata Cost Calculation Tests", function () {
    it("A1. Test Data-Heavy Transaction Pays Floor Cost", async function () {
      // Create large calldata (1000 non-zero bytes)
      const calldataSize = 1000;
      const calldata = "0x" + "ab".repeat(calldataSize);
      
      // Use estimateGas instead of sending real transaction
      // This estimates gas without actually executing the transaction
      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });

      const gasUsed = estimatedGas;

      console.log("\n--- A1: Data-Heavy Transaction (1000 bytes) ---");
      console.log("Calldata size:", calldataSize, "bytes");
      console.log("Estimated Gas:", gasUsed.toString());

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

      // Use estimateGas instead of sending real transaction
      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: nonZeroBytesCalldata,
      });

      const gasUsed = estimatedGas;

      console.log("\n--- A2: Non-Zero Byte Cost (64 bytes) ---");
      console.log("Estimated Gas:", gasUsed.toString());

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

    /**
     * A3. Test Execution-Heavy Transaction Uses Standard Cost (COUNTER-TEST)
     *
     * ⚠️ CRITICAL: This is a FALSE POSITIVE prevention test!
     *
     * EIP-7623 Formula:
     *   tx.gasUsed = max(
     *     STANDARD_TOKEN_COST * tokens + execution_gas,  // Standard path (4/token)
     *     TOTAL_COST_FLOOR_PER_TOKEN * tokens            // Floor path (10/token)
     *   )
     *
     * Without this test, a buggy implementation could ALWAYS use floor cost,
     * and tests A1/A2 would still pass (false positive).
     *
     * This test verifies that when execution_gas is large enough,
     * the STANDARD path is used (not floor).
     *
     * We use storage writes (SSTORE) which have predictable gas costs:
     * - Cold storage write: ~20000 gas
     * - We call writeStorage multiple times to accumulate execution gas
     */
    it("A3. Test Execution-Heavy Transaction Uses Standard Cost", async function () {
      // Get the function selector for batchWriteStorage
      const funcSelector = calldataTester.interface.encodeFunctionData("batchWriteStorage", [10]);
      
      // Test 1: Call with just function selector (4 bytes) - should trigger fallback/revert
      const minimalGas = await owner.estimateGas({
        to: calldataTester,
        data: "0x" + "00".repeat(4),
      });
      
      // Test 2: Call with batchWriteStorage(uint256) - should execute 10 storage writes
      const executionGas = await owner.estimateGas({
        to: calldataTester,
        data: funcSelector,
      });
      
      // Test 3: With 100 bytes non-zero data
      const withDataGas = await owner.estimateGas({
        to: calldataTester,
        data: funcSelector + "ab".repeat(100),
      });

      console.log("\n--- A3: Execution-Heavy Transaction ---");
      console.log("Function selector:", funcSelector);
      console.log("Minimal calldata (4 bytes) gas:", minimalGas.toString());
      console.log("batchWriteStorage(10) gas:", executionGas.toString());
      console.log("With 100 bytes data gas:", withDataGas.toString());
      console.log("Expected: ~21000 (base) + ~200000 (10 storage writes) = ~221000");

      // Key assertion: batchWriteStorage should cost MUCH more than minimal call
      expect(
        executionGas,
        "batchWriteStorage(10) should execute 10 cold storage writes (~200k extra gas)"
      ).to.be.gt(minimalGas + 100000n);

      console.log("\n--- A3: Execution-Heavy Transaction (Counter-Test) ---");
      console.log("Calldata size:", calldataWithSelector.slice(2).length / 2, "bytes (including 4-byte selector)");
      console.log("Calldata (first 20 chars):", calldataWithSelector.slice(0, 20));
      console.log("Data-only gas (floor path):", dataOnlyGas.toString());
      console.log("Execution-heavy gas (standard path):", executionGas.toString());

      // Calculate expected values
      // 4 bytes selector + 100 bytes data = 104 bytes total
      // For non-zero bytes: 4 * 100 = 400 tokens
      // For zero bytes (selector): 0 tokens
      // Total: 400 tokens (only non-zero bytes count)
      const nonZeroBytes = 100; // data payload
      const tokensInCalldata = BigInt(nonZeroBytes) * STANDARD_TOKEN_COST;

      // Floor path: 21000 + 10 * 400 = 21000 + 4000 = 25000
      const floorCost = BASE_GAS + TOTAL_COST_FLOOR_PER_TOKEN * tokensInCalldata;

      // Standard path: 21000 + 4 * 400 + execution_gas
      // With 10 storage writes @ ~20000 gas each = ~200000 gas
      // Standard: 21000 + 1600 + 200000 = ~223600
      const standardCost = BASE_GAS + STANDARD_TOKEN_COST * tokensInCalldata;

      console.log("Tokens in calldata:", tokensInCalldata.toString());
      console.log("Floor cost (10/token):", floorCost.toString());
      console.log("Standard cost base (4/token):", standardCost.toString());
      console.log("Expected execution gas:", "~200000 (10 cold storage writes)");

      // KEY ASSERTION: With significant execution gas, actual cost should be
      // MUCH higher than floor cost - proving standard path is used
      // If floor path was used incorrectly, executionGas would be ~25000 (no execution counted)
      expect(
        executionGas,
        `Execution-heavy tx should cost significantly MORE than floor (${floorCost}). Got ${executionGas}. This proves standard path is used with execution gas counted.`
      ).to.be.gt(floorCost + 50000n);

      // Additional: executionGas should be significantly higher than dataOnlyGas
      // This proves execution gas IS being added, not replaced
      expect(
        executionGas,
        `Execution-heavy should cost more than data-only (${dataOnlyGas})`
      ).to.be.gt(dataOnlyGas + 50000n);

      console.log("Counter-test passed - Standard path is correctly used!");
    });
  });

  // ============================================================
  // B. TRANSACTION VALIDITY TESTS
  // ============================================================

  describe("B. Transaction Validity Tests", function () {

    it("B2. Test Regular ETH Transfer Unaffected", async function () {
      // Use estimateGas instead of sending real transaction
      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: "0x",
      });

      const gasUsed = estimatedGas;

      console.log("\n--- B2: Regular ETH Transfer ---");
      console.log("Estimated Gas:", gasUsed.toString());

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
      // Use estimateGas instead of sending real transaction
      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: "0x",
      });

      const gasUsed = estimatedGas;

      console.log("\n--- C1: Empty Calldata ---");
      console.log("Estimated Gas:", gasUsed.toString());

      // Should be exactly 21000 for empty calldata
      expect(gasUsed).to.eq(BASE_GAS, "Empty calldata should use exactly 21000 gas");
      console.log("Empty calldata test completed");
    });

    it("C2. Test Medium Calldata", async function () {
      // Test with 100 bytes to verify scaling
      const calldataSize = 100;
      const calldata = "0x" + "cd".repeat(calldataSize);
      
      // Use estimateGas instead of sending real transaction
      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });

      const gasUsed = estimatedGas;

      console.log("\n--- C2: Medium Calldata (100 bytes) ---");
      console.log("Estimated Gas:", gasUsed.toString());

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

      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });

      const gasUsed = estimatedGas;

      console.log("\n--- C3: Pure Zero Bytes (64 bytes) ---");
      console.log("Estimated Gas:", gasUsed.toString());

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

      const estimatedGas = await owner.estimateGas({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });

      const gasUsed = estimatedGas;

      console.log("\n--- C4: Mixed Calldata (32 zero + 32 non-zero bytes) ---");
      console.log("Estimated Gas:", gasUsed.toString());

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
