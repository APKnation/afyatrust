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


def facility_address() -> str:
    """The operator wallet that pays gas (also the fallback clinician id)."""
    if not FACILITY_PRIVATE_KEY or FACILITY_PRIVATE_KEY.startswith("0x..."):
        return ""
    return w3.eth.account.from_key(FACILITY_PRIVATE_KEY).address


def _eip1559_fees() -> dict:
    """EIP-1559 fees with headroom so txs stay valid as the base fee drifts.

    A plain gas_price snapshot can go stale within seconds on Sepolia and
    leave transactions stuck in the mempool.
    """
    base = w3.eth.get_block("latest").get("baseFeePerGas") or w3.eth.gas_price
    priority = w3.to_wei(1, "gwei")
    return {
        "maxFeePerGas": int(base * 2) + priority,
        "maxPriorityFeePerGas": priority,
    }


def send_transaction(function_call, signer_private_key: str = "") -> str:
    """Sign and send a transaction.

    Defaults to the facility wallet (facility actions). Pass a patient's
    decrypted custodial key to sign as the patient (grants/revokes), because
    the contract attributes those permissions to the patient wallet itself.
    """
    key = signer_private_key or FACILITY_PRIVATE_KEY
    if not key or key.startswith("0x..."):
        raise RuntimeError("Signer private key is not configured in backend/.env")

    account = w3.eth.account.from_key(key)
    tx = function_call.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 500_000,
        **_eip1559_fees(),
    })

    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return "0x" + receipt.transactionHash.hex()


def ensure_gas(patient_address: str) -> str:
    """Custodial patient wallets start empty, so the facility tops up gas
    before the patient signs their own grant/revoke transaction."""
    if not FACILITY_PRIVATE_KEY or FACILITY_PRIVATE_KEY.startswith("0x..."):
        raise RuntimeError("FACILITY_PRIVATE_KEY is not set in backend/.env")

    facility = w3.eth.account.from_key(FACILITY_PRIVATE_KEY)
    to = Web3.to_checksum_address(patient_address)
    if w3.eth.get_balance(to) >= w3.to_wei(0.005, "ether"):
        return ""  # already funded

    tx = {
        "from": facility.address,
        "to": to,
        "value": w3.to_wei(0.01, "ether"),
        "nonce": w3.eth.get_transaction_count(facility.address),
        "gas": 21_000,
        "chainId": w3.eth.chain_id,  # EIP-155 required by public RPCs
        **_eip1559_fees(),
    }
    signed = w3.eth.account.sign_transaction(tx, FACILITY_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    return "0x" + tx_hash.hex()
