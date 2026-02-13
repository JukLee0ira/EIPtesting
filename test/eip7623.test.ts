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

// EIP-7623 Constants
const STANDARD_TOKEN_COST = 4n;
const TOTAL_COST_FLOOR_PER_TOKEN = 10n;
const BASE_GAS = 21000n;

describe("EIP-7623 Complete Test Suite", function () {
  let owner: Signer;
  let ownerAddress: string;
  let chainId: bigint;
  let currentBlockNumber: bigint;

  // ============================================================
  // BEFORE ALL: Setup test environment
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
   * Without EIP-7623: ~37000 gas (21000 + 1000*4*4)
   * With EIP-7623: >= 61000 gas (21000 + 1000*4*10)
   */
  describe("A. Calldata Cost Calculation Tests", function () {
    it("A1. Test Data-Heavy Transaction Pays Floor Cost", async function () {
      // Create large calldata (1000 non-zero bytes)
      const calldataSize = 1000;
      const calldata = "0x" + "ab".repeat(calldataSize);
      
      // Send transaction with large calldata
      const tx = await owner.sendTransaction({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const gasUsed = receipt.gasUsed;

      console.log("\n--- A1: Data-Heavy Transaction (1000 bytes) ---");
      console.log("Calldata size:", calldataSize, "bytes");
      console.log("Gas Used:", gasUsed.toString());

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

      const tx = await owner.sendTransaction({
        to: ownerAddress,
        value: 0,
        data: nonZeroBytesCalldata,
      });
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const gasUsed = receipt.gasUsed;

      console.log("\n--- A2: Non-Zero Byte Cost (64 bytes) ---");
      console.log("Non-zero bytes gas:", gasUsed.toString());

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
      // Send regular ETH transfer (no calldata)
      const tx = await owner.sendTransaction({
        to: ownerAddress,
        value: 0,
        data: "0x",
      });
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const gasUsed = receipt.gasUsed;

      console.log("\n--- B2: Regular ETH Transfer ---");
      console.log("Gas Used:", gasUsed.toString());

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
      // Send transaction with no calldata at all
      const tx = await owner.sendTransaction({
        to: ownerAddress,
        value: 0,
        data: "0x",
      });
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const gasUsed = receipt.gasUsed;

      console.log("\n--- C1: Empty Calldata ---");
      console.log("Gas Used:", gasUsed.toString());

      // Should be exactly 21000 for empty calldata
      expect(gasUsed).to.eq(BASE_GAS, "Empty calldata should use exactly 21000 gas");
      console.log("Empty calldata test completed");
    });

    it("C2. Test Medium Calldata", async function () {
      // Test with 100 bytes to verify scaling
      const calldataSize = 100;
      const calldata = "0x" + "cd".repeat(calldataSize);
      
      const tx = await owner.sendTransaction({
        to: ownerAddress,
        value: 0,
        data: calldata,
      });
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const gasUsed = receipt.gasUsed;

      console.log("\n--- C2: Medium Calldata (100 bytes) ---");
      console.log("Gas Used:", gasUsed.toString());

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
  });

  // ============================================================
  // SUMMARY
  // ============================================================
  after(function () {
    console.log("\n=== EIP-7623 Test Suite Completed ===");
  });
});
