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
The deployer must be the contract admin. Configure `FACILITY_PRIVATE_KEY`
in `backend/.env`; the deployment script grants that wallet both
`FACILITY_ROLE` (record and patient operations) and `OPERATOR_ROLE`
(break-glass and operator transactions) on the newly deployed contract.
After deployment, update `CONTRACT_ADDRESS` in `backend/.env` to the printed
address.

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
check is denied; the reason is mandatory and recorded with the emergency audit.

A fresh contract has no patient, record, or permission state from previous
deployments. Migrate the required state separately before expecting prior
records and grants to remain available.
