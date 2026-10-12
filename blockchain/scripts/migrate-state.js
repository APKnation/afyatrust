// Re-register existing PoC state onto a freshly deployed AfyaTrust contract.
// A new deployment starts empty; this copies over the patients, active
// permission grants and record pointers that live in the backend database.
//
// Usage:
//   STATE_FILE=/tmp/afya_state.json npx hardhat run scripts/migrate-state.js --network sepolia
//
// (Hardhat rejects extra positional args, so the path travels via STATE_FILE;
// argv[2] still works when the script is executed directly.)
//
// state.json shape (exported from the backend, see README):
//   { patients: [{patient_ref, wallet}],
//     grants:   [{patient_ref, patient_wallet, doctor_wallet, expires_at}],
//     records:  [{patient_ref, hash, facility_id}] }
const hre = require("hardhat");
const fs = require("fs");
const { readBackendEnv } = require("./facility-role");

const STATE_FILE = process.env.STATE_FILE || process.argv[2] || "/tmp/afya_state.json";

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  validateState(state);
  const raw = fs.readFileSync("./contract-address.txt", "utf8");
  const match = raw.match(/CONTRACT_ADDRESS=(0x[0-9a-fA-F]+)/);
  if (!match) throw new Error("contract-address.txt has no valid CONTRACT_ADDRESS");
  const address = match[1];

  const backendEnv = readBackendEnv();
  const privateKey = (backendEnv.FACILITY_PRIVATE_KEY || "").trim();
  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const facilityWallet = new hre.ethers.Wallet(normalizedKey, hre.ethers.provider);
  const deployed = await hre.ethers.getContractAt("AfyaTrust", address);
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 11155111n) {
    throw new Error(`Expected Sepolia (chain ID 11155111), got ${network.chainId}`);
  }
  if (!(await deployed.hasRole(facilityWallet.address, await deployed.FACILITY_ROLE()))) {
    throw new Error("Facility wallet lacks FACILITY_ROLE on the new contract");
  }
  if (!(await deployed.hasRole(facilityWallet.address, await deployed.OPERATOR_ROLE()))) {
    throw new Error("Facility wallet lacks OPERATOR_ROLE on the new contract");
  }
  const trust = deployed.connect(facilityWallet);
  console.log("Migrating state onto", address);
  console.log("Migration signer:", facilityWallet.address, "\n");

  let ok = 0;
  let failed = 0;

  for (const p of state.patients || []) {
    try {
      const registered = await trust.getPatient(p.patient_ref);
      if (registered.exists) {
        if (registered.wallet.toLowerCase() !== p.wallet.toLowerCase()) {
          throw new Error("patient reference is registered to a different wallet");
        }
        console.log(`patient already present: ${p.patient_ref}`);
        ok++;
        continue;
      }
      await (await trust.registerPatient(p.patient_ref, p.wallet)).wait();
      console.log(`patient registered: ${p.patient_ref} -> ${p.wallet}`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`patient FAILED: ${p.patient_ref}:`, short(e));
    }
  }

  const now = Math.floor(Date.now() / 1000);
  for (const g of state.grants || []) {
    const expiry = Math.floor(new Date(g.expires_at).getTime() / 1000);
    const remaining = expiry - now;
    if (remaining <= 0) {
      console.log(`grant skipped (expired): ${g.patient_ref} -> ${g.doctor_wallet}`);
      continue;
    }
    const existing = await trust.getPermissions(g.patient_ref);
    const currentExpiry = existing
      .filter((permission) =>
        permission.grantedTo.toLowerCase() === g.doctor_wallet.toLowerCase() &&
        permission.isActive
      )
      .reduce((latest, permission) => {
        const value = Number(permission.expiry);
        return value > latest ? value : latest;
      }, 0);
    if (currentExpiry >= expiry) {
      console.log(`grant already present: ${g.patient_ref} -> ${g.doctor_wallet}`);
      ok++;
      continue;
    }
    // The contract stores day granularity; round up so no live grant is
    // shortened (same day-boundary semantics as the UI's grant form).
    const days = Math.max(1, Math.ceil(remaining / 86400));
    try {
      await (
        await trust.patientGrantAccess(g.patient_ref, g.patient_wallet, g.doctor_wallet, days)
      ).wait();
      console.log(`grant restored: ${g.patient_ref} -> ${g.doctor_wallet} for ${days}d`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`grant FAILED: ${g.patient_ref} -> ${g.doctor_wallet}:`, short(e));
    }
  }

  for (const r of state.records || []) {
    // Same metadata pointer scheme the backend uses in add_record.
    const uri = `https://api.${String(r.facility_id).toLowerCase()}.afyatrust.network/exchange/${r.hash}`;
    try {
      const existing = await trust.getRecords(r.patient_ref);
      if (existing.some((record) =>
        record.recordHash.toLowerCase() === String(r.hash).toLowerCase() &&
        record.facilityID.toLowerCase() === String(r.facility_id).toLowerCase()
      )) {
        console.log(`record already present: ${r.patient_ref} ${String(r.hash).slice(0, 20)}…`);
        ok++;
        continue;
      }
      await (await trust.addRecord(r.patient_ref, r.hash, r.facility_id, uri)).wait();
      console.log(`record restored: ${r.patient_ref} ${String(r.hash).slice(0, 20)}…`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`record FAILED: ${r.patient_ref}:`, short(e));
    }
  }

  console.log(`\nDone. ok=${ok} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

function validateState(state) {
  if (!state || !Array.isArray(state.patients) ||
      !Array.isArray(state.grants) || !Array.isArray(state.records)) {
    throw new Error("Migration state must contain patients, grants, and records arrays");
  }

  const assertReferenceOnly = (entry, kind) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${kind} entry must be an object`);
    }
    if (
      ["health_id", "healthId", "healthID", "name", "full_name", "fullName"]
        .some((field) => field in entry)
    ) {
      throw new Error(`${kind} contains raw patient identity; export state again`);
    }
    if (!/^pt_[a-f0-9]{64}$/.test(entry.patient_ref || "")) {
      throw new Error(`${kind} is missing a valid pseudonymous patient_ref`);
    }
  };

  for (const patient of state.patients) assertReferenceOnly(patient, "Patient");
  for (const grant of state.grants) assertReferenceOnly(grant, "Grant");
  for (const record of state.records) assertReferenceOnly(record, "Record");
}

function short(e) {
  return (e.shortMessage || e.message || String(e)).slice(0, 160);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
