const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivateAIInference", function () {
  let PrivateAI;
  let privateAI;
  let owner;
  let user;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    PrivateAI = await ethers.getContractFactory("PrivateAIInference");
    privateAI = await PrivateAI.deploy(0);
    await privateAI.waitForDeployment();
  });

  it("Should deploy correctly", async function () {
    expect(await privateAI.owner()).to.equal(owner.address);
    expect(await privateAI.inferenceFee()).to.equal(0);
  });

  it("Should allow setting fee", async function () {
    await privateAI.setFee(ethers.parseEther("0.001"));
    expect(await privateAI.inferenceFee()).to.equal(ethers.parseEther("0.001"));
  });

  it("Should reject query with insufficient fee", async function () {
    await privateAI.setFee(ethers.parseEther("0.001"));

    // Empty arrays for externalEuint and proof (will fail fee check first)
    await expect(
      privateAI.submitQuery([], [])
    ).to.be.revertedWith("Insufficient fee");
  });

  it("Should allow owner to withdraw", async function () {
    await user.sendTransaction({
      to: await privateAI.getAddress(),
      value: ethers.parseEther("0.1"),
    });

    const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
    await privateAI.withdraw();
    const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
    expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
  });
});
