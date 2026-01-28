
## Project Overview

This project is a systematic Ethereum Improvement Proposal (EIP) testing framework designed to verify and demonstrate the implementation of various EIP features. Built with Hardhat + Ethers.js, it provides complete test cases and documentation.

---

## Quick Start

### 1. Environment Setup

**Prerequisites:**
- Node.js >= 16.x
- npm or yarn
- Ethereum node supporting the respective EIP (private network or testnet)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example configuration file and modify:

```bash
cp example.env .env
```

Edit the `.env` file:

```bash
# RPC node address
RPC_URL=http://127.0.0.1:8545

# Test account private keys (comma-separated, at least 4)
PRIVATE_KEYS=key1,key2,key3,key4
```

### 4. Compile Contracts

```bash
npx hardhat compile
```

### 5. Run Tests

Run all tests
```bash
npx hardhat test
```

Run specific EIP tests
```bash
npx hardhat test test/eip7702.test.ts
```

---

## Project Structure

```
EIPtesting/
├── contracts/              # Contract source code
│   ├── eip7702/           # EIP-7702 test contracts
│   └── ...                # Other EIP contracts (to be added)
├── test/                  # Test files
│   ├── eip7702.test.ts   # EIP-7702 test suite
│   └── ...                # Other EIP tests (to be added)
├── docs/                  # Documentation directory
│   ├── eip7702/          # EIP-7702 documentation and test reports
│   └── ...                # Other EIP docs (to be added)
├── scripts/               # Deployment and utility scripts
├── example.env            # Environment variable example
├── hardhat.config.ts      # Hardhat configuration
├── package.json           # Project dependencies
└── README.md              # This document
```


---

## Implemented EIP Tests

### ✅ EIP-7702: Set EOA Account Code

**Status**: Completed  
**Network Requirements**: Prague fork enabled (Chain ID 20986 or custom devnet)

**Documentation**:
- [Test Guide](docs/eip7702/EIP7702_README.md)
- Test Reports: 
  - [Private Network Report (ZH)](docs/eip7702/EIP7702_Test_Report(Private_Net)_ZH.md)
  - [Private Network Report (EN)](docs/eip7702/EIP7702_Test_Report_EN.md)

**Test Coverage**:
- ✓ Core functionality: Code delegation setup and function calls
- ✓ Account abstraction: Gas sponsorship, transaction batching
- ✓ Boundary tests: Invalid nonce, conditional revert
- ✓ Delegation management: Reset authorization, multiple overrides
- ✓ Comprehensive test: Complete flow verification

**Test Files**: 
- Contracts: `contracts/eip7702/`
- Tests: `test/eip7702.test.ts`
- Test Count: 10

**Network Validation**: 
- ✅ Tests **verify EIP-7702 features** by checking EOA code delegation (`0xef0100` + address)
- ✅ Attempts to send Type 0x04 transactions with authorization_list
- ❌ Will **fail naturally** on networks without EIP-7702 support
- ⚠️  Currently fails on all tested networks (including myNet) - indicates nodes may not have EIP-7702 enabled
- 📝 To pass tests, network must:
  - Support Type 0x04 transactions
  - Process authorization_list and set EOA code to delegation marker
  - Have Prague fork activated with EIP-7702 implementation


