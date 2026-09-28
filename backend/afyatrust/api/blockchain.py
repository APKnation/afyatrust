import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

# Connect kwenye Sepolia
w3 = Web3(Web3.HTTPProvider(os.getenv('SEPOLIA_RPC_URL')))

CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS')
FACILITY_PRIVATE_KEY = os.getenv('FACILITY_PRIVATE_KEY')

# Load ABI (copy kutoka blockchain/artifacts/contracts/AfyaTrust.sol/AfyaTrust.json)
ABI_PATH = os.path.join(
    os.path.dirname(__file__), 
    'afyatrust_abi.json'
)

with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)['abi']


class _LazyContract:
    """Create the contract object on first use instead of at import time.

    This keeps auth/registration endpoints working even when the contract
    address is not configured yet.
    """

    def __init__(self, factory):
        self._factory = factory
        self._obj = None

    def _get(self):
        if self._obj is None:
            if not CONTRACT_ADDRESS or CONTRACT_ADDRESS.startswith('0x...'):
                raise RuntimeError('CONTRACT_ADDRESS is not configured in backend/.env')
            self._obj = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
        return self._obj

    def __getattr__(self, name):
        return getattr(self._get(), name)


contract = _LazyContract(lambda: None)

def send_transaction(function_call):
    """Tuma transaction kwenye blockchain"""
    facility_account = w3.eth.account.from_key(FACILITY_PRIVATE_KEY)
    
    tx = function_call.build_transaction({
        'from': facility_account.address,
        'nonce': w3.eth.get_transaction_count(facility_account.address),
        'gas': 500000,
        'gasPrice': w3.eth.gas_price
    })
    
    signed = w3.eth.account.sign_transaction(tx, FACILITY_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    
    return receipt.transactionHash.hex()