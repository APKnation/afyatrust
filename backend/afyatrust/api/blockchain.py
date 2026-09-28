"""Sepolia connection and transaction helper.

The contract object is created lazily so that auth/registration endpoints
still work before CONTRACT_ADDRESS is configured.
"""
import json
import os

from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

w3 = Web3(Web3.HTTPProvider(os.getenv("SEPOLIA_RPC_URL", "")))

CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")
FACILITY_PRIVATE_KEY = os.getenv("FACILITY_PRIVATE_KEY", "")

# ABI copied from blockchain/artifacts/.../AfyaTrust.json
ABI_PATH = os.path.join(os.path.dirname(__file__), "afyatrust_abi.json")
with open(ABI_PATH) as f:
    CONTRACT_ABI = json.load(f)["abi"]


def get_contract():
    """Create the contract wrapper on first use."""
    if not CONTRACT_ADDRESS or CONTRACT_ADDRESS.startswith("0x..."):
        raise RuntimeError("CONTRACT_ADDRESS is not set in backend/.env")
    return w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)


class _LazyContract:
    """Delegates attribute access to the real contract, created on demand."""

    def __getattr__(self, name):
        return getattr(get_contract(), name)


contract = _LazyContract()


def send_transaction(function_call) -> str:
    """Sign and send a transaction with the facility wallet (facility pays gas)."""
    if not FACILITY_PRIVATE_KEY or FACILITY_PRIVATE_KEY.startswith("0x..."):
        raise RuntimeError("FACILITY_PRIVATE_KEY is not set in backend/.env")

    facility_account = w3.eth.account.from_key(FACILITY_PRIVATE_KEY)
    tx = function_call.build_transaction({
        "from": facility_account.address,
        "nonce": w3.eth.get_transaction_count(facility_account.address),
        "gas": 500_000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, FACILITY_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return receipt.transactionHash.hex()
