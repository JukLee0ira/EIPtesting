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
  
  let chainId: bigint;

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
        ].join("\n")
      );
    }

    for (const r of recipients) {
      // Check if recipient already has sufficient balance
      const recipientBalance = await ethers.provider.getBalance(r.address);
      if (recipientBalance >= amountPerAccount) {
        console.log(`  [Fund Allocation] ${r.label} already has sufficient balance, skipping`);
        continue;
      }
      
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
   * Helper function: Create a funded wallet for testing
   * @param amount Amount in ETH to fund the wallet (default: 10)
   * @returns New wallet with funds
   */
  async function createFundedWallet(amount: string = "10"): Promise<Signer> {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    const walletAddress = await wallet.getAddress();
    
    // Fund from owner and wait for confirmation
    const tx = await owner.sendTransaction({
      to: walletAddress,
      value: parseEther(amount)
    });
    await tx.wait();  // Wait for transaction to be mined
    
    console.log(`  [New Wallet] Created: ${walletAddress}`);
    return wallet;
  }

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
    signer: Signer & { authorize?: Function },
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
    
    // Use Ethers.js v6's built-in authorize() method (recommended approach from QuickNode guide)
    if (typeof signer.authorize === 'function') {
      const auth = await signer.authorize({
        address: contractAddress,
        nonce: Number(authNonce),
      });
      console.log(`      ✓ Authorization created using signer.authorize() method`);
      return auth;
    } else {
      throw new Error("❌ Signer does not support authorize() method. Please ensure you are using Ethers.js v6 with a compatible Wallet.");
    }
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
      // Preferred path: let Ethers sign locally via signer.sendTransaction().
      // This works for both Hardhat-managed signers and dynamically created wallets,
      // and avoids HH103 ("Account is not managed by the node") when using eth_sendTransaction.
      try {
        const signerAddress = await signer.getAddress();
        const nonce = await ethers.provider.getTransactionCount(signerAddress);
        const feeData = await ethers.provider.getFeeData();
        
        const tx = await (signer as any).sendTransaction({
          to: eoaAddress,
          data: callData,
          nonce,
          gasLimit: 500000n,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 2_000_000_000n,
          maxFeePerGas: feeData.maxFeePerGas ?? 50_000_000_000n,
          type: 4,
          authorizationList: authList,
        });
        
        console.log("    ✓ EIP-7702 transaction sent (signed):", tx.hash);
        console.log("    Waiting for transaction confirmation...");
        const receipt = await tx.wait();
        if (!receipt) throw new Error("No receipt");
        console.log("    ✓ Transaction confirmed in block:", receipt.blockNumber);
        return receipt;
      } catch (signedSendError: any) {
        console.log("    Warning: signer.sendTransaction failed, falling back to eth_sendTransaction:", signedSendError.message);
      }

      // Format authorization list
      const formattedAuthList = authList.map(auth => {
        // Helper: Convert to hex string (canonical form, no unnecessary leading zeros)
        const toHex = (value: bigint | number): string => {
          const hex = BigInt(value).toString(16);
          // Return canonical hex representation
          // BigInt.toString(16) already removes leading zeros
          return '0x' + hex;
        };
        
        // Handle signer.authorize() response structure (signature is nested)
        const sig = auth.signature || auth;
        const yParity = sig.v === 27 ? 0 : (sig.v === 28 ? 1 : (auth.yParity ?? 0));
        const r = sig.r || auth.r;
        const s = sig.s || auth.s;
        
        // Convert v from yParity
        const v = yParity === 0 ? 27 : 28;
        
        return {
          chainId: toHex(auth.chainId),
          address: auth.address,
          nonce: toHex(auth.nonce),
          yParity: toHex(yParity),
          v: toHex(v),
          r: r,  // Already in hex string format from signer.authorize()
          s: s,  // Already in hex string format from signer.authorize()
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

  /**
   * Helper: Ensure an EOA is delegated to a specific implementation contract.
   * This makes tests independent when running individually on persistent networks (e.g. myNet).
   *
   * Strategy:
   * - If code already matches 0xef0100 + impl address: do nothing
   * - Otherwise: send a delegation-only type0x04 tx (empty calldata) to update code
   */
  async function ensureDelegation(
    eoaSigner: Signer & { authorize?: Function },
    eoaAddress: string,
    implementationAddress: string,
    label: string
  ) {
    const expectedCode = ("0xef0100" + implementationAddress.slice(2)).toLowerCase();
    const currentCode = (await ethers.provider.getCode(eoaAddress)).toLowerCase();

    console.log(`\n  【Ensure Delegation】 ${label}`);
    console.log("  EOA:", eoaAddress);
    console.log("  Target implementation:", implementationAddress);
    console.log("  Current code:", currentCode);
    console.log("  Expected code:", expectedCode);

    if (currentCode === expectedCode) {
      console.log("  ✓ Delegation already set");
      return;
    }

    console.log("  Delegation missing or different → setting delegation (delegation-only type0x04)");
    const auth = await createAuthorization(eoaSigner, implementationAddress, false);
    await sendType4Transaction(eoaSigner, eoaAddress, "0x", [auth]);

    const codeAfter = (await ethers.provider.getCode(eoaAddress)).toLowerCase();
    console.log("  Code after:", codeAfter);
    expect(codeAfter).to.equal(expectedCode);
    console.log("  ✓ Delegation ensured");
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
      // IMPORTANT: Read from the EOA address, not the original contract!
      // EIP-7702: EOA uses contract code but has its own storage
      const delegatedContract = simpleLogic.attach(accountAAddress) as SimpleLogic;
      const value = await delegatedContract.getValue();
      console.log("\n  【Verification】");
      console.log("  Value set via delegated EOA:", value.toString());
      expect(value).to.equal(12345);
      
      console.log("\n  ✓ EIP-7702 delegation verified successfully!");
    });

    it("A2. Test Calling Functions Through Delegated EOA", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that delegated EOA can successfully execute target contract functions");

      // Make this test runnable independently (without requiring A1 to run first)
      await ensureDelegation(accountA as any, accountAAddress, simpleLogicAddress, "accountA -> SimpleLogic");
      
      // CRITICAL: Call through EOA address, not contract address
      // This tests EIP-7702 delegation - if network doesn't support it, this will fail
      const delegatedContract = simpleLogic.attach(accountAAddress) as SimpleLogic;
      
      const testValue = 12345;
      const tx = await delegatedContract.connect(accountA).setValue(testValue);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.hash);
      console.log("  Block number:", receipt.blockNumber);
      console.log("  Gas used:", receipt.gasUsed.toString());
      console.log("  Sender address:", receipt.from);
      console.log("  Contract address:", receipt.to);
      console.log("  Transaction status:", receipt.status === 1 ? "Success (1)" : "Failed (0)");
      
      const value = await delegatedContract.getValue();
      
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

      // Make this test runnable independently (without requiring A1/A2 to run first)
      await ensureDelegation(accountA as any, accountAAddress, simpleLogicAddress, "accountA -> SimpleLogic");
      
      // CRITICAL: Call through EOA address to test EIP-7702 delegation
      const delegatedContract = simpleLogic.attach(accountAAddress) as SimpleLogic;
      const version = await delegatedContract.getVersion();
      
      console.log("\n  【Expected Output】");
      console.log("  Version info:", version);
      
      expect(version).to.equal("SimpleLogic v1.0");
      console.log("  ✓ View function call successful");
    });
  });

  describe("B. Account Abstraction Features Test", function () {
    it("B1. Test Gas Sponsorship", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify that delegator signs authorization, but sponsor initiates transaction and pays gas");
      
      // accountC = delegator (signs authorization)
      // owner = sponsor (pays gas, doesn't interfere with test accounts)
      
      console.log("\n  【Test Setup】");
      console.log("  Delegator: accountC -", accountCAddress);
      console.log("  Sponsor: owner -", ownerAddress);
      
      // accountC signs authorization
      const auth = await createAuthorization(
        accountC,
        simpleLogicAddress,
        true  // Sponsored transaction
      );
      
      // Send Type 0x04 transaction - owner pays gas, accountC gets delegation
      const setValueData = simpleLogic.interface.encodeFunctionData("setValue", [9999]);
      await sendType4Transaction(
        owner,  // Sponsor sends the transaction
        accountCAddress,  // Target is accountC's EOA
        setValueData,
        [auth]
      );
      
      console.log("  ✓ Delegation established with owner paying gas");
      
      // Get sponsor's balance before second transaction
      const balanceSponsorBefore = await ethers.provider.getBalance(ownerAddress);
      console.log("\n  【Sponsor (owner) Initial State】");
      console.log("  Address:", ownerAddress);
      console.log("  Balance:", formatEther(balanceSponsorBefore), "XDC");
      
      // Now sponsor calls function through delegator's EOA (sponsor pays gas again)
      const delegatedContract = simpleLogic.attach(accountCAddress) as SimpleLogic;
      const tx = await delegatedContract.connect(owner).setValue(8888);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      
      const balanceSponsorAfter = await ethers.provider.getBalance(ownerAddress);
      const effectiveGasPrice: bigint | undefined =
        (receipt as any).effectiveGasPrice ?? (receipt as any).gasPrice ?? (tx as any)?.gasPrice;
      if (!effectiveGasPrice) {
        throw new Error("Cannot get gasPrice / effectiveGasPrice (please check network and Hardhat/Ethers version)");
      }
      const gasCost = receipt.gasUsed * effectiveGasPrice;
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.hash);
      console.log("  Block number:", receipt.blockNumber);
      console.log("  Gas used:", receipt.gasUsed.toString());
      console.log("  Effective gas price:", formatUnits(effectiveGasPrice, "gwei"), "Gwei");
      console.log("  Total gas cost:", formatEther(gasCost), "XDC");
      console.log("  Transaction status:", receipt.status === 1 ? "Success (1)" : "Failed (0)");
      
      console.log("\n  【Sponsor (owner) Final State】");
      console.log("  Final balance:", formatEther(balanceSponsorAfter), "XDC");
      console.log("  Balance change:", formatEther(balanceSponsorBefore - balanceSponsorAfter), "XDC");
      console.log("  Verification:", balanceSponsorAfter < balanceSponsorBefore ? "✓ Balance decreased (gas paid)" : "✗ Balance not decreased");
      
      // Verify value was set correctly in accountC's storage
      const finalValue = await delegatedContract.getValue();
      console.log("  Final value in accountC's storage:", finalValue.toString());
      
      expect(balanceSponsorAfter).to.be.lt(balanceSponsorBefore);
      expect(finalValue).to.equal(8888);
      console.log("  ✓ Gas sponsorship test passed");
    });

    it("B2. Test Transaction Batching", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Verify executing multiple operations in a single transaction");
      
      // Use accountC for this test. Ensure delegation so B2 can run independently (without requiring B1).
      console.log("\n  【Using accountC】");
      console.log("  Account:", accountCAddress);

      await ensureDelegation(accountC as any, accountCAddress, simpleLogicAddress, "accountC -> SimpleLogic");
      
      // CRITICAL: Call through EOA address to test EIP-7702 delegation
      const delegatedContract = simpleLogic.attach(accountCAddress) as SimpleLogic;
      
      const initialValue = 100;
      const valueBefore = await delegatedContract.getValue();
      
      console.log("  Value before operation:", valueBefore.toString());
      
      const tx = await delegatedContract.connect(accountC).batchOperation(initialValue);
      const receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      const finalValue = await delegatedContract.getValue();
      
      console.log("\n  【Transaction Details】");
      console.log("  Transaction hash:", receipt.hash);
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
      
      // Note: accountC was used in B1 for gas sponsorship test
      // After B1, accountC should have delegation to SimpleLogic
      // But for this test, we'll try to set an authorization with wrong nonce
      
      const currentNonce = await ethers.provider.getTransactionCount(accountCAddress);
      const wrongNonce = currentNonce + 999; // Wrong nonce
      
      console.log("  Current nonce:", currentNonce);
      console.log("  Wrong nonce:", wrongNonce.toString());
      console.log("  Test account: accountC -", accountCAddress);
      
      // Manually create an authorization with wrong nonce (bypassing the helper)
      // The helper would use currentNonce, but we want to test with wrong nonce
      const auth = await (accountC as any).authorize({
        address: batchOperationsAddress,  // Try to delegate to different contract
        nonce: Number(wrongNonce),
      });
      
      console.log("    Creating authorization:");
      console.log("      EOA:", accountCAddress);
      console.log("      Contract:", batchOperationsAddress);
      console.log("      Current nonce:", currentNonce, ", Auth nonce:", wrongNonce);
      console.log("      ✓ Authorization created using signer.authorize() method");
      
      // Get code before attempting delegation
      const codeBefore = await ethers.provider.getCode(accountCAddress);
      console.log("  Code before:", codeBefore);
      
      // Try to send transaction with wrong nonce authorization
      // According to EIP-7702, invalid nonce should be skipped silently
      try {
        const executeOpData = batchOperations.interface.encodeFunctionData("executeOperation", [1, 999]);
        await sendType4Transaction(
          accountC,
          accountCAddress,
          executeOpData,
          [auth]
        );
      } catch (error: any) {
        console.log("  Transaction may fail or succeed (depends on network implementation)");
      }
      
      console.log("\n  【Expected Output】");
      console.log("  This authorization tuple is skipped");
      console.log("  Transaction doesn't fail, but authorization doesn't take effect");
      console.log("  accountC's delegation should remain unchanged");
      
      // Verify code hasn't changed
      const codeAfter = await ethers.provider.getCode(accountCAddress);
      console.log("  Code after:", codeAfter);
      console.log("  Verification:", codeBefore === codeAfter ? "✓ Code unchanged" : "✗ Code changed");
      
      expect(codeAfter).to.equal(codeBefore);
      console.log("  ✓ Invalid nonce test passed");
    });


    it("C4. Test Conditional Revert", async function () {
      console.log("\n  【Test Purpose】");
      console.log("  Test revert when require condition fails");
      
      // Use accountB for this test (not previously delegated)
      // This avoids conflicts with accountA's existing delegation to SimpleLogic
      console.log("\n  【Delegating accountB to RevertTest】");
      const auth = await createAuthorization(
        accountB,
        revertTestAddress,
        false  // Not sponsored
      );
      
      // Initialize with successfulOperation(0)
      const initData = revertTest.interface.encodeFunctionData("successfulOperation", [0]);
      const delegateReceipt = await sendType4Transaction(
        accountB,
        accountBAddress,
        initData,
        [auth]
      );
      
      console.log("  ✓ AccountB delegated to RevertTest");
      
      // Now use accountB's EOA to call revertTest functions
      const delegatedRevertTest = revertTest.attach(accountBAddress) as RevertTest;
      
      // Test failure case
      console.log("\n  【Test Case 1: Value < 100, should revert】");
      try {
        const tx = await delegatedRevertTest.connect(accountB).conditionalRevert(50);
        await tx.wait();
        expect.fail("Should throw exception");
      } catch (error: any) {
        console.log("  Input value: 50");
        console.log("  Result: ✓ Transaction reverted (as expected)");
        console.log("  Error message:", error.message.substring(0, 100) + "...");
      }
      
      // Test success case
      console.log("\n  【Test Case 2: Value > 100, should succeed】");
      const tx = await delegatedRevertTest.connect(accountB).conditionalRevert(150);
      const receipt = await tx.wait();
      const counter = await delegatedRevertTest.counter();
      
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
      
      // Use accountC for this test (should already have delegation from B1)
      console.log("\n  【Using accountC】");
      console.log("  Account:", accountCAddress);
      
      // Check current delegation state
      const codeBefore = await ethers.provider.getCode(accountCAddress);
      console.log("  Current code:", codeBefore);
      
      if (codeBefore === "0x") {
        // If no delegation, set it up first
        console.log("\n  【Step 1: Set up initial delegation】");
        const auth1 = await createAuthorization(
          accountC,
          simpleLogicAddress,
          false
        );
        
        const setValueData = simpleLogic.interface.encodeFunctionData("setValue", [123]);
        await sendType4Transaction(
          accountC,
          accountCAddress,
          setValueData,
          [auth1]
        );
        
        const codeAfterDelegation = await ethers.provider.getCode(accountCAddress);
        console.log("  Code after delegation:", codeAfterDelegation);
        console.log("  ✓ Delegation established");
      } else {
        console.log("  ✓ accountC already has delegation");
      }
      
      // Now clear the delegation
      console.log("\n  【Step 2: Clear delegation with zero address】");
      const zeroAddress = ZeroAddress;
      const nonce = await ethers.provider.getTransactionCount(accountCAddress);
      
      console.log("  Account address:", accountCAddress);
      console.log("  Current nonce:", nonce);
      console.log("  Target address:", zeroAddress, "(zero address, used to clear delegation)");
      console.log("  Chain ID:", chainId);
      
      const auth2 = await createAuthorization(
        accountC,
        zeroAddress,
        false  // Not sponsored
      );
      
      // Send Type 0x04 transaction with zero address to clear delegation
      await sendType4Transaction(
        accountC,
        accountCAddress,
        "0x",  // Empty data is fine for zero address
        [auth2]
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
      
      // IMPORTANT: Make this test independent from previous tests.
      // Use a fresh funded EOA so we don't rely on accountB's prior delegation state (e.g. from C4).
      console.log("\n  【Using fresh funded EOA】");
      const freshEOA = await createFundedWallet("2"); // 2 ETH is plenty for a few txs
      const freshEOAAddress = await freshEOA.getAddress();
      console.log("  Account:", freshEOAAddress);
      
      // Check current state
      const codeBefore = await ethers.provider.getCode(freshEOAAddress);
      console.log("  Current code:", codeBefore);
      
      // Strategy: Delegate twice in separate transactions to test override
      // Also use a two-step approach for each delegation:
      // 1) send a delegation-only type0x04 tx (empty calldata) to update code
      // 2) send a normal call tx through the newly delegated EOA
      console.log("\n  【First Delegation: SimpleLogic】");
      
      const auth1 = await createAuthorization(
        freshEOA as any,
        simpleLogicAddress,
        false
      );
      
      // Step 1: delegation-only tx (no calldata)
      const receipt1 = await sendType4Transaction(
        freshEOA,
        freshEOAAddress,
        "0x",
        [auth1]
      );
      
      // Verify first delegation
      const code1 = await ethers.provider.getCode(freshEOAAddress);
      const expectedCode1 = "0xef0100" + simpleLogicAddress.slice(2).toLowerCase();
      console.log("  EOA code after first delegation:", code1.toLowerCase());
      console.log("  Expected code:", expectedCode1);
      console.log("  First delegation verified:", code1.toLowerCase() === expectedCode1 ? "✓" : "✗");
      
      // Step 2: call through newly delegated EOA using a normal transaction
      const delegatedSimpleLogic = simpleLogic.attach(freshEOAAddress) as SimpleLogic;
      const txSet = await delegatedSimpleLogic.connect(freshEOA as any).setValue(111);
      const receiptSet = await txSet.wait();
      if (!receiptSet) throw new Error("No receipt for setValue");
      const value1 = await delegatedSimpleLogic.getValue();
      
      console.log("  Transaction hash:", receipt1.hash);
      console.log("  Block number:", receipt1.blockNumber);
      console.log("  Target contract:", simpleLogicAddress);
      console.log("  setValue tx hash:", receiptSet.hash);
      console.log("  setValue block number:", receiptSet.blockNumber);
      console.log("  Set value:", value1.toString());
      
      console.log("\n  【Second Delegation: BatchOperations (Override)】");
      
      // Second delegation to BatchOperations (should override SimpleLogic)
      const auth2 = await createAuthorization(
        freshEOA as any,
        batchOperationsAddress,
        false  
      );

      // IMPORTANT: Do NOT try to call BatchOperations function in the SAME tx that changes delegation.
      // Depending on client semantics, calldata may be handled before the delegation takes effect.
      // So we first send a "delegation-only" tx (empty data) to update code, then send a normal call.
      const receipt2 = await sendType4Transaction(
        freshEOA,
        freshEOAAddress,
        "0x",
        [auth2]
      );
      
      // Verify second delegation points to BatchOperations (not SimpleLogic)
      const code2 = await ethers.provider.getCode(freshEOAAddress);
      const expectedCode2 = "0xef0100" + batchOperationsAddress.slice(2).toLowerCase();
      console.log("  EOA code after second delegation:", code2.toLowerCase());
      console.log("  Expected code (BatchOperations):", expectedCode2);
      console.log("  Second delegation verified:", code2.toLowerCase() === expectedCode2 ? "✓" : "✗");
      
      // Now call executeOperation through the newly delegated EOA
      const delegatedBatchOps = batchOperations.attach(freshEOAAddress) as BatchOperations;
      const txOp = await delegatedBatchOps.connect(freshEOA as any).executeOperation(1, 222);
      const receiptOp = await txOp.wait();
      if (!receiptOp) throw new Error("No receipt for executeOperation");
      const count = await delegatedBatchOps.getOperationCount(freshEOAAddress);
      
      console.log("  Transaction hash:", receipt2.hash);
      console.log("  Block number:", receipt2.blockNumber);
      console.log("  Target contract:", batchOperationsAddress);
      console.log("  executeOperation tx hash:", receiptOp.hash);
      console.log("  executeOperation block number:", receiptOp.blockNumber);
      console.log("  Operation type: 1, operation data: 222");
      console.log("  BatchOperations.getOperationCount():", count.toString());
      
      console.log("\n  【Expected Output】");
      console.log("  When delegating multiple times, the last valid authorization takes effect");
      console.log("  Account code updates from SimpleLogic to BatchOperations");
      console.log("  Verification: ✓ Second delegation (BatchOperations) overrode the first");
      
      // Verify the final delegation is to BatchOperations
      expect(code2.toLowerCase()).to.equal(expectedCode2);
      expect(code1.toLowerCase()).to.equal(expectedCode1);
      expect(value1).to.equal(111);
      expect(count).to.be.gt(0);
      
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
      
      // Use accountA for complete flow test. Ensure delegation so E1 can run independently.
      console.log("\n  【Using accountA】");
      console.log("  Account:", accountAAddress);
      await ensureDelegation(accountA as any, accountAAddress, simpleLogicAddress, "accountA -> SimpleLogic");
      
      // CRITICAL: Call through EOA address to test EIP-7702 delegation
      const delegatedContract = simpleLogic.attach(accountAAddress) as SimpleLogic;
      
      console.log("\n  【Step 1: Set initial value = 777】");
      const tx1 = await delegatedContract.connect(accountA).setValue(777);
      const receipt1 = await tx1.wait();
      if (!receipt1) throw new Error("No receipt");
      console.log("  Transaction hash:", receipt1.hash);
      console.log("  Block number:", receipt1.blockNumber);
      
      const value1 = await delegatedContract.getValue();
      console.log("  Current value:", value1.toString());
      
      console.log("\n  【Step 2: First increment】");
      const tx2 = await delegatedContract.connect(accountA).increment();
      const receipt2 = await tx2.wait();
      if (!receipt2) throw new Error("No receipt");
      console.log("  Transaction hash:", receipt2.hash);
      console.log("  Block number:", receipt2.blockNumber);
      
      const value2 = await delegatedContract.getValue();
      console.log("  Current value:", value2.toString());
      
      console.log("\n  【Step 3: Second increment】");
      const tx3 = await delegatedContract.connect(accountA).increment();
      const receipt3 = await tx3.wait();
      if (!receipt3) throw new Error("No receipt");
      console.log("  Transaction hash:", receipt3.hash);
      console.log("  Block number:", receipt3.blockNumber);
      
      const finalValue = await delegatedContract.getValue();
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



