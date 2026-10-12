# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

## AfyaTrust Sepolia deployment

Configure `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` in `blockchain/.env`.
Before registering or exporting any patients, configure a stable,
cryptographically random `CHAIN_ID_SECRET` in `backend/.env`. The backend uses
it to derive opaque patient references; losing or rotating it prevents the
application from locating the patients on-chain.
The deployer must be the contract admin. Configure `FACILITY_PRIVATE_KEY`
in `backend/.env`; the deployment script grants that wallet both
`FACILITY_ROLE` (record and patient operations) and `OPERATOR_ROLE`
(break-glass and operator transactions) on the newly deployed contract.
For a replacement deployment, export state before deploying. Do not update
`CONTRACT_ADDRESS` until the export has been migrated successfully.

Deploy with:

```shell
npx hardhat run scripts/deploy.js --network sepolia
```

To grant the required backend roles on an existing deployment, set that
deployment's address as `CONTRACT_ADDRESS` in `backend/.env`, then run:

```shell
npx hardhat run scripts/grant-facility-role.js --network sepolia
```

Before an approved doctor can use emergency break-glass, that doctor's wallet
must have `CLINICIAN_ROLE` on the same contract. Use the doctor's wallet shown
in Django Admin:

```shell
npx hardhat run scripts/grant-clinician-role.js --network sepolia -- 0xDoctorWallet
```

Both role setup commands require the configured Hardhat deployer to be an
admin on the contract. Only grant `CLINICIAN_ROLE` to verified, approved
clinicians. The doctor dashboard presents this option after a record-access
check is denied; the detailed emergency reason stays off-chain and its hash is
recorded with the on-chain audit.

A fresh contract has no patient, record, or permission state from previous
deployments. For a replacement, export state before deploying:

```shell
cd ../backend/afyatrust
python manage.py export_chain_state --out /tmp/afya_state.json
```

After the new contract has been deployed, run:

```shell
cd ../../blockchain
STATE_FILE=/tmp/afya_state.json npx hardhat run scripts/migrate-state.js --network sepolia
```

Only after migration succeeds, set `CONTRACT_ADDRESS` in `backend/.env` to
the new address and restart the API.

The export contains keyed patient references, wallets, live grants, and
anchored record hashes; it omits Health IDs and names and is written with
owner-only permissions. `migrate-state.js` rejects state files containing raw
patient identifiers. Preserve the same `CHAIN_ID_SECRET` across export,
migration, and all future deployments.
The migration script signs with the backend facility wallet and requires that
wallet to have both `FACILITY_ROLE` and `OPERATOR_ROLE` on the new deployment.
Access/audit event history is not copied; it remains on the old deployment.

The previously deployed contract is legacy: its public history already
contains Health IDs and patient names, which cannot be erased. A replacement
contract prevents new identity disclosures but cannot remove old chain data.
