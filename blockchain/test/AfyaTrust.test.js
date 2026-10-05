const { expect } = require("chai");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("AfyaTrust", function () {
  async function deployFixture() {
    const [facility, patient, doctor, other] = await ethers.getSigners();
    const AfyaTrust = await ethers.getContractFactory("AfyaTrust");
    const trust = await AfyaTrust.deploy();
    await trust.waitForDeployment();
    return { trust, facility, patient, doctor, other };
  }

  it("registers a patient and honors a normal grant", async function () {
    const { trust, patient, doctor } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");
    await trust
      .connect(patient)
      .patientGrantAccess("H-1", patient.address, doctor.address, 7);
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
  });

  it("denies access before break-glass", async function () {
    const { trust, patient, doctor } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(false);
  });

  it("break-glass opens a real 1-hour emergency permission", async function () {
    const { trust, patient, doctor } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");

    await expect(
      trust.breakGlass("H-1", doctor.address, "FAC-1", "emergency surgery")
    )
      .to.emit(trust, "EmergencyAccessGranted")
      .withArgs("H-1", doctor.address, anyCloseToExpiry());

    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
    expect(
      await trust.emergencyAccessRemaining("H-1", doctor.address)
    ).to.be.gt(3500); // ~1 hour
    // recordView (used for the audit log) now passes for the clinician.
    await expect(trust.recordView("H-1", doctor.address, "FAC-1")).to.not.be
      .reverted;
  });

  it("emergency permission expires after 1 hour", async function () {
    const { trust, patient, doctor } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");
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
    const { trust, patient, doctor, other } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "reason");
    expect(await trust.hasAccess("H-1", other.address)).to.equal(false);
  });

  it("emergency access is scoped per patient", async function () {
    const { trust, patient, doctor } = await loadFixture(deployFixture);
    await trust.connect(patient).registerPatient("H-1", patient.address, "Jane");
    await trust.connect(patient).registerPatient("H-2", patient.address, "John");
    await trust.breakGlass("H-1", doctor.address, "FAC-1", "reason");
    expect(await trust.hasAccess("H-1", doctor.address)).to.equal(true);
    expect(await trust.hasAccess("H-2", doctor.address)).to.equal(false);
  });
});

/** The expiry emitted with EmergencyAccessGranted is now + 1h with rounding
 * slack for block time; match any plausible value. */
function anyCloseToExpiry() {
  return (expiry) => expiry > Math.floor(Date.now() / 1000);
}
