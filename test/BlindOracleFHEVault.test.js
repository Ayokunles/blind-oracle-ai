const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlindOracleFHEVault", function () {
  let fheVault;
  let owner;
  let user;
  let other;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    const BlindOracleFHEVault = await ethers.getContractFactory("BlindOracleFHEVault");
    fheVault = await BlindOracleFHEVault.deploy();
    await fheVault.waitForDeployment();
  });

  it("deploys as a separate FHE-native private ledger", async function () {
    expect(await fheVault.owner()).to.not.equal(ethers.ZeroAddress);
    expect(await fheVault.hasPrivateVault(user.address)).to.equal(false);
    expect(await fheVault.totalVaults()).to.equal(0);
  });

  it("does not expose plaintext balance getters", async function () {
    const fragmentNames = fheVault.interface.fragments
      .filter((fragment) => fragment.type === "function")
      .map((fragment) => fragment.name);

    expect(fragmentNames).to.include("getEncryptedBalanceHandle");
    expect(fragmentNames).to.include("grantBalanceAccess");
    expect(fragmentNames).to.not.include("getBalance");
  });

  it("supports owner-managed compliance allowlisting", async function () {
    expect(await fheVault.complianceRequired()).to.equal(false);
    expect(await fheVault.isAllowed(owner.address)).to.equal(true);
    expect(await fheVault.isAllowed(user.address)).to.equal(false);

    await expect(fheVault.connect(user).setComplianceRequired(true)).to.be.revertedWith("Only owner");

    await expect(fheVault.setComplianceRequired(true))
      .to.emit(fheVault, "ComplianceRequiredSet")
      .withArgs(true);

    await expect(fheVault.connect(other).setUserAllowed(user.address, true)).to.be.revertedWith("Only owner");

    await expect(fheVault.setUserAllowed(user.address, true))
      .to.emit(fheVault, "UserAllowedSet")
      .withArgs(user.address, true);

    expect(await fheVault.isAllowed(user.address)).to.equal(true);
  });
});
