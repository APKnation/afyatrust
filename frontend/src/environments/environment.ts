export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  // Sepolia testnet (free PoC chain)
  chainId: 11155111,
  chainName: 'Sepolia',
  etherscanUrl: 'https://sepolia.etherscan.io',
 contractAddress: '0x3adB53408Ab9a17fd7a3df5C4edB78EB0668443e',
  contractABI: [
    'function registerPatient(string,address,string) public',
    'function addRecord(string,string,string,string) public',
    'function patientGrantAccess(string,address,address,uint256) public',
    'function patientRevokeAccess(string,address,address) public',
    'function hasAccess(string,address) public view returns (bool)',
    'function recordView(string,address,string) public',
    'function breakGlass(string,address,string,string) public',
    'function getRecords(string) public view returns (tuple(string,string,string,uint256)[])',
    'function getAuditTrail(string) public view returns (tuple(address,string,string,string,uint256)[])',
    'function getPermissions(string) public view returns (tuple(address,address,string,uint256,bool)[])',
  ],
};
