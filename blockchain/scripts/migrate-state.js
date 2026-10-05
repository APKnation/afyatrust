// Re-register existing PoC state onto a freshly deployed AfyaTrust contract.
// A new deployment starts empty; this copies over the patients, active
// permission grants and record pointers that live in the backend database.
//
// Usage:
//   npx hardhat run scripts/migrate-state.js --network sepolia [state.json]
//
// state.json shape (exported from the backend, see README):
//   { patients: [{health_id, wallet, name}],
//     grants:   [{health_id, patient_wallet, doctor_wallet, expires_at}],
//     records:  [{health_id, hash, facility_id}] }
const hre = require("hardhat");
const fs = require("fs");

const STATE_FILE = process.argv[2] || "/tmp/afya_state.json";

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const raw = fs.readFileSync("./contract-address.txt", "utf8");
  const address = raw.match(/CONTRACT_ADDRESS=(0x[0-9a-fA-F]+)/)[1];

  const trust = await hre.ethers.getContractAt("AfyaTrust", address);
  const [signer] = await hre.ethers.getSigners();
  console.log("Migrating state onto", address);
  console.log("Signer:", signer.address, "\n");

  let ok = 0;
  let failed = 0;

  for (const p of state.patients || []) {
    try {
      await (await trust.registerPatient(p.health_id, p.wallet, p.name)).wait();
      console.log(`patient registered: ${p.health_id} -> ${p.wallet}`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`patient FAILED: ${p.health_id}:`, short(e));
    }
  }

  const now = Math.floor(Date.now() / 1000);
  for (const g of state.grants || []) {
    const expiry = Math.floor(new Date(g.expires_at).getTime() / 1000);
    const remaining = expiry - now;
    if (remaining <= 0) {
      console.log(`grant skipped (expired): ${g.health_id} -> ${g.doctor_wallet}`);
      continue;
    }
    // The contract stores day granularity; round up so no live grant is
    // shortened (same day-boundary semantics as the UI's grant form).
    const days = Math.max(1, Math.ceil(remaining / 86400));
    try {
      await (
        await trust.patientGrantAccess(g.health_id, g.patient_wallet, g.doctor_wallet, days)
      ).wait();
      console.log(`grant restored: ${g.health_id} -> ${g.doctor_wallet} for ${days}d`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`grant FAILED: ${g.health_id} -> ${g.doctor_wallet}:`, short(e));
    }
  }

  for (const r of state.records || []) {
    // Same metadata pointer scheme the backend uses in add_record.
    const uri = `https://api.${String(r.facility_id).toLowerCase()}.afyatrust.network/exchange/${r.hash}`;
    try {
      await (await trust.addRecord(r.health_id, r.hash, r.facility_id, uri)).wait();
      console.log(`record restored: ${r.health_id} ${String(r.hash).slice(0, 20)}…`);
      ok++;
    } catch (e) {
      failed++;
      console.error(`record FAILED: ${r.health_id}:`, short(e));
    }
  }

  console.log(`\nDone. ok=${ok} failed=${failed}`);
}

function short(e) {
  return (e.shortMessage || e.message || String(e)).slice(0, 160);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
