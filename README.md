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

## 4. Demonstrate Hospital A → Hospital B record integrity

Hospital A stores clinical data off-chain and anchors its SHA-256 hash on
Sepolia. After Hospital B accepts the referral, it recomputes the hash and
checks that the same hash and facility are in the patient's blockchain record
list. Hospital B receives the clinical payload only if both checks pass.

1. In Django admin, create two hospitals (for example `FAC-A` and `FAC-B`) and
   a staff login for each. Ensure the facility wallet is configured and
   authorized on the deployed contract.
2. Register a demo patient at `/register` and select `FAC-A` as the
   registering hospital.
3. Log in as Hospital A staff, open **Add Record**, and add a sample record.
   Wait for the successful Sepolia transaction; the dashboard shows its hash
   and Etherscan link. Only the hash, facility code, and metadata pointer are
   stored on-chain; clinical fields remain off-chain.
4. Sign in as the patient, open **Referrals**, and request a referral to
   `FAC-B`.
5. Log in as Hospital B staff, open **Incoming Referrals**, and accept the
   referral. The backend writes the transfer-of-care event to Sepolia.
6. On the accepted referral, click **Verify & receive records**. The screen
   reports whether the current payload matches its stored hash and whether that
   hash/facility pair exists on-chain. Only records passing both checks display
   clinical data. Mismatched or unanchored records are withheld.
7. To demonstrate detection, use Django admin to edit the record's
   `record_data` (for example, change a lab result), save it, then run
   **Verify & receive records** again at Hospital B. The computed hash will
   differ from the immutable Sepolia hash, the record will show
   `INTEGRITY_MISMATCH`, and its data will not be released. Restore the record
   after the demonstration.

After pulling the current code, apply database changes before running the
demo:

```bash
cd backend/afyatrust
python manage.py migrate
```

The exchange metadata endpoint is `/exchange/<record-hash>/`. It exposes
verification metadata only, not clinical data. The authenticated referral
verification endpoint is `POST /api/staff/referrals/<id>/verify-records/`;
it is scoped to the receiving hospital and accepted referrals.

For the longitudinal summary to group clinical concepts consistently, enter
diagnosis values under fields named `diagnosis`, `disease`, or `condition`, and
medicine names under `medicine`, `medication`, `drug`, or `prescription`.
Doctors record vitals from their **Measurements** tab; each new reading is
anchored with a hash and appears in the measurement timeline with its hospital,
clinician, date, and verification status. The doctor’s **Find Patient** view
then shows all verified history, frequent recorded diagnoses/medicines,
measurement counts/latest values, referral reasons, and facility activity.
Patients’ consent requests are approved from their **Requests** tab; emergency
break-glass is limited to approved doctors and requires a reason.

> **PoC boundary:** Hospital A and Hospital B are separate facility identities
> and staff accounts in this demo, but they currently use one AfyaTrust
> backend/database deployment. The on-chain hash check demonstrates detection
> of changed off-chain data; independent hospital deployments and production
> health-data transport/security require further integration.

Run the scripted flow (creates a fresh patient, writes real Sepolia
transactions, and includes a simulated tamper check):

```bash
cd backend/afyatrust
python manage.py shell -c "from api.test_poc_flow import run; run()"
```

## Current implemented end-to-end flow

This is the complete flow that is in the codebase today, not just the original 7-step demo script.

1. **Hospital/health system and identities**
   - A hospital/facility is created in Django by an admin (`Hospital` model).
   - A patient registers with a unique Health ID, full name, and 4-digit PIN.
   - The backend creates a custodial patient wallet, encrypts the private key with AES-256-GCM, and saves the encrypted key on the server.
   - A doctor is created by admin approval flow, with a medical license number, PIN, facility ID, and a custodial wallet for on-chain actions.
   - Hospital staff accounts can also be created by admin and sign in with username/password for desk-side workflows.

2. **Single sign-in and role routing**
   - There is one login endpoint for all user types: patient, doctor, and staff.
   - The same page routes users by role after JWT authentication.
   - Patients access `/patient`, doctors access `/doctor`, and staff access `/hospital`.

3. **Patient registration and on-chain identity**
   - `POST /api/register/` creates the patient record and calls `registerPatient` on the smart contract if the contract is reachable.
   - The blockchain stores the patient’s Health ID, wallet address, and name; the private key stays off-chain and encrypted in the backend.
   - If the contract is not yet deployed or RPC is unavailable, the API still works and marks the transaction as `PENDING: ...` in the response.

4. **Facility record ingestion**
   - Authenticated hospital staff add patient records; the backend derives the
     facility code from the staff account, not from a client-supplied value.
   - The actual record payload remains off-chain in Django (`MedicalRecord.record_data`), while a SHA-256 hash and facility metadata are written to-chain.
   - This preserves privacy while keeping an auditable pointer and hash on the blockchain.
   - The added record is linked to the patient and the facility that created it.
   - Doctors can add measurements during care. New measurements also receive
     a SHA-256 integrity hash anchored on-chain; the dashboard labels old
     pre-migration measurements as legacy/unanchored.

5. **Hospital-to-hospital referral integrity**
   - A patient registered with Hospital A requests referral to Hospital B.
   - Hospital B accepts; the backend logs the transfer of care on-chain.
   - Hospital B can verify records created by Hospital A before the referral.
     It recomputes each payload hash and checks for the exact hash/facility
     pair in the patient's on-chain `getRecords` result.
   - The backend returns clinical content only for records passing both
     checks. Changed or unanchored records are flagged and withheld.

