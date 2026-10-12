// Deploy AfyaTrust to Sepolia with Hardhat.
// Usage: npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");
const {
  ensureBackendRoles,
  getFacilityAddress,
  readBackendEnv,
} = require("./facility-role");

async function main() {
  console.log("Deploying AfyaTrust to Sepolia...");

  const AfyaTrust = await hre.ethers.getContractFactory("AfyaTrust");
  const afyaTrust = await AfyaTrust.deploy();
  await afyaTrust.waitForDeployment();

  const address = await afyaTrust.getAddress();
  console.log("\nAfyaTrust deployed to:", address);
  console.log("View on Etherscan: https://sepolia.etherscan.io/address/" + address);

  // Save the address before role setup so a partial deployment remains discoverable.
  fs.writeFileSync(
    "./contract-address.txt",
    `CONTRACT_ADDRESS=${address}\n`
  );
  console.log("\nSaved to contract-address.txt. Update backend/.env:");
  console.log(`CONTRACT_ADDRESS=${address}`);

  const backendEnv = readBackendEnv();
  const facilityAddress = getFacilityAddress(hre.ethers, backendEnv);
  await ensureBackendRoles(hre, afyaTrust, facilityAddress);

  if (
    backendEnv.CONTRACT_ADDRESS &&
    backendEnv.CONTRACT_ADDRESS.toLowerCase() !== address.toLowerCase()
  ) {
    console.log(
      "\n⚠️  backend/.env still points to a different deployment. Update it to the address above."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
