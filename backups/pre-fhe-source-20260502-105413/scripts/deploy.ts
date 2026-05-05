import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Deploying PrivateAIInference contract...");

  // Get the deployer address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  // Deploy the contract with initial fee of 0 (for demo/testnet)
  const PrivateAI = await ethers.getContractFactory("PrivateAIInference");
  const privateAI = await PrivateAI.deploy(0); // 0 fee for demo

  await privateAI.waitForDeployment();
  const contractAddress = await privateAI.getAddress();

  console.log("✅ Contract deployed to:", contractAddress);
  console.log("\n📝 Next steps:");
  console.log("1. Verify contract on block explorer");
  console.log("2. Update frontend with contract address");
  console.log("3. Test encrypted query flow");

  // Save deployment info
  const fs = require("fs");
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    contractAddress,
    deployer: deployer.address,
    network: network.name || `chainId-${network.chainId}`,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 Deployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
