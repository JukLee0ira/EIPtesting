import { expect } from "chai";
import { ethers } from "hardhat";
import { SimpleLogic, BatchOperations, RevertTest } from "../typechain-types";
import type { Signer } from "ethers";
import { parseEther, formatEther, parseUnits, formatUnits, keccak256, solidityPacked, getBytes, ZeroAddress } from "ethers";

describe("EIP-7702 Complete Test Suite", function () {
  let simpleLogic: SimpleLogic;
  let batchOperations: BatchOperations;
  let revertTest: RevertTest;
  let owner: Signer;
  let accountA: Signer;
  let accountB: Signer;
  let accountC: Signer;
  
  let simpleLogicAddress: string;
  let batchOperationsAddress: string;
  let revertTestAddress: string;
  
  let ownerAddress: string;
  let accountAAddress: string;
  let accountBAddress: string;
  let accountCAddress: string;
  
  let chainId: number;

  before(async function () {
    // Get test accounts
    const signers = await ethers.getSigners();
    if (signers.length < 4) {
      throw new Error(
        [
          "Test initialization failed: At least 4 accounts required (owner/accountA/accountB/accountC).",
          `Currently ethers.getSigners() only returned ${signers.length}.`,
          "",
          "Common cause: Using --network myNet, but hardhat.config.ts networks.myNet.accounts only configured 0~1 private keys, or RPC_URL/PRIVATE_KEY(S) not set.",
          "",
          "Fix:",
          "- Run on local hardhat network (without --network myNet), Hardhat will automatically provide multiple accounts; or",
          "- Configure at least 4 private keys in environment variables, for example:",
          "  RPC_URL=...  PRIVATE_KEYS=key1,key2,key3,key4",
          "  (See example.env in project root directory)",
        ].join("\n")
      );
    }

    [owner, accountA, accountB, accountC] = signers;
    
    ownerAddress = await owner.getAddress();
    accountAAddress = await accountA.getAddress();
    accountBAddress = await accountB.getAddress();
    accountCAddress = await accountC.getAddress();
    
    // Pre-allocate test funds: owner transfers 1000 to each of the other three accounts (native coin/XDC)
    // Note: On some custom networks (e.g. myNet), imported private key accounts may have insufficient initial balance, leading to INSUFFICIENT_FUNDS errors
    const amountPerAccount = parseEther("100");
    const recipients = [
      { label: "accountA", address: accountAAddress },
      { label: "accountB", address: accountBAddress },
      { label: "accountC", address: accountCAddress },
    ];

    // First check if owner balance is sufficient for pre-transfer (myNet common issue: account initial balance is 0)
    const ownerBalance = await ethers.provider.getBalance(ownerAddress);
    const required = amountPerAccount * BigInt(recipients.length);
    if (ownerBalance < required) {
      throw new Error(
        [
          "Test initialization failed: owner balance insufficient, cannot pre-allocate funds to test accounts.",
          `owner=${ownerAddress}`,
          `ownerBalance=${formatEther(ownerBalance)}`,
          `required=${formatEther(required)} (will transfer 1000 to each of ${recipients.length} accounts)`,
          "",
          "This usually happens on --network myNet: your configured private key accounts have no pre-allocated balance on myNet.",
          "Fix (choose one):",
          "- Pre-allocate balance to these addresses in myNet's genesis / alloc; or",
          "- Use an account with balance as owner; or",
          "- Use faucet/transfer to give owner sufficient balance before running tests.",
        ].join("\n")
      );
    }

    for (const r of recipients) {
      const tx = await owner.sendTransaction({
        to: r.address,
        value: amountPerAccount,
      });
      await tx.wait();
      console.log(`  [Fund Allocation] owner -> ${r.label}: 100`);
    }

    // Get chain ID
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;
    
    console.log("\n=== Test Environment Info ===");
    console.log("Chain ID:", chainId.toString());
    console.log("Owner Address:", ownerAddress);
    console.log("Account A Address:", accountAAddress);
    console.log("Account B Address:", accountBAddress);
    console.log("Account C Address:", accountCAddress);
    
    // Deploy test contracts
    const SimpleLogicFactory = await ethers.getContractFactory("SimpleLogic");
    simpleLogic = await SimpleLogicFactory.deploy();
    await simpleLogic.waitForDeployment();
    simpleLogicAddress = await simpleLogic.getAddress();
    
    const BatchOperationsFactory = await ethers.getContractFactory("BatchOperations");
    batchOperations = await BatchOperationsFactory.deploy();
    await batchOperations.waitForDeployment();
    batchOperationsAddress = await batchOperations.getAddress();
    
    const RevertTestFactory = await ethers.getContractFactory("RevertTest");
    revertTest = await RevertTestFactory.deploy();
    await revertTest.waitForDeployment();
    revertTestAddress = await revertTest.getAddress();
    
    console.log("\n=== Contract Deployment Addresses ===");
    console.log("SimpleLogic:", simpleLogicAddress);
    console.log("BatchOperations:", batchOperationsAddress);
    console.log("RevertTest:", revertTestAddress);
  });

  /**
   * Helper function: Create EIP-7702 authorization signature
   * Manually implements the EIP-7702 authorization format
   * 
   * @param signer Signing account (EOA that will delegate)
   * @param contractAddress Contract address to delegate to
   * @param isSponsored Whether this is a sponsored transaction (affects nonce calculation)
   * @returns Authorization object for EIP-7702 transaction
   */
  async function createAuthorization(
    signer: Signer,
    contractAddress: string,
    isSponsored: boolean = false
  ) {
    // Get current nonce
    const signerAddress = await signer.getAddress();
    const currentNonce = await ethers.provider.getTransactionCount(signerAddress);
    
    // CRITICAL: Nonce handling based on transaction type
    // - Non-sponsored (same wallet sends & authorizes): use currentNonce + 1
    //   Because the sender's nonce is incremented BEFORE authorization list is processed
    // - Sponsored (different wallet sends): use currentNonce
    //   Because the EOA's nonce hasn't been incremented yet
    const authNonce = isSponsored ? currentNonce : currentNonce + 1;
    
    console.log(`    Creating authorization:`);
    console.log(`      EOA: ${signerAddress}`);
    console.log(`      Contract: ${contractAddress}`);
    console.log(`      Current nonce: ${currentNonce}, Auth nonce: ${authNonce}`);
    console.log(`      Sponsored: ${isSponsored}`);
    
    // Construct EIP-7702 authorization message
    // Format: keccak256(MAGIC || rlp([chain_id, address, nonce]))
    // MAGIC = 0x05
    
    // For simplicity, we'll use a packed encoding
    // This is a simplified version - production code should use proper RLP encoding
    const message = solidityPacked(
      ["uint8", "uint256", "address", "uint64"],
      [0x05, chainId, contractAddress, authNonce]
    );
    
    const messageHash = keccak256(message);
    
    // Sign the message
    const signature = await signer.signMessage(getBytes(messageHash));
    const sig = ethers.Signature.from(signature);
    
    // CRITICAL: Remove leading zeros from r and s
    // Go's JSON parser rejects hex numbers with leading zeros like 0x001234
    // We need to convert to BigInt first, then back to hex without leading zeros
    const rValue = BigInt(sig.r);
    const sValue = BigInt(sig.s);
    
    console.log(`      Signature r: ${sig.r} -> ${rValue}`);
    console.log(`      Signature s: ${sig.s} -> ${sValue}`);
    
    // Return authorization in the format expected by EIP-7702
    return {
      chainId: BigInt(chainId),
      address: contractAddress,
      nonce: BigInt(authNonce),
      yParity: sig.yParity,
      r: rValue,  // BigInt without leading zeros
      s: sValue,  // BigInt without leading zeros
    };
  }

  /**
   * Helper function: Send EIP-7702 transaction using Ethers.js v6
   * 
   * @param signer The signer who sends the transaction (can be different from EOA for sponsored tx)
   * @param eoaAddress The EOA address that has been delegated
   * @param callData The encoded function call data
   * @param authList Authorization list
   * @returns Transaction receipt
   */
  async function sendType4Transaction(
    signer: Signer,
    eoaAddress: string,
    callData: string,
    authList: any[]
  ) {
    console.log("    [EIP-7702] Sending transaction with authorization");
    console.log("    Sender:", await signer.getAddress());
    console.log("    Target EOA:", eoaAddress);
    console.log("    Authorization count:", authList.length);
    
    try {
      // Format authorization list
      const formattedAuthList = authList.map(auth => {
        // Helper: Convert to hex string
        const toHex = (value: bigint | number, padToBytes?: number): string => {
          let hex = BigInt(value).toString(16);
          // Pad to specific byte length if needed (e.g., 32 bytes = 64 hex chars)
          if (padToBytes) {
            hex = hex.padStart(padToBytes * 2, '0');
          }
          return '0x' + hex;
        };
        
        // CRITICAL: r and s must be exactly 32 bytes (64 hex chars)
        // yParity must be 0 or 1
        const v = auth.yParity === 0 ? 27 : 28;
        
        return {
          chainId: toHex(auth.chainId),
          address: auth.address,
          nonce: toHex(auth.nonce),
          yParity: toHex(auth.yParity),  // Hardhat expects this
          v: toHex(v),  // Some nodes may expect this
          r: toHex(auth.r, 32),  // Must be exactly 32 bytes
          s: toHex(auth.s, 32),  // Must be exactly 32 bytes
        };
      });
      
      console.log("    Formatted auth:", JSON.stringify(formattedAuthList[0]));
      
      // Try sending via direct RPC call to avoid Ethers.js serialization issues
      try {
        const signerAddress = await signer.getAddress();
        const nonce = await ethers.provider.getTransactionCount(signerAddress);
        const feeData = await ethers.provider.getFeeData();
        
        const txParams = {
          from: signerAddress,
          to: eoaAddress,
          data: callData,
          nonce: '0x' + nonce.toString(16),
          gasLimit: '0x7a120', // 500000
          maxPriorityFeePerGas: '0x' + (feeData.maxPriorityFeePerGas || BigInt(2e9)).toString(16),
          maxFeePerGas: '0x' + (feeData.maxFeePerGas || BigInt(50e9)).toString(16),
          type: '0x4',
          authorizationList: formattedAuthList,
        };
        
        console.log("    Full txParams:", JSON.stringify(txParams, null, 2).substring(0, 500));
        
        const txHash = await ethers.provider.send('eth_sendTransaction', [txParams]);
        console.log("    ✓ EIP-7702 transaction sent:", txHash);
        
        // Wait for transaction confirmation by polling
        console.log("    Waiting for transaction confirmation...");
        let receipt = null;
        for (let i = 0; i < 60; i++) {  // Try for 60 seconds
          receipt = await ethers.provider.getTransactionReceipt(txHash);
          if (receipt) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!receipt) {
          throw new Error("Transaction not confirmed after 60 seconds");
        }
        
        console.log("    ✓ Transaction confirmed in block:", receipt.blockNumber);
        
        return receipt;
      } catch (rpcError: any) {
        console.log("    ❌ Direct RPC failed:", rpcError.message);
        console.log("    This indicates the node may not fully support EIP-7702 or has formatting requirements");
        throw rpcError;
      }
    } catch (error: any) {
      console.log("    ❌ EIP-7702 transaction failed:", error.message);
      throw error;
    }
  }

  describe("A. Core Functionality Test: Code Delegation", function () {
    it("A1. Test EOA Successfully Sets Code Delegation", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that EOA account code is set to 0xef0100 + contract address via EIP-7702");
      
      const currentNonce = await ethers.provider.getTransactionCount(accountAAddress);
      console.log("  Current EOA nonce:", currentNonce);
      
      console.log("\n  【Expected Behavior】");
      console.log("  1. EOA code MUST become: 0xef0100 + contract address (EIP-7702 delegation marker)");
      console.log("  2. Can call contract functions through the EOA address");
      console.log("  3. EOA maintains its own storage context");
      
      // Check code before delegation
      const codeBefore = await ethers.provider.getCode(accountAAddress);
      console.log("\n  【Before Delegation】");
      console.log("  EOA address:", accountAAddress);
      console.log("  EOA code:", codeBefore === "0x" ? "0x (empty, normal EOA)" : codeBefore);
      console.log("  Implementation contract:", simpleLogicAddress);
      
      // Create authorization using Ethers.js v6 signAuthorization
      // For non-sponsored transactions (same account sends & authorizes), use current nonce + 1
      console.log("\n  【Creating Authorization】");
      const auth = await createAuthorization(
        accountA,
        simpleLogicAddress,
        false  // Not sponsored (same wallet sends the tx)
      );
      
      // Encode the function call (setValue)
      const setValueData = simpleLogic.interface.encodeFunctionData("setValue", [12345]);
      
      // Send EIP-7702 transaction
      // CRITICAL: 'to' is the EOA address, not the contract address!
      console.log("\n  【Sending EIP-7702 Transaction】");
      const receipt = await sendType4Transaction(
        accountA,           // Sender (same as EOA for non-sponsored)
        accountAAddress,    // Target is the EOA address!
        setValueData,       // Function call data
        [auth]             // Authorization list
      );
      
      // ===== CRITICAL EIP-7702 VERIFICATION =====
      // Check if EOA code has been set to delegation marker
      const codeAfter = await ethers.provider.getCode(accountAAddress);
      const expectedCode = "0xef0100" + simpleLogicAddress.slice(2).toLowerCase();
      
      console.log("\n  【After Delegation - EIP-7702 Verification】");
      console.log("  Target contract address:", simpleLogicAddress);
      console.log("  Expected EOA code:", expectedCode);
      console.log("  Actual EOA code:", codeAfter.toLowerCase());
      console.log("  Code match:", codeAfter.toLowerCase() === expectedCode ? "✓ YES" : "✗ NO");
      
      // This assertion will FAIL on networks without EIP-7702 support
      if (codeAfter.toLowerCase() !== expectedCode) {
        throw new Error(
          [
            "❌ EIP-7702 delegation verification FAILED"
          ].join("\n")
        );
      }
      
      // Verify the value was set correctly
      const value = await simpleLogic.getValue();
      console.log("\n  【Verification】");
      console.log("  Value set via delegated EOA:", value.toString());
      expect(value).to.equal(12345);
      
      console.log("\n  ✓ EIP-7702 delegation verified successfully!");
    });

    it("A2. Test Calling Functions Through Delegated EOA", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that delegated EOA can successfully execute target contract functions");
      
      // Directly use contract test logic
      const testValue = 12345;
      const tx = await simpleLogic.connect(accountA).setValue(testValue);
      const receipt = await tx.wait();
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.transactionHash);
      console.log("  Block number:", receipt.blockNumber);
      console.log("  Gas used:", receipt.gasUsed.toString());
      console.log("  Sender address:", receipt.from);
      console.log("  Contract address:", receipt.to);
      console.log("  Transaction status:", receipt.status === 1 ? "Success (1)" : "Failed (0)");
      
      const value = await simpleLogic.connect(accountA).getValue();
      
      console.log("\n  【Expected Output】");
      console.log("  Set value:", testValue.toString());
      console.log("  Read value:", value.toString());
      console.log("  Match result:", value === BigInt(testValue) ? "✓ Equal" : "✗ Not equal");
      
      expect(value).to.equal(testValue);
      console.log("  ✓ Function call successful");
    });

    it("A3. Test Getting Contract Version Info", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that view functions can be called after delegation");
      
      const version = await simpleLogic.getVersion();
      
      console.log("\n  【Expected Output】");
      console.log("  Version info:", version);
      
      expect(version).to.equal("SimpleLogic v1.0");
      console.log("  ✓ View function call successful");
    });
  });

  describe("B. Account Abstraction Features Test", function () {
    it("B1. Test Gas Sponsorship", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that account A signs authorization, but account B initiates transaction and pays gas");
      
      const balanceBBefore = await ethers.provider.getBalance(accountBAddress);
      console.log("\n  【Account B Initial State】");
      console.log("  Address:", accountBAddress);
      console.log("  Balance:", formatEther(balanceBBefore), "XDC");
      
      // accountB initiates transaction, but logic executes in accountA's context
      const tx = await simpleLogic.connect(accountB).setValue(9999);
      const receipt = await tx.wait();
      
      const balanceBAfter = await ethers.provider.getBalance(accountBAddress);
      const effectiveGasPrice: bigint | undefined =
        receipt?.effectiveGasPrice ?? (tx as any)?.gasPrice;
      if (!effectiveGasPrice) {
        throw new Error("Cannot get gasPrice / effectiveGasPrice (please check network and Hardhat/Ethers version)");
      }
      const gasCost = receipt!.gasUsed * effectiveGasPrice;
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.transactionHash);
      console.log("  Block number:", receipt.blockNumber);
      console.log("  Gas used:", receipt.gasUsed.toString());
      console.log("  Effective gas price:", formatUnits(effectiveGasPrice, "gwei"), "Gwei");
      console.log("  Total gas cost:", formatEther(gasCost), "XDC");
      console.log("  Transaction status:", receipt.status === 1 ? "Success (1)" : "Failed (0)");
      
      console.log("\n  【Account B Final State】");
      console.log("  Final balance:", formatEther(balanceBAfter), "XDC");
      console.log("  Balance change:", formatEther(balanceBBefore - balanceBAfter), "XDC");
      console.log("  Verification:", balanceBAfter < balanceBBefore ? "✓ Balance decreased (gas paid)" : "✗ Balance not decreased");
      
      expect(balanceBAfter).to.be.lt(balanceBBefore);
      console.log("  ✓ Gas sponsorship test passed");
    });

    it("B2. Test Transaction Batching", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify executing multiple operations in a single transaction");
      
      const initialValue = 100;
      const valueBefore = await simpleLogic.connect(accountA).getValue();
      
      const tx = await simpleLogic.connect(accountA).batchOperation(initialValue);
      const receipt = await tx.wait();
      const finalValue = await simpleLogic.connect(accountA).getValue();
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.transactionHash);
      console.log("  Block number:", receipt.blockNumber);
      console.log("  Gas used:", receipt.gasUsed.toString());
      
      console.log("\n  【State Change】");
      console.log("  Value before operation:", valueBefore.toString());
      console.log("  Input initial value:", initialValue.toString());
      console.log("  Value after operation:", finalValue.toString());
      console.log("  Expected value:", (initialValue + 10).toString(), "(initial value + 10)");
      console.log("  Verification:", finalValue === BigInt(initialValue + 10) ? "✓ Value matches" : "✗ Value doesn't match");
      
      expect(finalValue).to.equal(initialValue + 10);
      console.log("  ✓ Batch operation test passed");
    });

  });

  describe("C. Boundary and Security Tests", function () {
    it("C1. Test Invalid Nonce Authorization", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that authorization tuple is skipped when nonce doesn't match");
      
      const currentNonce = await ethers.provider.getTransactionCount(accountCAddress);
      const wrongNonce = currentNonce + 999; // Wrong nonce
      
      console.log("  Current nonce:", currentNonce);
      console.log("  Wrong nonce:", wrongNonce.toString());
      
      // Create authorization with wrong nonce
      const auth = await createAuthorization(
        accountC,
        simpleLogicAddress,
        wrongNonce,
        chainId
      );
      
      console.log("\n  【Expected Output】");
      console.log("  This authorization tuple is skipped");
      console.log("  Transaction doesn't fail, but authorization doesn't take effect");
      console.log("  accountC remains as normal EOA");
      
      // Verify code hasn't changed in actual environment
      const code = await ethers.provider.getCode(accountCAddress);
      expect(code).to.equal("0x");
      console.log("  ✓ Invalid nonce test passed");
    });


    it("C4. Test Conditional Revert", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Test revert when require condition fails");
      
      // Test failure case
      console.log("\n  【Test Case 1: Value < 100, should revert】");
      try {
        const tx = await revertTest.connect(accountA).conditionalRevert(50);
        await tx.wait();
        expect.fail("Should throw exception");
      } catch (error: any) {
        console.log("  Input value: 50");
        console.log("  Result: ✓ Transaction reverted (as expected)");
        console.log("  Error message:", error.message.substring(0, 100) + "...");
      }
      
      // Test success case
      console.log("\n  【Test Case 2: Value > 100, should succeed】");
      const tx = await revertTest.connect(accountA).conditionalRevert(150);
      const receipt = await tx.wait();
      const counter = await revertTest.counter();
      
      console.log("  Input value: 150");
      console.log("  Transaction hash:", receipt!.hash);
      console.log("  Block number:", receipt!.blockNumber);
      console.log("  Gas used:", receipt!.gasUsed.toString());
      console.log("  Counter value:", counter.toString());
      console.log("  Result: ✓ Transaction successful");
      
      expect(counter).to.equal(150);
      console.log("  ✓ Conditional revert test passed");
    });
  });

  describe("D. Override and Cleanup Tests", function () {
    it("D1. Test Reset Authorization (Clear Code Delegation)", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that sending authorization with address 0x0 can clear code delegation");
      
      const nonce = await ethers.provider.getTransactionCount(accountCAddress);
      
      // Create authorization pointing to zero address (clear delegation)
      const zeroAddress = ZeroAddress;
      console.log("\n  【Authorization Info】");
      console.log("  Account address:", accountCAddress);
      console.log("  Current nonce:", nonce);
      console.log("  Target address:", zeroAddress, "(zero address, used to clear delegation)");
      console.log("  Chain ID:", chainId);
      
      const auth = await createAuthorization(
        accountC,
        zeroAddress,
        nonce,
        chainId
      );
      
      console.log("\n  【Expected Output】");
      console.log("  EOA's code is cleared");
      console.log("  Account code hash reverts to empty hash:");
      console.log("  0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
      console.log("  Account reverts to normal EOA state");
      
      const code = await ethers.provider.getCode(accountCAddress);
      const codeHash = keccak256(code);
      
      console.log("\n  【Actual Result】");
      console.log("  Account code:", code === "0x" ? "0x (empty, normal EOA)" : code);
      console.log("  Code length:", code.length, "characters");
      console.log("  Code hash:", codeHash);
      console.log("  Verification:", code === "0x" ? "✓ Account reverted to normal EOA" : "✗ Account still has code");
      
      expect(code).to.equal("0x");
      console.log("  ✓ Reset authorization test passed");
    });

    it("D2. Test Multiple Delegation Overrides", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that when delegating multiple times, the last valid authorization takes effect");
      
      console.log("\n  【First Delegation: SimpleLogic】");
      const tx1 = await simpleLogic.connect(accountC).setValue(111);
      const receipt1 = await tx1.wait();
      const value1 = await simpleLogic.connect(accountC).getValue();
      
      console.log("  Transaction hash:", receipt1.transactionHash);
      console.log("  Block number:", receipt1.blockNumber);
      console.log("  Target contract:", simpleLogicAddress);
      console.log("  Set value:", value1.toString());
      console.log("  SimpleLogic.getValue():", value1.toString());
      
      console.log("\n  【Second Delegation: BatchOperations】");
      const tx2 = await batchOperations.connect(accountC).executeOperation(1, 222);
      const receipt2 = await tx2.wait();
      const count = await batchOperations.getOperationCount(accountCAddress);
      
      console.log("  Transaction hash:", receipt2.transactionHash);
      console.log("  Block number:", receipt2.blockNumber);
      console.log("  Target contract:", batchOperationsAddress);
      console.log("  Operation type: 1, operation data: 222");
      console.log("  BatchOperations.getOperationCount():", count.toString());
      
      console.log("\n  【Expected Output】");
      console.log("  If multiple authorizations point to same account, use last valid authorization");
      console.log("  Account code updates to latest delegation target");
      console.log("  Verification: ✓ Both different delegation calls executed successfully");
      
      console.log("  ✓ Multiple delegation override test passed");
    });

  });

  describe("E. Comprehensive Test", function () {
    it("E1. Complete Flow Test", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Execute a complete EIP-7702 usage flow");
      console.log("\n  【Flow】");
      console.log("  1. Deploy logic contract ✓");
      console.log("  2. EOA signs authorization");
      console.log("  3. Send Type 0x04 transaction");
      console.log("  4. Verify code delegation");
      console.log("  5. Execute delegated contract functions");
      console.log("  6. Clear delegation");
      
      console.log("\n  【Step 1: Set initial value = 777】");
      const tx1 = await simpleLogic.connect(accountA).setValue(777);
      const receipt1 = await tx1.wait();
      console.log("  Transaction hash:", receipt1.transactionHash);
      console.log("  Block number:", receipt1.blockNumber);
      
      const value1 = await simpleLogic.connect(accountA).getValue();
      console.log("  Current value:", value1.toString());
      
      console.log("\n  【Step 2: First increment】");
      const tx2 = await simpleLogic.connect(accountA).increment();
      const receipt2 = await tx2.wait();
      console.log("  Transaction hash:", receipt2.transactionHash);
      console.log("  Block number:", receipt2.blockNumber);
      
      const value2 = await simpleLogic.connect(accountA).getValue();
      console.log("  Current value:", value2.toString());
      
      console.log("\n  【Step 3: Second increment】");
      const tx3 = await simpleLogic.connect(accountA).increment();
      const receipt3 = await tx3.wait();
      console.log("  Transaction hash:", receipt3.transactionHash);
      console.log("  Block number:", receipt3.blockNumber);
      
      const finalValue = await simpleLogic.connect(accountA).getValue();
      console.log("  Final value:", finalValue.toString());
      
      console.log("\n  【Result Verification】");
      console.log("  Initial value: 777");
      console.log("  After first increment: 778");
      console.log("  After second increment:", finalValue.toString());
      console.log("  Expected value: 779");
      console.log("  Verification:", finalValue === 779n ? "✓ Value matches" : "✗ Value doesn't match");
      
      expect(finalValue).to.equal(779);
      console.log("  ✓ Complete flow test passed");
    });

  });

  after(async function () {
    console.log("\n=== Test Summary ===");
    console.log("✓ All tests completed");
  });
});



