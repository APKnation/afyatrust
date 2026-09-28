// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// AfyaTrust — minimal PoC contract.
// Stores ONLY: patient registry, record hashes/pointers, permissions, audit events.
// Clinical data stays off-chain at the facility that holds it.

contract AfyaTrust {
    struct HealthRecord {
        string recordHash;   // SHA-256 of the record (off-chain data)
        string facilityID;   // facility holding the record
        string metadataURI;  // pointer to the off-chain record
        uint256 timestamp;
    }

    struct AccessPermission {
        address grantedTo;      // doctor wallet
        address grantedBy;      // who granted (patient wallet or doctor)
        string grantedByRole;   // "PATIENT" or "DOCTOR"
        uint256 expiry;         // unix time
        bool isActive;
    }

    struct AuditEvent {
        address accessor;
        string accessorRole;    // "PATIENT" | "DOCTOR" | "FACILITY"
        string facilityID;
        string action;          // PATIENT_REGISTERED, RECORD_ADDED, VIEW, BREAK_GLASS, ...
        uint256 timestamp;
    }

    mapping(string => address) public patientWallet;      // healthID => custodial wallet
    mapping(string => string) public patientName;         // healthID => full name
    mapping(string => HealthRecord[]) private records;    // healthID => records
    mapping(string => AccessPermission[]) private permissions;
    mapping(string => AuditEvent[]) private auditTrail;

    event PatientRegistered(string healthID, address wallet, string fullName);
    event RecordAdded(string healthID, string facilityID, string recordHash);
    event AccessGranted(string healthID, address grantedTo, uint256 expiry);
    event AccessRevoked(string healthID, address revokedFrom);
    event RecordViewed(string healthID, address viewer, string facilityID);
    event BreakGlassUsed(string healthID, address clinician, string facilityID, string reason);

    // Step 1-2: facility registers a patient and links their Health ID.
    function registerPatient(
        string memory _healthID,
        address _wallet,
        string memory _fullName
    ) public {
        require(patientWallet[_healthID] == address(0), "Patient already registered");
        patientWallet[_healthID] = _wallet;
        patientName[_healthID] = _fullName;
        emit PatientRegistered(_healthID, _wallet, _fullName);
        _logAudit(_healthID, msg.sender, "FACILITY", "", "PATIENT_REGISTERED");
    }

    // Step 3: only hash + pointer go on-chain; data stays at the facility.
    function addRecord(
        string memory _healthID,
        string memory _recordHash,
        string memory _facilityID,
        string memory _metadataURI
    ) public {
        records[_healthID].push(HealthRecord({
            recordHash: _recordHash,
            facilityID: _facilityID,
            metadataURI: _metadataURI,
            timestamp: block.timestamp
        }));
        emit RecordAdded(_healthID, _facilityID, _recordHash);
        _logAudit(_healthID, msg.sender, "FACILITY", _facilityID, "RECORD_ADDED");
    }

    // Step 4: patient authorizes a doctor for N days.
    // _patient is passed explicitly because the backend operator wallet signs
    // on behalf of custodial patient wallets (patients have no MetaMask).
    function patientGrantAccess(
        string memory _healthID,
        address _patient,
        address _doctorWallet,
        uint256 _days
    ) public {
        require(_patient == patientWallet[_healthID], "Not the patient wallet");
        permissions[_healthID].push(AccessPermission({
            grantedTo: _doctorWallet,
            grantedBy: _patient,
            grantedByRole: "PATIENT",
            expiry: block.timestamp + (_days * 1 days),
            isActive: true
        }));
        emit AccessGranted(_healthID, _doctorWallet, block.timestamp + (_days * 1 days));
        _logAudit(_healthID, _patient, "PATIENT", "", "GRANTED_TO_DOCTOR");
    }

    function patientRevokeAccess(
        string memory _healthID,
        address _patient,
        address _doctorWallet
    ) public {
        require(_patient == patientWallet[_healthID], "Not the patient wallet");
        for (uint i = 0; i < permissions[_healthID].length; i++) {
            if (permissions[_healthID][i].grantedTo == _doctorWallet
                && permissions[_healthID][i].isActive) {
                permissions[_healthID][i].isActive = false;
                break;
            }
        }
        emit AccessRevoked(_healthID, _doctorWallet);
        _logAudit(_healthID, _patient, "PATIENT", "", "REVOKED_DOCTOR");
    }

    // Step 5: provider checks authorization (patient's own wallet always has access).
    function hasAccess(string memory _healthID, address _doctor) public view returns (bool) {
        if (patientWallet[_healthID] == _doctor && _doctor != address(0)) return true;
        for (uint i = 0; i < permissions[_healthID].length; i++) {
            AccessPermission memory p = permissions[_healthID][i];
            if (p.grantedTo == _doctor && p.isActive && p.expiry > block.timestamp) {
                return true;
            }
        }
        return false;
    }

    // Step 6: every read is logged on-chain. The backend operator wallet
    // signs, but the real viewer (_viewer) must have access on-chain.
    function recordView(
        string memory _healthID,
        address _viewer,
        string memory _facilityID
    ) public {
        require(hasAccess(_healthID, _viewer), "No access permission");
        string memory role = patientWallet[_healthID] == _viewer ? "PATIENT" : "DOCTOR";
        _logAudit(_healthID, _viewer, role, _facilityID, "VIEW");
        emit RecordViewed(_healthID, _viewer, _facilityID);
    }

    // Step 7: emergency access — allowed for anyone, but permanently logged.
    // The clinician wallet is passed explicitly so the audit log names them,
    // not the operator wallet that pays gas.
    function breakGlass(
        string memory _healthID,
        address _clinician,
        string memory _facilityID,
        string memory _reason
    ) public {
        emit BreakGlassUsed(_healthID, _clinician, _facilityID, _reason);
        _logAudit(_healthID, _clinician, "DOCTOR", _facilityID, "BREAK_GLASS");
    }

    function getRecords(string memory _healthID)
        public view returns (HealthRecord[] memory)
    {
        return records[_healthID];
    }

    function getAuditTrail(string memory _healthID)
        public view returns (AuditEvent[] memory)
    {
        return auditTrail[_healthID];
    }

    function getPermissions(string memory _healthID)
        public view returns (AccessPermission[] memory)
    {
        return permissions[_healthID];
    }

    function _logAudit(
        string memory _healthID,
        address _accessor,
        string memory _role,
        string memory _facilityID,
        string memory _action
    ) private {
        auditTrail[_healthID].push(AuditEvent({
            accessor: _accessor,
            accessorRole: _role,
            facilityID: _facilityID,
            action: _action,
            timestamp: block.timestamp
        }));
    }
}
