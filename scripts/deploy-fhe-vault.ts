import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying BlindOracleFHEVault from:", deployer.address);

  const BlindOracleFHEVault = await ethers.getContractFactory("BlindOracleFHEVault");
  const fheVault = await BlindOracleFHEVault.deploy();
  await fheVault.waitForDeployment();

  const fheVaultAddress = await fheVault.getAddress();
  console.log("BlindOracleFHEVault deployed to:", fheVaultAddress);

  const deploymentPath = path.join(process.cwd(), "deployment-blindoracle.json");
  const deploymentInfo = fs.existsSync(deploymentPath)
    ? JSON.parse(fs.readFileSync(deploymentPath, "utf8"))
    : {};

  deploymentInfo.BlindOracle = {
    ...(deploymentInfo.BlindOracle || {}),
    fheVault: fheVaultAddress,
  };
  deploymentInfo.deployer = deploymentInfo.deployer || deployer.address;
  deploymentInfo.network = deploymentInfo.network || (await ethers.provider.getNetwork()).name;
  deploymentInfo.updatedAt = new Date().toISOString();

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("Updated deployment-blindoracle.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