6. **Doctor onboarding and verification flow**
   - A doctor is not self-registered in the PoC. The admin creates the doctor profile and sets the initial PIN.
   - The doctor can then log in and check status via the backend; only `APPROVED` doctors can request access or view patient records.
   - The frontend shows the doctor status and gating states based on admin approval.

7. **Access requests and patient consent**
   - A verified doctor submits a request for access to a patient by Health ID.
   - The request is stored as an `AccessRequest` with the doctor’s wallet, facility, reason, and status (`PENDING`/`APPROVED`/`REJECTED`).
   - The patient sees pending requests in the patient dashboard and can approve or reject them.
   - On approval, the backend calls `patientGrantAccess(...)` with the patient’s custodial key, and the permission is logged on-chain for a configurable number of days.
   - The patient can also revoke access later.

8. **Doctor record access checks**
   - When the doctor requests patient records, the API checks `hasAccess` on-chain with a cached read layer to avoid repeated expensive RPC calls.
   - If the patient has granted access, the doctor can view the record bundle.
   - If access is missing, the denial flow is shown in the UI and the doctor can request access or trigger break-glass if the case is urgent.
   - The doctor history includes verified clinical records, all measurements
     with integrity status, recorded referral reasons, recurring diagnoses,
     frequently recorded medicines, measurement trends, and recorded activity
     days per hospital. Payloads with an anchored hash mismatch are withheld.

9. **Audit trail and accountability**
   - Every successful record view is logged on-chain as a `VIEW` event with accessor, role, facility, and timestamp.
   - The patient dashboard exposes the chain-backed audit trail and the latest tx hash when available.
   - This gives a permanent evidence trail of who accessed what and when.

10. **Emergency break-glass flow**
   - From the denial panel, a doctor can enter a reason and use the break-glass mechanism.
   - Only an authenticated, admin-approved doctor can invoke break-glass. The
     backend calls `breakGlass(...)` on-chain and creates a one-hour emergency
     grant with the reason recorded. The UI indicates if the chain audit is
     still pending; data history is not described as chain-verified when its
     anchors cannot be checked.

11. **Secondary clinical workflows already implemented**
   - Doctors can record measurements (`Measurement`) for granted patients.
   - Patients can see their measurements and referrals.
   - Patients can initiate referral requests to other hospitals.
   - Receiving hospital staff can review and accept/decline referrals through the staff workflow.
   - The system already supports referral handoff and hospital-to-hospital coordination, not just patient access control.

12. **Frontend + backend integration**
   - Angular handles the patient, doctor, and hospital portals and routes users by role.
   - Django REST Framework exposes the API and handles auth, wallet management, contract interaction, and audit aggregation.
   - Hardhat + Solidity secures the permission logic, event logging, and access checks while the backend keeps private patient records off-chain.

In short, the project today implements: identity creation, custodial wallets,
facility-scoped record ingestion, tamper detection and gated record handoff
during Hospital A → Hospital B referrals, approval-based patient consent,
doctor access gates, audit logging, break-glass emergency access,
measurements, and referral workflows across the frontend, backend, and
blockchain. The PoC uses a shared backend/database; it does not yet deploy
independent hospital systems.

## API overview

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/register/` | — | Register patient (creates custodial wallet and on-chain identity) |
| POST | `/api/login/` | — | Single login for patient, doctor, or staff (`identity` + `secret`) |
| POST | `/api/add-record/` | Hospital staff JWT | Add off-chain record; derive facility from staff; anchor hash on-chain |
| GET | `/exchange/<record-hash>/` | — | Public verification metadata only; no clinical payload |
| GET | `/api/patient/my-records/` | JWT | Patient’s own records + audit trail |
| GET | `/api/patient/requests/` | JWT | Patient’s pending access requests |
| POST | `/api/patient/grant-access/` | JWT | Grant doctor access for N days |
| POST | `/api/patient/revoke-access/` | JWT | Revoke doctor access |
| POST | `/api/patient/approve-request/<id>/` | JWT | Approve a doctor’s access request |
| POST | `/api/patient/reject-request/<id>/` | JWT | Reject a doctor’s access request |
| GET | `/api/doctor/me/` | JWT | Current approved doctor profile |
| GET | `/api/doctor/status/` | JWT | Doctor checks approval status |
| POST | `/api/doctor/request-access/` | JWT | Verified doctor requests patient access |
| GET | `/api/doctor/patient/<health_id>/` | JWT | View patient records if `hasAccess` is true |
| POST | `/api/doctor/measurements/` | JWT | Add a clinical measurement for a patient |
| GET | `/api/patient/measurements/` | JWT | Patient view of their own measurements |
| GET | `/api/doctor/measurements/<health_id>/` | Approved doctor JWT + access grant | View measurement history with integrity status |
| POST | `/api/patient/referrals/send/` | JWT | Patient requests a referral to another hospital |
| GET | `/api/staff/referrals/` | JWT | Staff receives and processes referral requests |
| POST | `/api/staff/referrals/<id>/respond/` | Receiving hospital staff JWT | Accept/decline referral; acceptance is anchored on-chain |
| POST | `/api/staff/referrals/<id>/verify-records/` | Receiving hospital staff JWT | Verify and receive records only when payload and chain hashes match |
| POST | `/api/doctor/break-glass/` | JWT | Emergency access with permanent audit logging |

## Future work

- Hyperledger Fabric for production (permissioned chain).
- NHIF as an integrating target user (fraud/duplicate-claim reduction).
- OTP/SMS hardening of PIN login; per-record consent granularity.
