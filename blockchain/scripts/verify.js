// Verify the deployed AfyaTrust contract on Etherscan (no constructor args).
// Usage: npx hardhat run scripts/verify.js --network sepolia --no-compile
// Requires ETHERSCAN_API_KEY in blockchain/.env (free at https://etherscan.io/myapikey).
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  let address = process.argv[2] || "";
  if (!address) {
    try {
      address = fs
        .readFileSync("./contract-address.txt", "utf8")
        .match(/0x[0-9a-fA-F]{40}/)?.[0] || "";
    } catch {
      // contract-address.txt missing
    }
  }
  if (!address) {
    throw new Error(
      "No contract address. Pass it: npx hardhat run scripts/verify.js 0x94a6... --network sepolia"
    );
  }

  if (!process.env.ETHERSCAN_API_KEY) {
    console.log(
      "ETHERSCAN_API_KEY is not set in blockchain/.env — cannot verify.\n" +
        "Get a free key at https://etherscan.io/myapikey and add:\n" +
        "  ETHERSCAN_API_KEY=<key>\n"
    );
    process.exit(1);
  }

  console.log("Verifying AfyaTrust at", address, "on Etherscan...");
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: [], // AfyaTrust takes no constructor args
    });
    console.log("✅ Verified! Read/Write tabs now appear at:");
    console.log(`   https://sepolia.etherscan.io/address/${address}#readContract`);
  } catch (e) {
    if (String(e.message).includes("Already Verified")) {
      console.log("✅ Already verified — nothing to do.");
      console.log(`   https://sepolia.etherscan.io/address/${address}#readContract`);
    } else {
      throw e;
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
