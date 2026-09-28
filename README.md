# AfyaTrust — PoC

Blockchain-based patient record access and audit layer.
**Author:** Atanasi Patrick Kafuka · **University:** UDOM

**Deployed contract (Sepolia):** [`0x94a66c550a51980e4Ae35364046555e0Fc5Bd1A3`](https://sepolia.etherscan.io/address/0x94a66c550a51980e4Ae35364046555e0Fc5Bd1A3) — the full 7-step flow was verified on-chain (registration, record hashes, patient-signed grants, doctor `hasAccess` check, audit `VIEW` events, break-glass).

Clinical data **stays at the facility** that holds it. The blockchain stores
only the minimum: record hashes, location pointers, permissions, and audit
events. Patients authorize access; every read is logged; emergencies use an
auditable break-glass flow.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular + Tailwind CSS |
| Backend | Django REST Framework |
| Database | PostgreSQL |
| Smart contract | Solidity |
| Web3 | Ethers.js (deploy) / web3.py (backend) |
| PoC chain | Ethereum Sepolia testnet (free) |
| Production (future) | Hyperledger Fabric |

PoC simplifications: patients log in with **Health ID + 4-digit PIN** (no
OTP/SMS, no MetaMask). The backend creates and manages **custodial patient
wallets** — private keys encrypted with AES-256-GCM (`MASTER_KEY`). Only
facility/doctor wallets pay gas. Doctors may optionally connect MetaMask.

## 1. Deploy the contract to Sepolia

```bash
cd blockchain
npm install

# blockchain/.env
# SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<YOUR_KEY>
# DEPLOYER_PRIVATE_KEY=0x...            # a funded Sepolia test wallet
npx hardhat run scripts/deploy.js --network sepolia
```

The script prints the address, saves it to `blockchain/contract-address.txt`,
and shows the line to paste into `backend/.env`.

Free Sepolia ETH: https://sepoliafaucet.com (or any public faucet).

## 2. Configure backend/.env

```ini
DEBUG=True
SECRET_KEY=<django-secret>
DB_NAME=afyatrust
DB_USER=postgres
DB_PASSWORD=<db-password>
DB_HOST=localhost
DB_PORT=5432

SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<YOUR_KEY>
CONTRACT_ADDRESS=0x<from deploy step>
FACILITY_PRIVATE_KEY=0x<facility wallet key, pays gas>
MASTER_KEY=<64 hex chars = 32 bytes, encrypts patient keys>
```

Generate a master key:

```bash
python -c "import secrets; print(secrets.token_bytes(32).hex())"
```

> PoC note: until `CONTRACT_ADDRESS` is set, the API still works — on-chain
> steps are skipped and marked `PENDING: ...` in responses.

## 3. Run backend + frontend

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cd afyatrust
python manage.py migrate
python manage.py runserver          # http://localhost:8000

# Frontend (new terminal)
cd frontend
npm install
npm start                           # http://localhost:4200
```

## 4. Test the 7 steps from the document

1. **Patient receives a Health ID** — register at `/register`
   (name, Health ID, 4-digit PIN). The backend creates a custodial wallet and
   calls `registerPatient` on-chain.
2. **Facility links records** — add a record (via the API or Django admin):
   data saved off-chain, SHA-256 hash + facility ID written on-chain
   (`addRecord`).
3. **Only metadata on-chain** — check the `Patient` row: it holds the
   encrypted key; the chain holds only `recordHash`, `facilityID`,
   `metadataURI`.
4. **Another facility verifies + requests access** — open `/doctor`,
   connect MetaMask (optional), enter the Health ID, "Access Records".
   Without permission you get a denial panel → **Request Access**.
5. **Patient approves** — sign in at `/login`, open **Requests**, **Approve**
   → `patientGrantAccess` is written on-chain (7 days). The doctor can now
   view records; `hasAccess` returns true.
6. **Every access logged** — after the doctor views records, the patient's
   **Audit Trail** tab shows the `VIEW` event (who, role, facility, time).
7. **Break-glass** — from the denial panel, enter a reason and press
   **Break-Glass**. Access is granted for the emergency and a
   `BREAK_GLASS` event is permanently logged for accountability.

Scripted check of the same flow (each run uses a fresh Health ID and real
Sepolia gas):

```bash
cd backend/afyatrust
python manage.py shell -c "from api.test_poc_flow import run; run()"
```

## API overview

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/register/` | — | Register patient (creates wallet, calls contract) |
| POST | `/api/login/` | — | Health ID + PIN → JWT |
| POST | `/api/add-record/` | — | Facility adds record (hash on-chain) |
| GET | `/api/patient/my-records/` | JWT | Own records + audit trail |
| GET | `/api/patient/requests/` | JWT | Pending doctor requests |
| POST | `/api/patient/grant-access/` | JWT | Grant a doctor access (N days) |
| POST | `/api/patient/approve-request/<id>/` | JWT | Approve request |
| POST | `/api/patient/reject-request/<id>/` | JWT | Reject request |
| POST | `/api/doctor/request-access/` | — | Doctor asks for access |
| GET | `/api/doctor/patient/<health_id>/` | wallet header | View records if `hasAccess` |
| POST | `/api/doctor/break-glass/` | — | Emergency access (logged) |

## Future work

- Hyperledger Fabric for production (permissioned chain).
- NHIF as an integrating target user (fraud/duplicate-claim reduction).
- OTP/SMS hardening of PIN login; per-record consent granularity.
