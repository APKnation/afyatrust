// Grant CLINICIAN_ROLE to one approved doctor's wallet on the backend contract.
// Usage: npx hardhat run scripts/grant-clinician-role.js --network sepolia -- 0xDoctorWallet
const hre = require("hardhat");
const { readBackendEnv } = require("./facility-role");

async function main() {
  const doctorAddress = process.argv.at(-1);
  if (!hre.ethers.isAddress(doctorAddress || "")) {
    throw new Error("Pass the approved doctor's wallet address as the final argument.");
  }

  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Expected Sepolia (chain ID 11155111), got ${network.chainId}`);
  }

  const backendEnv = readBackendEnv();
  const address = (backendEnv.CONTRACT_ADDRESS || "").trim();
  if (!hre.ethers.isAddress(address)) {
    throw new Error("CONTRACT_ADDRESS in backend/.env is missing or invalid.");
  }
  if ((await hre.ethers.provider.getCode(address)) === "0x") {
    throw new Error("No contract is deployed at CONTRACT_ADDRESS in backend/.env.");
  }

  const [admin] = await hre.ethers.getSigners();
  const trust = await hre.ethers.getContractAt("AfyaTrust", address);
  const adminRole = hre.ethers.id("ADMIN_ROLE");
  const clinicianRole = hre.ethers.id("CLINICIAN_ROLE");
  if (!(await trust.hasRole(admin.address, adminRole))) {
    throw new Error("The configured Hardhat signer is not an admin on this contract.");
  }
  if (await trust.hasRole(doctorAddress, clinicianRole)) {
    console.log("Doctor wallet already has CLINICIAN_ROLE.");
    return;
  }

  console.log(`Granting CLINICIAN_ROLE to approved doctor ${doctorAddress}...`);
  const tx = await trust.grantRole(doctorAddress, clinicianRole);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("CLINICIAN_ROLE grant transaction did not succeed.");
  }
  if (!(await trust.hasRole(doctorAddress, clinicianRole))) {
    throw new Error("Transaction succeeded but CLINICIAN_ROLE verification failed.");
  }
  console.log(`CLINICIAN_ROLE granted. Transaction: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exitCode = 1;
});
