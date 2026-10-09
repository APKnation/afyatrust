// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * AfyaTrust
 *
 * Blockchain Patient Record Access & Audit Layer
 *
 * ON-CHAIN:
 * - Patient registry
 * - Record hashes/pointers
 * - Access permissions
 * - Emergency/Break-Glass permissions
 * - Audit events
 *
 * OFF-CHAIN:
 * - Actual medical/clinical records
 * - Personal/medical documents
 * - Large files
 *
 * IMPORTANT:
 * The backend operator may pay gas on behalf of custodial
 * patient wallets, but authorization is enforced by the contract.
 */
contract AfyaTrust {

    // ============================================================
    // ROLES
    // ============================================================

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant FACILITY_ROLE = keccak256("FACILITY_ROLE");
    bytes32 public constant CLINICIAN_ROLE = keccak256("CLINICIAN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    mapping(address => mapping(bytes32 => bool)) private roles;

    // ============================================================
    // CONSTANTS
    // ============================================================

    uint256 public constant EMERGENCY_PERIOD = 1 hours;

    // ============================================================
    // PATIENT
    // ============================================================

    struct Patient {
        address wallet;
        string fullName;
        bool exists;
    }

    mapping(string => Patient) private patients;

    // ============================================================
    // HEALTH RECORD
    // ============================================================

    struct HealthRecord {
        string recordHash;
        string facilityID;
        string metadataURI;
        uint256 timestamp;
    }

    mapping(string => HealthRecord[]) private records;

    // ============================================================
    // NORMAL ACCESS PERMISSION
    // ============================================================

    struct AccessPermission {
        address grantedTo;
        address grantedBy;
        string grantedByRole;
        uint256 expiry;
        bool isActive;
    }

    mapping(string => AccessPermission[]) private permissions;

    // ============================================================
    // BREAK-GLASS ACCESS
    // ============================================================

    struct EmergencyAccess {
        uint256 expiry;
        bool active;
    }

    /**
     * healthID => clinician => emergency access
     */
    mapping(string => mapping(address => EmergencyAccess))
        private emergencyAccess;

    // ============================================================
    // AUDIT
    // ============================================================

    struct AuditEvent {
        address accessor;
        string accessorRole;
        string facilityID;
        string action;
        uint256 timestamp;
    }

    mapping(string => AuditEvent[]) private auditTrail;

    // ============================================================
    // EVENTS
    // ============================================================

    event PatientRegistered(
        string indexed healthID,
        address indexed wallet,
        string fullName
    );

    event RecordAdded(
        string indexed healthID,
        string facilityID,
        string recordHash
    );

    event AccessGranted(
        string indexed healthID,
        address indexed grantedTo,
        uint256 expiry
    );

    event AccessRevoked(
        string indexed healthID,
        address indexed revokedFrom
    );

    event RecordViewed(
        string indexed healthID,
        address indexed viewer,
        string facilityID
    );

    event BreakGlassUsed(
        string indexed healthID,
        address indexed clinician,
        string facilityID,
        string reason
    );

    event EmergencyAccessGranted(
        string indexed healthID,
        address indexed clinician,
        uint256 expiry
    );

    event EmergencyAccessRevoked(
        string indexed healthID,
        address indexed clinician
    );

    event ReferralAccepted(
        string indexed healthID,
        address indexed clinician,
        string fromFacilityID,
        string toFacilityID
    );

    event RoleGranted(
        address indexed account,
        bytes32 indexed role
    );

    event RoleRevoked(
        address indexed account,
        bytes32 indexed role
    );

    // ============================================================
    // MODIFIERS
    // ============================================================

    modifier onlyAdmin() {
        require(
            roles[msg.sender][ADMIN_ROLE],
            "Not authorized: admin only"
        );
        _;
    }

    modifier onlyFacility() {
        require(
            roles[msg.sender][FACILITY_ROLE],
            "Not authorized: facility only"
        );
        _;
    }

    modifier onlyClinician() {
        require(
            roles[msg.sender][CLINICIAN_ROLE],
            "Not authorized: clinician only"
        );
        _;
    }

    modifier onlyOperator() {
        require(
            roles[msg.sender][OPERATOR_ROLE],
            "Not authorized: operator only"
        );
        _;
    }

    // ============================================================
    // CONSTRUCTOR
    // ============================================================

    constructor() {
        roles[msg.sender][ADMIN_ROLE] = true;

        emit RoleGranted(
            msg.sender,
            ADMIN_ROLE
        );
    }

    // ============================================================
    // ROLE MANAGEMENT
    // ============================================================

    function grantRole(
        address account,
        bytes32 role
    ) external onlyAdmin {

        require(
            account != address(0),
            "Invalid account"
        );

        roles[account][role] = true;

        emit RoleGranted(account, role);
    }

    function revokeRole(
        address account,
        bytes32 role
    ) external onlyAdmin {

        roles[account][role] = false;

        emit RoleRevoked(account, role);
    }

    function hasRole(
        address account,
        bytes32 role
    ) external view returns (bool) {

        return roles[account][role];
    }

    // ============================================================
    // PATIENT REGISTRATION
    // ============================================================

    /**
     * Facility registers a patient.
     *
     * The actual medical data remains off-chain.
     */
    function registerPatient(
        string memory _healthID,
        address _wallet,
        string memory _fullName
    ) external onlyFacility {

        require(
            _wallet != address(0),
            "Invalid patient wallet"
        );

        require(
            !patients[_healthID].exists,
            "Patient already registered"
        );

        patients[_healthID] = Patient({
            wallet: _wallet,
            fullName: _fullName,
            exists: true
        });

        emit PatientRegistered(
            _healthID,
            _wallet,
            _fullName
        );

        _logAudit(
            _healthID,
            msg.sender,
            "FACILITY",
            "",
            "PATIENT_REGISTERED"
        );
    }

    // ============================================================
    // ADD HEALTH RECORD
    // ============================================================

    /**
     * Stores only hash and pointer.
     *
     * Actual clinical record remains at the facility.
     */
    function addRecord(
        string memory _healthID,
        string memory _recordHash,
        string memory _facilityID,
        string memory _metadataURI
    ) external onlyFacility {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        records[_healthID].push(
            HealthRecord({
                recordHash: _recordHash,
                facilityID: _facilityID,
                metadataURI: _metadataURI,
                timestamp: block.timestamp
            })
        );

        emit RecordAdded(
            _healthID,
            _facilityID,
            _recordHash
        );

        _logAudit(
            _healthID,
            msg.sender,
            "FACILITY",
            _facilityID,
            "RECORD_ADDED"
        );
    }

    // ============================================================
    // PATIENT GRANTS ACCESS
    // ============================================================

    /**
     * The operator can submit the transaction on behalf of
     * a custodial patient wallet.
     *
     * _patient must match the patient's registered wallet.
     */
    function patientGrantAccess(
        string memory _healthID,
        address _patient,
        address _doctorWallet,
        uint256 _days
    ) external onlyOperator {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        require(
            _patient == patients[_healthID].wallet,
            "Not the patient wallet"
        );

        require(
            roles[_doctorWallet][CLINICIAN_ROLE],
            "Recipient is not an authorized clinician"
        );

        require(
            _days > 0,
            "Invalid access period"
        );

        uint256 expiry =
            block.timestamp + (_days * 1 days);

        permissions[_healthID].push(
            AccessPermission({
                grantedTo: _doctorWallet,
                grantedBy: _patient,
                grantedByRole: "PATIENT",
                expiry: expiry,
                isActive: true
            })
        );

        emit AccessGranted(
            _healthID,
            _doctorWallet,
            expiry
        );

        _logAudit(
            _healthID,
            _patient,
            "PATIENT",
            "",
            "GRANTED_TO_DOCTOR"
        );
    }

    // ============================================================
    // PATIENT REVOKES ACCESS
    // ============================================================

    function patientRevokeAccess(
        string memory _healthID,
        address _patient,
        address _doctorWallet
    ) external onlyOperator {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        require(
            _patient == patients[_healthID].wallet,
            "Not the patient wallet"
        );

        bool revoked = false;

        for (
            uint256 i = 0;
            i < permissions[_healthID].length;
            i++
        ) {

            if (
                permissions[_healthID][i].grantedTo == _doctorWallet &&
                permissions[_healthID][i].isActive
            ) {

                permissions[_healthID][i].isActive = false;

                revoked = true;

                break;
            }
        }

        require(
            revoked,
            "Active permission not found"
        );

        emit AccessRevoked(
            _healthID,
            _doctorWallet
        );

        _logAudit(
            _healthID,
            _patient,
            "PATIENT",
            "",
            "REVOKED_DOCTOR"
        );
    }

    // ============================================================
    // HAS ACCESS
    // ============================================================

    function hasAccess(
        string memory _healthID,
        address _viewer
    ) public view returns (bool) {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        // Patient always has access.
        if (
            patients[_healthID].wallet == _viewer &&
            _viewer != address(0)
        ) {
            return true;
        }

        // Emergency access.
        EmergencyAccess memory emergency =
            emergencyAccess[_healthID][_viewer];

        if (
            emergency.active &&
            emergency.expiry > block.timestamp
        ) {
            return true;
        }

        // Normal permission.
        for (
            uint256 i = 0;
            i < permissions[_healthID].length;
            i++
        ) {

            AccessPermission memory permission =
                permissions[_healthID][i];

            if (
                permission.grantedTo == _viewer &&
                permission.isActive &&
                permission.expiry > block.timestamp
            ) {
                return true;
            }
        }

        return false;
    }

    // ============================================================
    // RECORD VIEW
    // ============================================================

    /**
     * Logs every record access.
     *
     * The actual record is NOT returned by the blockchain.
     * The backend retrieves it from the facility after
     * authorization succeeds.
     */
    function recordView(
        string memory _healthID,
        address _viewer,
        string memory _facilityID
    ) external onlyOperator {

        require(
            hasAccess(_healthID, _viewer),
            "No access permission"
        );

        string memory role =
            patients[_healthID].wallet == _viewer
                ? "PATIENT"
                : "DOCTOR";

        _logAudit(
            _healthID,
            _viewer,
            role,
            _facilityID,
            "VIEW"
        );

        emit RecordViewed(
            _healthID,
            _viewer,
            _facilityID
        );
    }

    // ============================================================
    // BREAK GLASS
    // ============================================================

    /**
     * Emergency access.
     *
     * Only an authorized clinician can use Break Glass.
     *
     * The operator wallet submits the transaction,
     * but _clinician identifies the real clinician.
     */
    function breakGlass(
        string memory _healthID,
        address _clinician,
        string memory _facilityID,
        string memory _reason
    ) external onlyOperator {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        require(
            roles[_clinician][CLINICIAN_ROLE],
            "Clinician is not authorized"
        );

        require(
            _clinician != address(0),
            "Invalid clinician"
        );

        require(
            bytes(_reason).length > 0,
            "Emergency reason required"
        );

        uint256 expiry =
            block.timestamp + EMERGENCY_PERIOD;

        emergencyAccess[_healthID][_clinician] =
            EmergencyAccess({
                expiry: expiry,
                active: true
            });

        emit BreakGlassUsed(
            _healthID,
            _clinician,
            _facilityID,
            _reason
        );

        emit EmergencyAccessGranted(
            _healthID,
            _clinician,
            expiry
        );

        _logAudit(
            _healthID,
            _clinician,
            "DOCTOR",
            _facilityID,
            "BREAK_GLASS"
        );
    }

    // ============================================================
    // LOG REFERRAL ACCEPTED (transfer of care, on-chain)
    // ============================================================

    /**
     * When Hospital B accepts a referral from Hospital A, this function
     * immutably records the transfer of care on-chain:
     *   - which patient (healthID)
     *   - which clinician at the receiving hospital accepted
     *   - which facility the patient came from
     *   - which facility the patient is going to
     *
     * This is the anchor that proves the referral happened at a specific
     * block timestamp — it cannot be changed later, so no one can rewrite
     * the patient's transfer history.
     *
     * The actual clinical records stay off-chain (with Hospital A), but
     * their hashes are already on-chain via RecordAdded. Hospital B verifies
     * them via the hash, not by trusting Hospital A's word.
     */
    function logReferralAccepted(
        string memory _healthID,
        address _clinician,
        string memory _fromFacilityID,
        string memory _toFacilityID
    ) external onlyOperator {

        require(
            patients[_healthID].exists,
            "Patient does not exist"
        );

        require(
            _clinician != address(0),
            "Invalid clinician"
        );

        require(
            bytes(_fromFacilityID).length > 0,
            "From facility required"
        );

        require(
            bytes(_toFacilityID).length > 0,
            "To facility required"
        );

        emit ReferralAccepted(
            _healthID,
            _clinician,
            _fromFacilityID,
            _toFacilityID
        );

        _logAudit(
            _healthID,
            _clinician,
            "DOCTOR",
            _toFacilityID,
            "REFERRAL_ACCEPTED"
        );
    }

    // ============================================================
    // REVOKE EMERGENCY ACCESS
    // ============================================================

    /**
     * Admin/operator can immediately revoke emergency access
     * before the one-hour period expires.
     */
    function revokeEmergencyAccess(
        string memory _healthID,
        address _clinician
    ) external onlyOperator {

        require(
            emergencyAccess[_healthID][_clinician].active,
            "No active emergency access"
        );

        emergencyAccess[_healthID][_clinician].active = false;
        emergencyAccess[_healthID][_clinician].expiry = 0;

        emit EmergencyAccessRevoked(
            _healthID,
            _clinician
        );

        _logAudit(
            _healthID,
            _clinician,
            "DOCTOR",
            "",
            "EMERGENCY_ACCESS_REVOKED"
        );
    }

    // ============================================================
    // EMERGENCY ACCESS REMAINING
    // ============================================================

    function emergencyAccessRemaining(
        string memory _healthID,
        address _clinician
    ) external view returns (uint256) {

        EmergencyAccess memory emergency =
            emergencyAccess[_healthID][_clinician];

        if (
            !emergency.active ||
            emergency.expiry <= block.timestamp
        ) {
            return 0;
        }

        return emergency.expiry - block.timestamp;
    }

    // ============================================================
    // GET RECORDS
    // ============================================================

    function getRecords(
        string memory _healthID
    )
        external
        view
        returns (HealthRecord[] memory)
    {
        return records[_healthID];
    }

    // ============================================================
    // GET PERMISSIONS
    // ============================================================

    function getPermissions(
        string memory _healthID
    )
        external
        view
        returns (AccessPermission[] memory)
    {
        return permissions[_healthID];
    }

    // ============================================================
    // GET AUDIT TRAIL
    // ============================================================

    function getAuditTrail(
        string memory _healthID
    )
        external
        view
        returns (AuditEvent[] memory)
    {
        return auditTrail[_healthID];
    }

    // ============================================================
    // GET PATIENT
    // ============================================================

    function getPatient(
        string memory _healthID
    )
        external
        view
        returns (
            address wallet,
            string memory fullName,
            bool exists
        )
    {
        Patient memory patient =
            patients[_healthID];

        return (
            patient.wallet,
            patient.fullName,
            patient.exists
        );
    }

    // ============================================================
    // INTERNAL AUDIT FUNCTION
    // ============================================================

    function _logAudit(
        string memory _healthID,
        address _accessor,
        string memory _role,
        string memory _facilityID,
        string memory _action
    ) private {

        auditTrail[_healthID].push(
            AuditEvent({
                accessor: _accessor,
                accessorRole: _role,
                facilityID: _facilityID,
                action: _action,
                timestamp: block.timestamp
            })
        );
    }
}