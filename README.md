# AfyaTrust — Decentralized Patient Record Access, Consent & Audit Layer

**Author:** Atanasi Patrick Kafuka · **University:** University of Dodoma (UDOM)  
**Architecture:** Hybrid On-chain / Off-chain Electronic Health Record (EHR) Security Layer  
**Deployed Contract (Sepolia Testnet):** [`0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED`](https://sepolia.etherscan.io/address/0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED)

---

## 1. Executive Summary & Core Philosophy

AfyaTrust solves the dual challenge of **patient privacy** and **inter-hospital record integrity** in modern healthcare systems:

1. **Clinical Data Stays at the Facility (Off-Chain):**  
   Sensitive medical records, vitals, prescriptions, and diagnosis notes never touch the public blockchain. They are stored in facility databases.

2. **Cryptographic Proofs & Governance Live On-Chain:**  
   The Ethereum smart contract stores only immutable cryptographic hashes (SHA-256) of medical records, metadata pointers, time-limited patient consent grants, access revocations, and audit event logs.

3. **Patient-Centric Access Control:**  
   Patients own their health data and authorize doctors for specified durations. Every access is logged, and patients can revoke permissions on-chain at any time.

4. **Emergency Break-Glass Protocol:**  
   When an unconscious or incapacitated patient arrives at emergency care, verified doctors can activate an audited, short-lived (1-hour) **Break-Glass Emergency Access** window. The action is permanently recorded on-chain, and the patient has real-time visibility and the power to terminate emergency access early.

5. **Inter-Hospital Transfer of Care & Tamper Detection:**  
   When a patient is referred from Hospital A to Hospital B, Hospital B recomputes the hash of the received clinical data and verifies it against the immutable Sepolia blockchain anchor. Any modified, corrupted, or tampered payload is automatically detected and rejected (`INTEGRITY_MISMATCH`).

6. **Resilient Activity History (DB + Chain Fallback):**  
   The Access History tab always shows meaningful data. When the blockchain node is reachable, events come from the on-chain audit trail. When it is temporarily unavailable, a DB-sourced story (records, grants, referrals) is returned automatically — no blank screens, no 503 errors.

---

## 2. Technology Stack

| Layer | Technologies & Frameworks | Purpose |
|---|---|---|
| **Frontend** | Angular 22 (Standalone Components), Tailwind CSS, RxJS | Responsive patient, doctor, and hospital portals |
| **Backend** | Python 3.14, Django 5.x, Django REST Framework (DRF) | REST API, cryptographic hashing, JWT authentication |
| **Database** | PostgreSQL 16+ | Off-chain clinical data, user profiles, custodial key vault |
| **Smart Contract** | Solidity ^0.8.20, OpenZeppelin AccessControl | Decentralized access ledger, role management, audit trail |
| **Blockchain Client** | Web3.py (Backend), Ethers.js (Deployment / Scripts) | RPC interaction with Ethereum Sepolia testnet |
| **Wallet Security** | AES-256-GCM (Master Key Envelope Encryption) | Non-custodial patient experience via backend-managed wallets |
| **PoC Network** | Ethereum Sepolia Testnet (Chain ID `11155111`) | Free, publicly verifiable testnet |
| **Production Target** | Hyperledger Fabric | Permissioned enterprise blockchain for national health networks |

---

## 3. High-Level Architecture & Workflow

```
       +--------------------------------------------------------------+
       |                  Angular Frontend Portal                     |
       |     [Patient Portal]   [Doctor Portal]   [Hospital Desk]     |
       +------------------------------+-------------------------------+
                                      | HTTP REST / JWT
                                      v
       +--------------------------------------------------------------+
       |                     Django Backend API                       |
       |  - AES-256-GCM Key Vault       - SHA-256 Payload Hasher      |
       |  - Role & Permission Layer     - Web3.py RPC Gateway         |
       |  - DB Fallback Story Builder   - Break-Glass Handler         |
       +--------------+-------------------------------+---------------+
                      |                               |
       Off-Chain Data |                               | On-Chain Proofs & Audits
                      v                               v
       +-------------------------------+  +-------------------------------+
       |      PostgreSQL Database      |  |  Ethereum Sepolia Blockchain  |
       | - MedicalRecord (JSON)        |  | - Record Hash & Facility Code |
       | - Measurement Readings        |  | - Active Doctor Grants        |
       | - Encrypted Private Keys      |  | - Break-Glass Emergency Window|
       | - Inter-Hospital Referrals    |  | - Immutable AuditTrail Logs   |
       | - Access Grant History        |  | - ReferralAccepted Events     |
       +-------------------------------+  +-------------------------------+
```

---

## 4. Key System Features & Protocols

### 4.1 Custodial Wallets & Frictionless Patient Experience
- Patients do not need MetaMask or crypto knowledge. They register with a **Health ID + 4-digit PIN**.
- The backend generates a unique Ethereum wallet address for each patient.
- Private keys are encrypted using **AES-256-GCM** with a server-side 256-bit `MASTER_KEY` and unique initialization vectors (IVs).
- The facility wallet pays all Sepolia gas fees (`ensure_gas`), automatically topping up custodial wallets when needed.

> **Note:** Always activate the virtual environment before running the backend:
> ```bash
> cd backend && source venv/bin/activate
> ```
> Running `/bin/python` directly will fail with `ModuleNotFoundError: No module named 'eth_account'`.

### 4.2 Consent Management & Access Revocation
- **Access Requests:** Verified doctors search for a patient by Health ID and request access with a stated medical reason.
- **Grant Access:** Patients review pending requests in their dashboard and grant time-limited access (e.g., 7 days). The backend signs the `patientGrantAccess` transaction.
- **Instant Revocation:** Patients can view all currently authorized doctors in the **Permissions** tab and click **Revoke Access** anytime, executing `patientRevokeAccess` on-chain.

### 4.3 Emergency "Break-Glass" Protocol
In urgent emergencies where patient consent cannot be obtained:

1. **Invocation:** An approved doctor clicks **Break-Glass** in the doctor dashboard, documents the emergency clinical reason, and submits the request.
2. **On-Chain Log & Role Check:** The backend verifies `CLINICIAN_ROLE` and signs `breakGlass(healthID, clinicianAddress, facilityID, reason)`.
3. **Emergency Window:** The contract grants emergency access for up to 1 hour (`emergencyAccessRemaining`).
4. **Patient Real-Time Alert:** The patient's dashboard displays a prominent red alert banner with a real-time countdown ticker showing who is accessing the record and why.
5. **Patient Early Termination:** The patient can click **End emergency access** at any moment, calling `revokeEmergencyAccess` on-chain immediately.
6. **Audit Permanence:** Even after the window expires or is revoked, the event remains permanently visible in the patient's Access History tab with an Etherscan link.

### 4.4 Inter-Hospital Referrals & Tamper Verification (Hospital A to Hospital B)
- **Record Anchoring:** Hospital A adds a clinical record. The backend computes `SHA-256(payload)` and calls `addRecord(...)` on-chain.
- **Referral Flow:** A doctor or patient initiates a referral to Hospital B. Hospital B accepts it on-chain (`ReferralAccepted`).
- **Cryptographic Gate:** When Hospital B staff clicks **Verify & Receive Records**, the system:
  1. Computes the SHA-256 hash of the received clinical data.
  2. Queries the smart contract's `getRecords(healthID)`.
  3. Validates that `hash_matches_payload == True` and `anchored_on_chain == True`.
  4. If any data was altered, the check fails with `INTEGRITY_MISMATCH` and withholds clinical data.

### 4.5 Advanced Referrals Dashboard (Patient Portal)
The Referrals tab provides a premium UI for tracking all hospital referrals:

- **Stat bar:** Total / Accepted / Pending / Declined counts at a glance.
- **Rich referral cards:** Left-side color-coded accent stripe, status pill with animated dot, reason block, and a mini-timeline showing Sent and Responded dates.
- **Blockchain-secured badge:** Every card confirms the referral acceptance is anchored on-chain.
- **Referral origin:** Shows the referring doctor or hospital, or "Self-requested" for patient-initiated referrals.
- **Gradient modal:** Opens with hospital selector, reason textarea, animated send button with spinner, and inline success/error alerts.
- **Empty state:** Illustrated with a call-to-action button to request the first referral.

### 4.6 Resilient Access History (On-Chain + DB Fallback)
The **Access History** tab previously returned HTTP 503 and showed nothing when the blockchain node was unreachable. It now:

| Scenario | Behavior |
|---|---|
| Blockchain **reachable** + audit trail has events | Full on-chain story with Etherscan links |
| Blockchain **reachable** but trail is empty | DB-sourced story (records, grants, referrals from DB) |
| Blockchain **unreachable** | DB-sourced story built automatically — no error, no blank screen |

When running in DB-only mode, an amber info banner informs the user. Events with a verified `tx_hash` stored in the DB still show Etherscan links. Each DB-sourced event is tagged with a small `DB` badge. A **Refresh** button lets the user manually retry. Loading skeletons animate while data is fetching.

### 4.7 Unified Patient Health Summary
The patient dashboard overview computes a complete health summary client-side:

- **All conditions/diseases** across all records (not just the first record).
- **All measurement types** aggregated by kind with counts.
- **All hospital visits** from records, measurements, and referrals — deduplicated.
- Summary charts rendered using `RecordChartComponent` (bar charts for diagnoses, measurements, hospital visits, and medications).

---

## 5. Project Directory Structure

```
afyatrust/
├── backend/
│   ├── afyatrust/
│   │   ├── afyatrust/
│   │   │   ├── settings.py           # Django configuration, database & JWT
│   │   │   ├── urls.py               # Root URL configuration
│   │   │   └── wsgi.py
│   │   ├── api/
│   │   │   ├── admin.py              # Django admin (hospital, doctor, patient setup)
│   │   │   ├── afyatrust_abi.json    # Complete AfyaTrust contract ABI
│   │   │   ├── blockchain.py         # Web3.py RPC connector, gas buffer, EIP-1559 fees
│   │   │   ├── models.py             # Patient, Doctor, Hospital, Record, Referral, Grants
│   │   │   ├── urls.py               # Complete REST API route definitions
│   │   │   ├── views.py              # All API views + DB fallback story builder
│   │   │   ├── wallet_manager.py     # AES-256-GCM encryption for custodial wallets
│   │   │   ├── test_poc_flow.py      # End-to-end integration test script
│   │   │   └── tests.py              # DRF unit test suite
│   │   └── manage.py
│   ├── venv/                         # Python virtual environment (always use this)
│   ├── .env                          # Backend environment variables
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/
│   │   │   │   ├── auth/             # Login & Registration views
│   │   │   │   └── shared/           # RecordChartComponent, navbar
│   │   │   ├── pages/
│   │   │   │   ├── doctor/           # Doctor dashboard & Break-Glass controls
│   │   │   │   ├── hospital/         # Hospital desk & referral verification portal
│   │   │   │   └── patient/
│   │   │   │       └── patient-dashboard/
│   │   │   │           └── patient-dashboard.component.ts  # All tabs (inline template)
│   │   │   └── services/
│   │   │       ├── api.service.ts    # Typed API client (all 35+ endpoints)
│   │   │       ├── auth.service.ts   # JWT token storage & session handling
│   │   │       └── web3.service.ts   # Optional MetaMask integration
│   │   ├── environments/
│   │   │   ├── environment.ts        # Sepolia contract address, ABI, emergency ABI methods
│   │   │   └── environment.prod.ts
│   │   └── index.html
│   ├── package.json
│   └── angular.json
├── blockchain/
│   ├── contracts/
│   │   └── AfyaTrust.sol             # Core smart contract (Solidity ^0.8.20)
│   ├── scripts/
│   │   ├── deploy.js                 # Hardhat deployment script
│   │   └── grant-clinician-role.js   # RBAC helper script
│   ├── test/
│   │   └── AfyaTrust.test.js         # Hardhat smart contract tests
│   ├── hardhat.config.js
│   └── contract-address.txt          # Current deployed Sepolia address
└── README.md
```

---

## 6. Installation & Quickstart

### Prerequisites
- **Node.js**: v20.x or v22.x
- **Python**: 3.11+ (Python 3.14 compatible)
- **PostgreSQL**: 14+ running locally or in Docker
- **Sepolia RPC URL**: Infura, Alchemy, or public Sepolia node

---

### Step 1: Smart Contract Deployment (Optional — already deployed)

The contract is already deployed on Sepolia at `0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED`. To redeploy:

```bash
cd blockchain
npm install

# Create blockchain/.env
# SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<YOUR_API_KEY>
# DEPLOYER_PRIVATE_KEY=0x<YOUR_SEPOLIA_PRIVATE_KEY>

npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

Copy the generated contract address into `backend/.env` and `frontend/src/environments/environment.ts`.

---

### Step 2: Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**`backend/.env` Configuration:**
```ini
DEBUG=True
SECRET_KEY=your-django-secret-key
DB_NAME=afyatrust
DB_USER=postgres
DB_PASSWORD=your-postgres-password
DB_HOST=localhost
DB_PORT=5432

CONTRACT_ADDRESS=0x142F4871c1D1c1999A8D1d9fbAD6Bbff4bDc92ED
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<YOUR_INFURA_KEY>
FACILITY_PRIVATE_KEY=0x<FUNDED_SEPOLIA_PRIVATE_KEY>
MASTER_KEY=fe2647c04def4bd7588341658953395304c0ede4cbf2a4f604e8b41f09239372
```

Generate a secure 32-byte master key:
```bash
python -c "import secrets; print(secrets.token_bytes(32).hex())"
```

Run migrations and start server:
```bash
cd afyatrust
python manage.py migrate
python manage.py check
python manage.py runserver 0.0.0.0:8000
```

---

### Step 3: Frontend Setup

```bash
cd frontend
npm install
npm start    # Launches Angular dev server at http://localhost:4200
```

### Running Both Dev Servers
```bash
# Terminal 1 — Backend
cd backend && source venv/bin/activate
cd afyatrust && python manage.py runserver 0.0.0.0:8000

# Terminal 2 — Frontend
cd frontend && npm start
# App available at http://localhost:4200
```

---

## 7. Patient Dashboard — Tab Reference

| Tab | Description |
|---|---|
| **Dashboard** | Health overview: all conditions, measurements chart, hospital visits, recent activity |
| **History** | All medical records with SHA-256 hash, Etherscan verification link, and clinical data |
| **Measurements** | Vitals table (blood pressure, glucose, weight, etc.) with doctor and hospital columns |
| **Referrals** | Advanced referral cards: status timeline, stat bar, blockchain badge, and request modal |
| **Permissions** | Active doctor grants, break-glass alerts with live countdown, and revoke controls |
| **Requests** | Pending doctor access requests — approve or reject with on-chain effect |
| **Access History** | Unified activity story (records, grants, views, break-glass) — DB fallback when chain is down |
| **Wallet** | Custodial wallet address, transaction count, last tx hash |
| **Profile** | Editable name and phone number |
| **Referral Security** | Per-referral blockchain proof explorer with Etherscan verification |
| **How it Works** | Patient-facing explainer of the on-chain/off-chain architecture |

---

## 8. Exhaustive REST API Reference

All protected endpoints require an `Authorization: Bearer <JWT>` header obtained via `/api/login/`.

### 8.1 Authentication & Registration
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/register/` | Public | Register patient, generate custodial wallet, anchor on-chain identity |
| `POST` | `/api/login/` | Public | Unified login for Patient, Doctor, or Staff |
| `POST` | `/api/account/change-secret/` | Authenticated | Change account PIN or password |
| `GET` | `/api/hospitals/` | Public | List registered hospitals and facility codes |

### 8.2 Patient Endpoints
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/patient/my-records/` | Patient JWT | Fetch records, measurements, referrals, and hospital metadata |
| `GET` | `/api/patient/profile/` | Patient JWT | Fetch patient profile and wallet address |
| `PATCH` | `/api/patient/profile/patch/` | Patient JWT | Update phone number and name |
| `GET` | `/api/patient/measurements/` | Patient JWT | Fetch vitals and measurements |
| `GET` | `/api/patient/referrals/` | Patient JWT | List all referrals with from_doctor, from_hospital fields |
| `POST` | `/api/patient/referrals/send/` | Patient JWT | Request a referral to another hospital |
| `GET` | `/api/patient/requests/` | Patient JWT | List pending access requests from doctors |
| `POST` | `/api/patient/grant-access/` | Patient JWT | Grant doctor time-limited access on-chain |
| `GET` | `/api/patient/grant-access/status/` | Patient JWT | Active grants, expiring grants, active break-glass windows |
| `POST` | `/api/patient/revoke-access/` | Patient JWT | Revoke routine doctor access on-chain |
| `POST` | `/api/patient/revoke-emergency/` | Patient JWT | Instantly terminate an active break-glass emergency window |
| `POST` | `/api/patient/approve-request/<id>/` | Patient JWT | Approve a doctor's access request |
| `POST` | `/api/patient/reject-request/<id>/` | Patient JWT | Reject a doctor's access request |
| `GET` | `/api/patient/summary/` | Patient JWT | Longitudinal health summary (diagnoses, medications, visits) |
| `GET` | `/api/patient/dashboard/` | Patient JWT | Unified metrics: records breakdown, measurements, referrals |
| `GET` | `/api/patient/dashboard/<health_id>/` | JWT | Scoped dashboard for authorized patient or clinician |
| `GET` | `/api/patient/wallet/activity/` | Patient JWT | Custodial wallet transactions, last hash, pending actions |
| `GET` | `/api/patient/referral-timeline/` | Patient JWT | Cryptographic referral journey with on-chain proofs |

### 8.3 Doctor Endpoints
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/list-doctors/` | Authenticated | Search approved doctors by name or license number |
| `GET` | `/api/doctor/me/` | Doctor JWT | Current doctor profile, wallet address, and verification status |
| `GET` | `/api/doctor/status/` | Doctor JWT | Verification state (PENDING, APPROVED, REJECTED) |
| `POST` | `/api/doctor/request-access/` | Approved Doctor | Submit access consent request for a patient |
| `GET` | `/api/doctor/pending-requests/` | Doctor JWT | List doctor's pending access requests |
| `GET` | `/api/doctor/patients/` | Doctor JWT | List patients who have granted active access |
| `GET` | `/api/doctor/dashboard/` | Doctor JWT | Doctor practice metrics (patients, referrals, measurements) |
| `GET` | `/api/doctor/patient/<health_id>/` | Doctor JWT | Check hasAccess on-chain, release records, log VIEW audit |
| `POST` | `/api/doctor/break-glass/` | Approved Doctor | Trigger emergency break-glass with documented medical reason |
| `GET` | `/api/doctor/measurements/<health_id>/` | Doctor JWT | View patient measurements with integrity status |
| `POST` | `/api/doctor/measurements/` | Doctor JWT | Record vital reading and anchor hash on-chain |
| `GET` | `/api/doctor/referrals/` | Doctor JWT | Referrals initiated by this doctor |
| `GET` | `/api/doctor/referrals/incoming/` | Doctor JWT | Incoming referrals directed to doctor's hospital |

### 8.4 Hospital Staff Endpoints
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/add-record/` | Staff JWT | Add medical record, hash payload, anchor hash on-chain |
| `GET` | `/api/facility/records/` | Staff JWT | View records anchored by the staff member's hospital |
| `GET` | `/api/staff/referrals/` | Staff JWT | Incoming patient referrals for facility |
| `GET` | `/api/staff/referrals/outgoing/` | Staff JWT | Outgoing referrals sent from facility |
| `POST` | `/api/staff/referrals/<id>/respond/` | Staff JWT | Accept or decline referral; logs acceptance on-chain |
| `POST` | `/api/staff/referrals/<id>/verify-records/` | Staff JWT | Verify SHA-256 payload against Sepolia hash before release |
| `GET` | `/api/staff/records-exchange/` | Staff JWT | Cross-facility exchange verification overview |
| `GET` | `/exchange/<record_hash>/` | Public | Public decentralized metadata verification pointer |

### 8.5 Blockchain & Etherscan Verification
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/blockchain/events/` | Staff / Doctor | Filter on-chain events by type (RecordAdded, BreakGlassUsed, etc.) |
| `GET` | `/api/blockchain/patient/<health_id>/` | Authorized JWT | All on-chain events associated with a patient's Health ID |
| `GET` | `/api/blockchain/patient/<health_id>/story/` | Authorized JWT | Unified narrative — on-chain if available, DB fallback otherwise |
| `GET` | `/api/blockchain/hospital-summary/` | Staff JWT | Hospital transaction volume summary grouped by event type |

---

## 9. Smart Contract Specification (`AfyaTrust.sol`)

### Roles (AccessControl)
- `ADMIN_ROLE`: Contract deployer; grants and manages facility and operator roles.
- `FACILITY_ROLE`: Authorized hospital wallets capable of anchoring records.
- `OPERATOR_ROLE`: Backend relayer wallet authorized to submit patient-signed transactions.
- `CLINICIAN_ROLE`: Verified medical doctors authorized to invoke `breakGlass`.

### Key Functions
```solidity
// Registration
function registerPatient(string memory _healthID, address _wallet, string memory _name) public;

// Record Integrity Anchoring
function addRecord(
    string memory _healthID,
    string memory _recordHash,
    string memory _facilityID,
    string memory _metadataURI
) public;

// Consent Management
function patientGrantAccess(string memory _healthID, address _patient, address _doctor, uint256 _duration) public;
function patientRevokeAccess(string memory _healthID, address _patient, address _doctor) public;
function hasAccess(string memory _healthID, address _viewer) public view returns (bool);

// Emergency Break-Glass
function breakGlass(string memory _healthID, address _clinician, string memory _facilityID, string memory _reason) public;
function emergencyAccessRemaining(string memory _healthID, address _clinician) public view returns (uint256);
function revokeEmergencyAccess(string memory _healthID, address _clinician) public;

// Auditing & Record Queries
function recordView(string memory _healthID, address _viewer, string memory _facilityID) public;
function getRecords(string memory _healthID) public view returns (HealthRecord[] memory);
function getAuditTrail(string memory _healthID) public view returns (AuditEntry[] memory);
function getPermissions(string memory _healthID) public view returns (Permission[] memory);
```

### Events Logged On-Chain
```solidity
event PatientRegistered(string indexed healthID, address indexed wallet, string name, uint256 timestamp);
event RecordAdded(string indexed healthID, string recordHash, string facilityID, string metadataURI, uint256 timestamp);
event AccessGranted(string indexed healthID, address indexed grantedTo, uint256 expiresAt, uint256 timestamp);
event AccessRevoked(string indexed healthID, address indexed revokedFrom, uint256 timestamp);
event RecordViewed(string indexed healthID, address indexed viewer, string facilityID, uint256 timestamp);
event BreakGlassUsed(string indexed healthID, address indexed clinician, string facilityID, string reason, uint256 timestamp);
event EmergencyAccessGranted(string indexed healthID, address indexed clinician, uint256 expiresAt, uint256 timestamp);
event EmergencyAccessRevoked(string indexed healthID, address indexed clinician, uint256 timestamp);
event ReferralAccepted(string indexed healthID, string fromHospital, string toHospital, string respondedBy, uint256 timestamp);
```

---

## 10. Known Fixes & Implementation Notes

### Access History Tab — DB Fallback
**Problem:** `patient_activity_story` called `contract.functions.getAuditTrail().call()`. If the blockchain node was unreachable, it returned HTTP 503 and the frontend showed a blank tab with an error.

**Fix:** The view now catches all blockchain exceptions and builds a story from PostgreSQL instead:
- Patient registration timestamp
- All medical records (with stored `tx_hash` if anchored)
- All access grants and break-glass events
- All accepted referrals

The response includes `"source": "db"`. The frontend shows an amber banner instead of an error, while still displaying Etherscan links for events with a real transaction hash.

### Referrals UI — Premium Redesign
The plain Referrals tab was replaced with a fully featured premium UI:
- 4 stat cards (Total / Accepted / Pending / Declined)
- Color-coded referral cards with left accent stripe and status timeline
- "Blockchain-secured" indigo badge on each card
- Gradient request modal with animated send button

### Patient Health Summary — All Conditions
`computeHealthSummary()` was fixed to aggregate **all** diseases, diagnoses, and hospital visits across the complete record set — not just the first record.

### Python Virtual Environment
Always use `source venv/bin/activate` before any backend Python command. System Python (`/bin/python`) does not have `eth_account`, `web3`, or `djangorestframework` installed.

---

## 11. Verification & Testing

### Backend Unit & Integration Tests
```bash
cd backend/afyatrust
source ../venv/bin/activate
python manage.py test api
```

### Simulated PoC Tamper Demonstration
```bash
cd backend/afyatrust
python manage.py shell -c "from api.test_poc_flow import run; run()"
```

### Smart Contract Tests
```bash
cd blockchain
npx hardhat test
```

### Frontend Production Build
```bash
cd frontend
npm run build
```

---

## 12. Production Roadmap

1. **Hyperledger Fabric Transition:**  
   Move from Ethereum Sepolia to a private, permissioned Hyperledger Fabric channel for national health authorities.

2. **National Health Insurance Integration:**  
   Integrate verification proofs with NHIF / universal health coverage to prevent duplicate claims and fraudulent billing.

3. **SMS / USSD Two-Factor Authentication:**  
   Feature-phone accessible 2FA for patient consent via USSD codes — critical for low-connectivity rural settings.

4. **Zero-Knowledge Proofs (ZKP):**  
   ZK-SNARKs for clinical assertions (e.g., proving a patient is vaccinated without revealing diagnosis history).

5. **Real-Time WebSocket Alerts:**  
   Replace the 15-second polling loop with persistent WebSocket connections for instant break-glass and access-request notifications.

6. **Offline-First Mobile App:**  
   Progressive Web App (PWA) or React Native client for community health workers with offline record capture and background sync.

