import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("Deploying BlindOracle contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  console.log("\nDeploying MockRWAToken...");
  const MockRWAToken = await ethers.getContractFactory("MockRWAToken");
  const mockToken = await MockRWAToken.deploy(
    "Mock T-Bill",
    "MTBILL",
    "T-Bill",
    "Mock Treasury Bill token for testing"
  );
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("MockRWAToken deployed to:", tokenAddress);

  console.log("\nDeploying BlindOracleVault...");
  const BlindOracleVault = await ethers.getContractFactory("BlindOracleVault");
  const vault = await BlindOracleVault.deploy(tokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("BlindOracleVault deployed to:", vaultAddress);

  console.log("\nDeploying BlindOracleAnalyst...");
  const BlindOracleAnalyst = await ethers.getContractFactory("BlindOracleAnalyst");
  const analyst = await BlindOracleAnalyst.deploy(vaultAddress);
  await analyst.waitForDeployment();
  const analystAddress = await analyst.getAddress();
  console.log("BlindOracleAnalyst deployed to:", analystAddress);

  console.log("\nDeploying BlindOracleFHEVault...");
  const BlindOracleFHEVault = await ethers.getContractFactory("BlindOracleFHEVault");
  const fheVault = await BlindOracleFHEVault.deploy();
  await fheVault.waitForDeployment();
  const fheVaultAddress = await fheVault.getAddress();
  console.log("BlindOracleFHEVault deployed to:", fheVaultAddress);

  console.log("\n" + "=".repeat(50));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(50));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);
  console.log("\nContracts:");
  console.log("  MockRWAToken:          ", tokenAddress);
  console.log("  BlindOracleVault:     ", vaultAddress);
  console.log("  BlindOracleAnalyst:   ", analystAddress);
  console.log("  BlindOracleFHEVault:  ", fheVaultAddress);
  console.log("\nNext steps:");
  console.log("1. Mint test tokens: await mockToken.mintToSelf(ethers.parseEther('10000'))");
  console.log("2. Approve vault: await mockToken.approve(vaultAddress, ethers.parseEther('1000'))");
  console.log("3. Create vault: await vault.createVault(0)");
  console.log("4. Deposit tokens: await vault.deposit(1000)");
  console.log("5. Submit query: await analyst.submitQuery('balance')");
  console.log("=".repeat(50));

  const fs = require("fs");
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    BlindOracle: {
      vault: vaultAddress,
      analyst: analystAddress,
      fheVault: fheVaultAddress,
    },
    MockToken: {
      address: tokenAddress,
      symbol: "MTBILL",
    },
    deployer: deployer.address,
    network: network.name || `chainId-${network.chainId}`,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync("deployment-blindoracle.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to deployment-blindoracle.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
