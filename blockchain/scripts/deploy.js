const hre = require("hardhat");

async function main() {
  console.log("Inadeploy AfyaTrust...");
  
  const AfyaTrust = await hre.ethers.getContractFactory("AfyaTrust");
  const afyaTrust = await AfyaTrust.deploy();
  
  await afyaTrust.waitForDeployment();
  
  const address = await afyaTrust.getAddress();
  console.log("✅ AfyaTrust imedeploy kwenye:", address);
  console.log("📋 Copy address hii kwenye .env ya backend!");
  
  // Save address kwenye faili
  const fs = require("fs");
  fs.writeFileSync(
    "./contract-address.txt",
    `CONTRACT_ADDRESS=${address}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});