const { expect } = require("chai");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("AfyaTrust", function () {
  /** The deployer is ADMIN only (constructor). Production grants the backend
   * wallet FACILITY + OPERATOR and each approved doctor CLINICIAN_ROLE, so the
   * fixture mirrors that — without those roles every flow below reverts. */
  async function deployFixture() {
    const [facility, patient, doctor, other] = await ethers.getSigners();
    const AfyaTrust = await ethers.getContractFactory("AfyaTrust");
    const trust = await AfyaTrust.deploy();
    await trust.waitForDeployment();

    await trust.grantRole(facility.address, await trust.FACILITY_ROLE());
    await trust.grantRole(facility.address, await trust.OPERATOR_ROLE());
    await trust.grantRole(doctor.address, await trust.CLINICIAN_ROLE());

    return { trust, facility, patient, doctor, other };
  }

  /** Register H-1 with `wallet` as the patient's custodial wallet. */
  async function registerPatient(trust, facility, healthID, wallet) {
    await trust
      .connect(facility)
      .registerPatient(healthID, wallet);
  }

  it("stores no patient name and emits only the opaque patient reference", async function () {
    const { trust, facility, patient } = await loadFixture(deployFixture);
    const patientRef = "pt_opaque_reference";

    await expect(
      trust.connect(facility).registerPatient(patientRef, patient.address),
    )
      .to.emit(trust, "PatientRegistered")
      .withArgs(patientRef, patient.address);

    const registered = await trust.getPatient(patientRef);
    expect(registered.wallet).to.equal(patient.address);
    expect(registered.exists).to.equal(true);
    expect(registered.fullName).to.equal(undefined);
  });

  it("registers a patient and honors a normal grant", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    // Patient-signed grants are submitted by the operator wallet.
    await trust.patientGrantAccess("H-1", patient.address, doctor.address, 7);
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
  });

  it("denies access before break-glass", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
  });

  it("break-glass opens a real 1-hour emergency permission", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);

    await expect(
      trust.breakGlass("H-1", doctor.address, "FAC-1", "emergency surgery")
    )
      .to.emit(trust, "EmergencyAccessGranted")
      .withArgs("H-1", doctor.address, anyCloseToExpiry())
      .and.to.emit(trust, "BreakGlassUsed")
      .withArgs("H-1", doctor.address, "FAC-1", "emergency surgery");

    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
    expect(
      await trust.emergencyAccessRemaining("H-1", doctor.address)
    ).to.be.gt(3500); // ~1 hour
    // recordView (used for the audit log) now passes for the clinician.
    await expect(trust.recordView("H-1", doctor.address, "FAC-1")).to.not.be
      .reverted;
  });

  it("emergency permission expires after 1 hour", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "reason");

    await time.increase(3601);
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
    expect(
      await trust.emergencyAccessRemaining("H-1", doctor.address)
    ).to.equal(0);
    await expect(trust.recordView("H-1", doctor.address, "FAC-1")).to.be.revertedWith(
      "No access permission"
    );
  });

  it("emergency access is scoped per clinician", async function () {
    const { trust, facility, patient, doctor, other } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "reason");
    expect(await trust.hasAccess("H-1", other.address)).to.equal(false);
  });

  it("emergency access is scoped per patient", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await registerPatient(trust, facility, "H-2", patient.address);
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "reason");
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
    expect(await trust.hasAccess("H-2", doctor.address)).to.equal(false);
  });

  it("rejects break-glass from a wallet without CLINICIAN_ROLE", async function () {
    const { trust, facility, patient, other } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await expect(
      trust.breakGlass("H-1", other.address, "FAC-1", "reason")
    ).to.be.revertedWith("Clinician is not authorized");
    expect(await trust.hasAccess("H-1", other.address)).to.equal(false);
  });

  it("rejects break-glass without a documented reason", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await expect(
      trust.breakGlass("H-1", doctor.address, "FAC-1", "")
    ).to.be.revertedWith("Emergency reason required");
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
  });

  it("only the operator wallet may submit break-glass", async function () {
    const { trust, facility, patient, doctor, other } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await expect(
      trust.connect(other).breakGlass("H-1", doctor.address, "FAC-1", "reason")
    ).to.be.revertedWith("Not authorized: operator only");
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
  });

  it("rejects break-glass for an unknown patient", async function () {
    const { trust, doctor } = await loadFixture(deployFixture);
    await expect(
      trust.breakGlass("H-MISSING", doctor.address, "FAC-1", "reason")
    ).to.be.revertedWith("Patient does not exist");
  });

  it("operator can revoke emergency access before the hour ends", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "unconscious patient");

    await expect(trust.revokeEmergencyAccess("H-1", doctor.address))
      .to.emit(trust, "EmergencyAccessRevoked")
      .withArgs("H-1", doctor.address);

    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
    expect(
      await trust.emergencyAccessRemaining("H-1", doctor.address)
    ).to.equal(0);
    await expect(
      trust.revokeEmergencyAccess("H-1", doctor.address)
    ).to.be.revertedWith("No active emergency access");
    await expect(trust.recordView("H-1", doctor.address, "FAC-1")).to.be.revertedWith(
      "No access permission"
    );
  });

  it("patient grants are refused for wallets without CLINICIAN_ROLE", async function () {
    const { trust, facility, patient, other } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await expect(
      trust.patientGrantAccess("H-1", patient.address, other.address, 7)
    ).to.be.revertedWith("Recipient is not an authorized clinician");
  });

  it("re-granting refreshes the same permission instead of stacking a copy", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    await trust.patientGrantAccess("H-1", patient.address, doctor.address, 7);
    await trust.patientGrantAccess("H-1", patient.address, doctor.address, 30);

    const permissions = await trust.getPermissions("H-1");
    expect(permissions.length).to.equal(1);
    const refreshed = await time.latest() + 30 * 86400;
    expect(Number(permissions[0].expiry)).to.be.closeTo(refreshed, 120);
  });

  it("revoking clears every active grant for that doctor", async function () {
    const { trust, facility, patient, doctor } = await loadFixture(deployFixture);
    await registerPatient(trust, facility, "H-1", patient.address);
    // First grant, then let it expire so the second grant appends instead of
    // refreshing — that is exactly how duplicate entries used to accumulate.
    await trust.patientGrantAccess("H-1", patient.address, doctor.address, 7);
    await time.increase(7 * 86400 + 60);
    await trust.patientGrantAccess("H-1", patient.address, doctor.address, 7);
    expect((await trust.getPermissions("H-1")).length).to.equal(2);
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);

    await trust.patientRevokeAccess("H-1", patient.address, doctor.address);

    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
    const permissions = await trust.getPermissions("H-1");
    expect(permissions.every((p) => p.isActive === false)).to.equal(true);
  });
});

/** The expiry emitted with EmergencyAccessGranted is now + 1h with rounding
 * slack for block time; match any plausible value. */
function anyCloseToExpiry() {
  return (expiry) => expiry > Math.floor(Date.now() / 1000);
}
