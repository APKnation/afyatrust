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
in `backend/.env`; the deployment script grants that wallet `FACILITY_ROLE`
on the newly deployed contract. After deployment, update `CONTRACT_ADDRESS`
in `backend/.env` to the printed address.

Deploy with:

```shell
npx hardhat run scripts/deploy.js --network sepolia
```

To grant the role to the configured backend wallet on an existing deployment,
set that deployment's address as `CONTRACT_ADDRESS` in `backend/.env`, then run:

```shell
npx hardhat run scripts/grant-facility-role.js --network sepolia
```

A fresh contract has no patient, record, or permission state from previous
deployments. Migrate the required state separately before expecting prior
records and grants to remain available.
