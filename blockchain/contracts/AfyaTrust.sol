// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AfyaTrust {
    
    struct Patient {
        string healthID;
        address wallet;
        string fullName;
        uint256 registeredAt;
        bool isActive;
    }
    
    struct HealthRecord {
        string healthID;
        string recordHash;
        string facilityID;
        string metadataURI;
        uint256 timestamp;
    }
    
    struct AccessPermission {
        string healthID;
        address grantedTo;
        address grantedBy;
        string grantedByRole;
        uint256 expiry;
        bool isActive;
    }
    
    struct AuditEvent {
        string healthID;
        address accessor;
        string accessorRole;
        string facilityID;
        string action;
        uint256 timestamp;
    }
    
    mapping(string => Patient) public patients;
    mapping(address => string) public walletToHealthID;
    mapping(string => HealthRecord[]) public patientRecords;
    mapping(string => AccessPermission[]) public permissions;
    mapping(string => AuditEvent[]) public auditTrails;
    
    event PatientRegistered(string healthID, address wallet);
    event RecordAdded(string healthID, string facilityID, string hash);
    event AccessGranted(string healthID, address grantedTo, address grantedBy, string role);
    event AccessRevoked(string healthID, address revokedFrom);
    event RecordViewed(string healthID, address viewer, string facilityID);
    event BreakGlassUsed(string healthID, address clinician, string reason);
    
    modifier onlyPatient(string memory _healthID) {
        require(patients[_healthID].wallet == msg.sender, "Wewe si mgonjwa huyu");
        _;
    }
    
    function registerPatient(
        string memory _healthID,
        address _patientWallet,
        string memory _fullName
    ) public {
        require(patients[_healthID].wallet == address(0), "Mgonjwa tayari amesajiliwa");
        
        patients[_healthID] = Patient({
            healthID: _healthID,
            wallet: _patientWallet,
            fullName: _fullName,
            registeredAt: block.timestamp,
            isActive: true
        });
        
        walletToHealthID[_patientWallet] = _healthID;
        emit PatientRegistered(_healthID, _patientWallet);
        _logAudit(_healthID, msg.sender, "FACILITY", "", "PATIENT_REGISTERED");
    }
    
    function getMyRecords() public view returns (HealthRecord[] memory) {
        string memory healthID = walletToHealthID[msg.sender];
        require(bytes(healthID).length > 0, "Wewe si mgonjwa aliyesajiliwa");
        return patientRecords[healthID];
    }
    
    function getMyAuditTrail() public view returns (AuditEvent[] memory) {
        string memory healthID = walletToHealthID[msg.sender];
        require(bytes(healthID).length > 0, "Wewe si mgonjwa aliyesajiliwa");
        return auditTrails[healthID];
    }
    
    function patientGrantAccess(
        string memory _healthID,
        address _doctorWallet,
        uint256 _durationDays
    ) public onlyPatient(_healthID) {
        permissions[_healthID].push(AccessPermission({
            healthID: _healthID,
            grantedTo: _doctorWallet,
            grantedBy: msg.sender,
            grantedByRole: "PATIENT",
            expiry: block.timestamp + (_durationDays * 1 days),
            isActive: true
        }));
        
        emit AccessGranted(_healthID, _doctorWallet, msg.sender, "PATIENT");
        _logAudit(_healthID, msg.sender, "PATIENT", "", "GRANTED_TO_DOCTOR");
    }
    
    function patientRevokeAccess(
        string memory _healthID,
        address _doctorWallet
    ) public onlyPatient(_healthID) {
        for (uint i = 0; i < permissions[_healthID].length; i++) {
            if (permissions[_healthID][i].grantedTo == _doctorWallet 
                && permissions[_healthID][i].isActive) {
                permissions[_healthID][i].isActive = false;
                break;
            }
        }
        
        emit AccessRevoked(_healthID, _doctorWallet);
        _logAudit(_healthID, msg.sender, "PATIENT", "", "REVOKED_DOCTOR");
    }
    
    function doctorGrantAccess(
        string memory _healthID,
        address _doctorBWallet,
        uint256 _durationDays,
        string memory _facilityID
    ) public {
        require(hasAccess(_healthID, msg.sender), "Wewe huna ruhusa ya kutoa ruhusa");
        
        permissions[_healthID].push(AccessPermission({
            healthID: _healthID,
            grantedTo: _doctorBWallet,
            grantedBy: msg.sender,
            grantedByRole: "DOCTOR",
            expiry: block.timestamp + (_durationDays * 1 days),
            isActive: true
        }));
        
        emit AccessGranted(_healthID, _doctorBWallet, msg.sender, "DOCTOR");
        _logAudit(_healthID, msg.sender, "DOCTOR", _facilityID, "DOCTOR_GRANTED_TO_DOCTOR");
    }
    
    function hasAccess(string memory _healthID, address _doctor) public view returns (bool) {
        if (patients[_healthID].wallet == _doctor) return true;
        
        for (uint i = 0; i < permissions[_healthID].length; i++) {
            AccessPermission memory p = permissions[_healthID][i];
            if (p.grantedTo == _doctor && p.isActive && p.expiry > block.timestamp) {
                return true;
            }
        }
        return false;
    }
    
    function breakGlass(
        string memory _healthID,
        string memory _facilityID,
        string memory _reason
    ) public {
        emit BreakGlassUsed(_healthID, msg.sender, _reason);
        _logAudit(_healthID, msg.sender, "DOCTOR", _facilityID, "BREAK_GLASS");
    }
    
    function recordView(string memory _healthID, string memory _facilityID) public {
        require(hasAccess(_healthID, msg.sender), "Huna ruhusa");
        
        string memory role = patients[_healthID].wallet == msg.sender 
            ? "PATIENT" : "DOCTOR";
        
        _logAudit(_healthID, msg.sender, role, _facilityID, "VIEW");
        emit RecordViewed(_healthID, msg.sender, _facilityID);
    }
    
    function addRecord(
        string memory _healthID,
        string memory _recordHash,
        string memory _facilityID,
        string memory _metadataURI
    ) public {
        patientRecords[_healthID].push(HealthRecord({
            healthID: _healthID,
            recordHash: _recordHash,
            facilityID: _facilityID,
            metadataURI: _metadataURI,
            timestamp: block.timestamp
        }));
        
        emit RecordAdded(_healthID, _facilityID, _recordHash);
        _logAudit(_healthID, msg.sender, "FACILITY", _facilityID, "RECORD_ADDED");
    }
    
    function getPermissions(string memory _healthID) 
        public view returns (AccessPermission[] memory) {
        return permissions[_healthID];
    }
    
    function getAuditTrail(string memory _healthID) 
        public view returns (AuditEvent[] memory) {
        return auditTrails[_healthID];
    }
    
    function getRecords(string memory _healthID) 
        public view returns (HealthRecord[] memory) {
        return patientRecords[_healthID];
    }
    
    function _logAudit(
        string memory _healthID,
        address _accessor,
        string memory _role,
        string memory _facilityID,
        string memory _action
    ) private {
        auditTrails[_healthID].push(AuditEvent({
            healthID: _healthID,
            accessor: _accessor,
            accessorRole: _role,
            facilityID: _facilityID,
            action: _action,
            timestamp: block.timestamp
        }));
    }
}