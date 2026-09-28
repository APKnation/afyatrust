require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Sepolia network config reads RPC + deployer key from .env.
// Accepts the key with or without the 0x prefix.
const deployerKey = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
const normalizedKey =
  deployerKey && !deployerKey.startsWith("0x") ? "0x" + deployerKey : deployerKey;

module.exports = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: (process.env.SEPOLIA_RPC_URL || "").trim(),
      accounts: normalizedKey ? [normalizedKey] : [],
    },
  },
};
