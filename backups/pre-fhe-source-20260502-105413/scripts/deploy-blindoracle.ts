import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Deploying BlindOracle contracts...\n");

  // Get the deployer address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  // 1. Deploy Mock RWA Token
  console.log("\n📦 Deploying MockRWAToken...");
  const MockRWAToken = await ethers.getContractFactory("MockRWAToken");
  const mockToken = await MockRWAToken.deploy(
    "Mock T-Bill",
    "MTBILL",
    "T-Bill",
    "Mock Treasury Bill token for testing"
  );
  await mockToken.waitForDeployment();
  const tokenAddress = await mockToken.getAddress();
  console.log("✅ MockRWAToken deployed to:", tokenAddress);

  // 2. Deploy BlindOracle Vault
  console.log("\n🏦 Deploying BlindOracleVault...");
  const BlindOracleVault = await ethers.getContractFactory("BlindOracleVault");
  const vault = await BlindOracleVault.deploy(tokenAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ BlindOracleVault deployed to:", vaultAddress);

  // 3. Deploy BlindOracle Analyst
  console.log("\n🤖 Deploying BlindOracleAnalyst...");
  const BlindOracleAnalyst = await ethers.getContractFactory("BlindOracleAnalyst");
  const analyst = await BlindOracleAnalyst.deploy(vaultAddress);
  await analyst.waitForDeployment();
  const analystAddress = await analyst.getAddress();
  console.log("✅ BlindOracleAnalyst deployed to:", analystAddress);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 DEPLOYMENT SUMMARY");
  console.log("=".repeat(50));
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Deployer:", deployer.address);
  console.log("\nContracts:");
  console.log("  MockRWAToken:     ", tokenAddress);
  console.log("  BlindOracleVault: ", vaultAddress);
  console.log("  BlindOracleAnalyst:", analystAddress);
  console.log("\n📝 Next steps:");
  console.log("1. Mint test tokens: await mockToken.mintToSelf(ethers.parseEther('10000'))");
  console.log("2. Approve vault: await mockToken.approve(vaultAddress, ethers.parseEther('1000'))");
  console.log("3. Create vault: await vault.createVault(0)");
  console.log("4. Deposit tokens: await vault.deposit(1000)");
  console.log("4. Submit query: await analyst.submitQuery('balance')");
  console.log("=".repeat(50));

  // Save deployment info
  const fs = require("fs");
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    BlindOracle: {
      vault: vaultAddress,
      analyst: analystAddress,
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
  console.log("\n💾 Deployment info saved to deployment-blindoracle.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
