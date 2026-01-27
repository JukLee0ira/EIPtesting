import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// Allow configuring multiple accounts at once: PRIVATE_KEYS=key1,key2,key3,key4
const PRIVATE_KEYS = (process.env.PRIVATE_KEYS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const accounts = Array.from(
  new Set([
    ...(PRIVATE_KEY ? [PRIVATE_KEY] : []),
    ...PRIVATE_KEYS,
  ])
);

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
    ],
  },
  networks: {
    myNet: {
      // Note: If RPC_URL is not set, this will be an empty string; Hardhat will report connection error when using --network myNet
      url: RPC_URL ?? "",
      // Note: If only 1 private key is configured, ethers.getSigners() will also only have 1 signer
      accounts,
    },
    hardhat: {
      chainId: 20986,
      gas: "auto",
      gasPrice: "auto",
      mining: {
        auto: true,
        interval: 0,
      },
    },
    devnet: {
      url: "https://devnetstats.hashlabs.apothem.network/devnet",
      accounts,
      timeout: 60000,
      gasPrice: 300000000000,
      gas: 2100000,
      chainId: 551,
    },
    // XDC Apothem testnet
    apothem: {
      url: "https://erpc.apothem.network/",
      accounts,
      chainId: 51,
      timeout: 60000,
    },
    // XDC mainnet
    xdc: {
      url: "https://rpc.ankr.com/xdc",
      accounts,
      chainId: 50,
      timeout: 60000,
    },
  },
  mocha: {
    timeout: 100000,
  },
};

export default config;
