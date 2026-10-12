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

async function ensureBackendRoles(hre, contract, backendAddress) {
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Expected Sepolia (chain ID 11155111), got ${network.chainId}`);
  }

  const roles = ["FACILITY_ROLE", "OPERATOR_ROLE"];
  const missingRoles = [];
  for (const roleName of roles) {
    const role = hre.ethers.id(roleName);
    if (!(await contract.hasRole(backendAddress, role))) {
      missingRoles.push({ name: roleName, id: role });
    }
  }
  if (missingRoles.length === 0) {
    console.log("Backend wallet already has FACILITY_ROLE and OPERATOR_ROLE.");
    return;
  }

  const [admin] = await hre.ethers.getSigners();
  const adminRole = hre.ethers.id("ADMIN_ROLE");
  if (!(await contract.hasRole(admin.address, adminRole))) {
    throw new Error(
      "The configured Hardhat signer is not an admin on this contract; no role was granted."
    );
  }

  for (const role of missingRoles) {
    console.log(`Granting ${role.name} to the backend wallet...`);
    const tx = await contract.grantRole(backendAddress, role.id);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error(`${role.name} grant transaction did not succeed.`);
    }
    if (!(await contract.hasRole(backendAddress, role.id))) {
      throw new Error(`${role.name} grant verification failed.`);
    }
    console.log(`${role.name} granted. Transaction: ${tx.hash}`);
  }
}

module.exports = { ensureBackendRoles, getFacilityAddress, readBackendEnv };
