const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const BACKEND_ENV = path.resolve(__dirname, "../../backend/.env");

function readBackendEnv() {
  if (!fs.existsSync(BACKEND_ENV)) {
    throw new Error(`Backend environment file not found: ${BACKEND_ENV}`);
  }
  return dotenv.parse(fs.readFileSync(BACKEND_ENV));
}

function getFacilityAddress(ethers, backendEnv) {
  const privateKey = (backendEnv.FACILITY_PRIVATE_KEY || "").trim();
  if (!privateKey) {
    throw new Error("FACILITY_PRIVATE_KEY is missing from backend/.env");
  }
  const normalizedKey = privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;
  return new ethers.Wallet(normalizedKey).address;
}

async function ensureFacilityRole(hre, contract, facilityAddress) {
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Expected Sepolia (chain ID 11155111), got ${network.chainId}`);
  }

  const facilityRole = hre.ethers.id("FACILITY_ROLE");
  if (await contract.hasRole(facilityAddress, facilityRole)) {
    console.log("Backend facility wallet already has FACILITY_ROLE.");
    return;
  }

  const [admin] = await hre.ethers.getSigners();
  const adminRole = hre.ethers.id("ADMIN_ROLE");
  if (!(await contract.hasRole(admin.address, adminRole))) {
    throw new Error(
      "The configured Hardhat signer is not an admin on this contract; no role was granted."
    );
  }

  console.log("Granting FACILITY_ROLE to the backend facility wallet...");
  const tx = await contract.grantRole(facilityAddress, facilityRole);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("FACILITY_ROLE grant transaction did not succeed.");
  }
  if (!(await contract.hasRole(facilityAddress, facilityRole))) {
    throw new Error("Transaction succeeded but FACILITY_ROLE verification failed.");
  }
  console.log(`FACILITY_ROLE granted. Transaction: ${tx.hash}`);
}

module.exports = { ensureFacilityRole, getFacilityAddress, readBackendEnv };
