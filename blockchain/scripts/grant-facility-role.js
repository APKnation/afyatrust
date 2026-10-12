// Grant the backend wallet record-operation and emergency-operator roles on
// the current backend contract.
// Usage: npx hardhat run scripts/grant-facility-role.js --network sepolia
const hre = require("hardhat");
const {
  ensureBackendRoles,
  getFacilityAddress,
  readBackendEnv,
} = require("./facility-role");

async function main() {
  const backendEnv = readBackendEnv();
  const address = (backendEnv.CONTRACT_ADDRESS || "").trim();
  if (!hre.ethers.isAddress(address)) {
    throw new Error("CONTRACT_ADDRESS in backend/.env is missing or invalid.");
  }

  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error("No contract is deployed at CONTRACT_ADDRESS in backend/.env.");
  }

  const facilityAddress = getFacilityAddress(hre.ethers, backendEnv);
  const contract = await hre.ethers.getContractAt("AfyaTrust", address);
  console.log(`Configuring the backend facility wallet on ${address}...`);
  await ensureBackendRoles(hre, contract, facilityAddress);
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exitCode = 1;
});
