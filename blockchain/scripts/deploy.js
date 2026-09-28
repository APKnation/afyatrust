// Deploy AfyaTrust to Sepolia with Hardhat.
// Usage: npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("Deploying AfyaTrust to Sepolia...");

  const AfyaTrust = await hre.ethers.getContractFactory("AfyaTrust");
  const afyaTrust = await AfyaTrust.deploy();
  await afyaTrust.waitForDeployment();

  const address = await afyaTrust.getAddress();
  console.log("\nAfyaTrust deployed to:", address);
  console.log("View on Etherscan: https://sepolia.etherscan.io/address/" + address);

  // Save the address for the backend .env
  fs.writeFileSync(
    "./contract-address.txt",
    `CONTRACT_ADDRESS=${address}\n`
  );
  console.log("\nSaved to contract-address.txt. Add it to backend/.env:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
