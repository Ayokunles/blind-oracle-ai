const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("BlindOracle demo contracts", function () {
  let vault;
  let analyst;
  let token;
  let owner;
  let user;
  let other;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    const MockRWAToken = await ethers.getContractFactory("MockRWAToken");
    token = await MockRWAToken.deploy(
      "Mock T-Bill",
      "MTBILL",
      "T-Bill",
      "Mock Treasury Bill token for testing"
    );
    await token.waitForDeployment();

    const BlindOracleVault = await ethers.getContractFactory("BlindOracleVault");
    vault = await BlindOracleVault.deploy(await token.getAddress());
    await vault.waitForDeployment();

    const BlindOracleAnalyst = await ethers.getContractFactory("BlindOracleAnalyst");
    analyst = await BlindOracleAnalyst.deploy(await vault.getAddress());
    await analyst.waitForDeployment();
  });

  it("creates a vault and moves token balances on deposit and withdraw", async function () {
    await token.connect(user).mintToSelf(ethers.parseEther("1000"));
    await vault.connect(user).createVault(0);

    expect(await vault.hasVault(user.address)).to.equal(true);
    expect(await vault.connect(user).getBalance()).to.equal(0);
    expect(await vault.getDepositCount(user.address)).to.equal(0);

    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("250"));
    await vault.connect(user).deposit(250);
    expect(await vault.connect(user).getBalance()).to.equal(250);
    expect(await vault.getDepositCount(user.address)).to.equal(1);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("750"));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("250"));

    await vault.connect(user).withdraw(200);
    expect(await vault.connect(user).getBalance()).to.equal(50);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseEther("950"));
    expect(await token.balanceOf(await vault.getAddress())).to.equal(ethers.parseEther("50"));
  });

  it("prevents duplicate vaults and over-withdrawals", async function () {
    await vault.connect(user).createVault(0);

    await expect(vault.connect(user).createVault(1)).to.be.revertedWith("Vault already exists");
    await expect(vault.connect(user).withdraw(1)).to.be.revertedWith("Insufficient balance");
  });

  it("supports owner-managed compliance allowlisting", async function () {
    await expect(vault.connect(user).setComplianceRequired(true)).to.be.revertedWith("Only owner");

    await expect(vault.setComplianceRequired(true))
      .to.emit(vault, "ComplianceRequiredSet")
      .withArgs(true);

    await expect(vault.connect(user).createVault(0)).to.be.revertedWith("User not allowlisted");

    await expect(vault.setUserAllowed(user.address, true))
      .to.emit(vault, "UserAllowedSet")
      .withArgs(user.address, true);

    await vault.connect(user).createVault(0);
    await token.connect(user).mintToSelf(ethers.parseEther("100"));
    await token.connect(user).approve(await vault.getAddress(), ethers.parseEther("25"));
    await vault.connect(user).deposit(25);

    await expect(vault.connect(other).setUserAllowed(user.address, false)).to.be.revertedWith("Only owner");
  });

  it("lets only vault owners submit analyst queries", async function () {
    await expect(analyst.connect(user).submitQuery("balance")).to.be.revertedWith("No vault found");

    await vault.connect(user).createVault(0);
    await expect(analyst.connect(user).submitQuery("balance"))
      .to.emit(analyst, "QuerySubmitted")
      .withArgs(0, user.address, "balance", anyValue);

    const [queryUser, queryType, responded] = await analyst.getQueryDetails(0);
    expect(queryUser).to.equal(user.address);
    expect(queryType).to.equal("balance");
    expect(responded).to.equal(false);
  });
});
