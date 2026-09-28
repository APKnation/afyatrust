export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  contractAddress: '0x...PASTE_YOUR_ADDRESS_HERE',
  chainId: 11155111,
  contractABI: [
    // Paste the full ABI from blockchain/artifacts/contracts/AfyaTrust.sol/AfyaTrust.json
    // For example:
    "function registerPatient(string,address,string) public",
    "function getMyRecords() public view returns (tuple(string,string,string,string,uint256)[])",
    "function getMyAuditTrail() public view returns (tuple(string,address,string,string,string,uint256)[])",
    "function patientGrantAccess(string,address,uint256) public",
    "function patientRevokeAccess(string,address) public",
    "function doctorGrantAccess(string,address,uint256,string) public",
    "function hasAccess(string,address) public view returns (bool)",
    "function breakGlass(string,string,string) public",
    "function recordView(string,string) public",
    "function addRecord(string,string,string,string) public",
    "function getPermissions(string) public view returns (tuple(string,address,address,string,uint256,bool)[])",
    "function getAuditTrail(string) public view returns (tuple(string,address,string,string,string,uint256)[])",
    "function getRecords(string) public view returns (tuple(string,string,string,string,uint256)[])"
  ]
};