export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  // Sepolia testnet (free PoC chain)
  chainId: 11155111,
  chainName: 'Sepolia',
  etherscanUrl: 'https://sepolia.etherscan.io',
  // Paste after `npx hardhat run scripts/deploy.js --network sepolia`
  contractAddress: '0x0000000000000000000000000000000000000000',
  contractABI: [
    'function registerPatient(string,address,string) public',
    'function addRecord(string,string,string,string) public',
    'function patientGrantAccess(string,address,uint256) public',
    'function patientRevokeAccess(string,address) public',
    'function hasAccess(string,address) public view returns (bool)',
    'function recordView(string,string) public',
    'function breakGlass(string,string,string) public',
    'function getRecords(string) public view returns (tuple(string,string,string,uint256)[])',
    'function getAuditTrail(string) public view returns (tuple(address,string,string,string,uint256)[])',
    'function getPermissions(string) public view returns (tuple(address,address,string,uint256,bool)[])',
  ],
};
