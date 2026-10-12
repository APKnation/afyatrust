# AfyaTrust

AfyaTrust is a proof of concept for sharing patient records between healthcare
facilities with patient consent and tamper-evident audit records. It combines
an Angular web app, a Django REST API, PostgreSQL for application and clinical
data, and a Solidity contract deployed to Ethereum Sepolia.

> **Privacy and legacy deployment:** The old Sepolia contract
> [0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED](https://sepolia.etherscan.io/address/0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED)
> contains patient names and Health IDs in its public history. Blockchain
> records cannot be removed. The updated contract uses keyed pseudonymous
> patient references for new deployments; it cannot erase data on the legacy
> contract.

## How it works

- Clinical record content and measurements are stored off-chain in PostgreSQL.
- The API hashes records and anchors integrity metadata to the contract. New
  contract calls use an HMAC-derived patient reference; the Health ID stays in
  the application database.
- The API handles authentication, role checks, consent, referrals, and chain
  interactions. Patients use custodial wallets whose private keys are
  encrypted with AES-256-GCM.
- A doctor receives records only when the API verifies the patient's access
  grant and matches the stored record to its on-chain hash and facility.
- Emergency break-glass access is time-limited and audited. Its detailed
  reason remains off-chain; the chain records a reason hash.
- Hospital A and Hospital B are facility identities in one shared PoC API and
  database, not separate deployments. Referral verification currently covers
  `MedicalRecord` entries; separately stored measurements are not included in
  that handoff response.
- When the chain is unavailable, some data can be saved with a pending or
  unverified status. A database save alone does not prove on-chain integrity.

See [docs/architecture.md](docs/architecture.md) for component and sequence
diagrams, data placement, and trust boundaries.

## Repository layout

```text
backend/afyatrust/   Django project, REST API, models, migrations
backend/             Python requirements and backend environment template
frontend/            Angular application
blockchain/          Solidity contract, Hardhat scripts and contract tests
docs/architecture.md Architecture and current implementation boundaries
```

## Requirements

- Python 3.10 or newer
- Node.js and npm (use a release supported by the installed Angular CLI)
- PostgreSQL
- A Sepolia JSON-RPC endpoint and funded facility wallet for blockchain writes

The frontend can run without a local contract deployment, but blockchain
features need a correctly configured backend and contract.

## Local setup

### 1. Configure the backend

Copy `backend/.env.example` to `backend/.env` and set the database and secret
values. Generate secrets rather than reusing example values:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Use a generated value for `SECRET_KEY` and a separate generated value for
`CHAIN_ID_SECRET`. Generate a 32-byte `MASTER_KEY` with:

```bash
python -c "import secrets; print(secrets.token_bytes(32).hex())"
```

Keep `CHAIN_ID_SECRET` stable: changing it makes existing on-chain patient
references unlocatable. Keep `MASTER_KEY` secure and backed up; losing it makes
custodial wallet keys unreadable. Do not commit `.env` files or production
secrets.

Install dependencies and initialize the database:

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd afyatrust
python manage.py migrate
python manage.py runserver
```

The API runs at `http://127.0.0.1:8000/`. Configure PostgreSQL before running
migrations. For chain operations, also set `SEPOLIA_RPC_URL`,
`CONTRACT_ADDRESS`, and `FACILITY_PRIVATE_KEY` in `backend/.env`.

### 2. Run the frontend

In another terminal:

```bash
cd frontend
npm install
npm start
```

The Angular app runs at `http://localhost:4200/`.

### 3. Deploy or configure the contract (optional)

To deploy a new Sepolia contract, copy `blockchain/.env.example` to
`blockchain/.env`, set `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY`, then run:

```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

Set the resulting address as `CONTRACT_ADDRESS` in `backend/.env`. The
deployer must be an admin, and the backend facility wallet needs the contract
roles described in [blockchain/README.md](blockchain/README.md). A new
deployment starts with empty chain state. To replace a deployment with
existing state, follow the export and migration procedure in that guide,
preserving the same `CHAIN_ID_SECRET` throughout.

## Development commands

```bash
# Backend checks
cd backend/afyatrust
python manage.py check

# Frontend build
cd frontend
npm run build

# Contract tests
cd blockchain
npx hardhat test
```

## Security and deployment notes

- This repository is a proof of concept, not a production-ready health system.
  Review deployment, identity proofing, key management, access controls,
  backups, monitoring, and applicable health-data regulations before using
  real patient data.
- Never put names, Health IDs, clinical notes, private keys, or secrets in
  contract transactions or public metadata.
- Existing legacy contract disclosures are permanent. The updated contract
  prevents those identity fields from being added by new deployments, but
  keyed references are pseudonymous data, not a guarantee of anonymity.
- Preserve database backups, `MASTER_KEY`, and `CHAIN_ID_SECRET` securely.
  They serve different purposes and cannot be regenerated to recover existing
  wallet access or patient references.

