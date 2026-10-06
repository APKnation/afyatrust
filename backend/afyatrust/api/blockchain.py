"""Sepolia connection and transaction helper.

The contract object is created lazily so that auth/registration endpoints
still work before CONTRACT_ADDRESS is configured.
"""
import json
import os
import threading
import time
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

# backend/.env is two levels up from this file (api/ -> afyatrust/ -> backend/).
# Loading by explicit path makes this module CWD-independent.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_FILE)

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


# ---------------------------------------------------------------------------
# Small TTL cache for on-chain READS (never for transactions).
#
# A single hasAccess RPC round-trip takes ~2-6s on Sepolia, and the doctor
# record view does one on every call. Permissions only change when someone
# grants/revokes, so caching for a short window is safe: every mutating call
# below invalidates the affected entries immediately.
# ---------------------------------------------------------------------------

_CACHE_TTL_SECONDS = 60
_cache: dict = {}
_cache_lock = threading.Lock()


def cache_get(key: str):
    """Return the cached value for key, or None if absent/expired."""
    with _cache_lock:
        item = _cache.get(key)
        if not item:
            return None
        expires_at, value = item
        if time.monotonic() > expires_at:
            del _cache[key]
            return None
        return value


def cache_set(key: str, value) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic() + _CACHE_TTL_SECONDS, value)


def cache_invalidate(prefix: str) -> None:
    """Drop every cache entry whose key starts with prefix."""
    with _cache_lock:
        for key in [k for k in _cache if k.startswith(prefix)]:
            del _cache[key]


def checksum_address(wallet: str) -> str:
    """Normalize an address for web3.py, which rejects non-checksummed ones.

    Wallets typed into the Django admin are often all-lowercase; without this
    every hasAccess/grant call would raise InvalidAddress and read as denial.
    Returns the input unchanged if it is not a valid address (callers then
    see the normal web3 error).
    """
    wallet = (wallet or "").strip()
    try:
        return Web3.to_checksum_address(wallet)
    except Exception:
        return wallet


def cached_has_access(health_id: str, wallet: str) -> tuple[bool, bool]:
    """hasAccess with a 60s cache. Returns (allowed, chain_ok).

    Key is case-insensitive on the wallet (addresses are checksummed on-chain
    but callers may pass either form).
    """
    key = f"hasAccess:{health_id.strip().lower()}:{wallet.strip().lower()}"
    cached = cache_get(key)
    if cached is not None:
        allowed, chain_ok = cached
        return allowed, True
    try:
        allowed = contract.functions.hasAccess(
            health_id.strip(), checksum_address(wallet)
        ).call()
    except Exception:
        return False, False  # chain unreachable — never cached
    cache_set(key, (allowed, True))
    return allowed, True


def cached_patient_wallet(health_id: str) -> str:
    """patientWallet mapping with the same short TTL."""
    key = f"patientWallet:{health_id.strip().lower()}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    try:
        wallet = contract.functions.patientWallet(health_id).call()
    except Exception:
        return ""
    cache_set(key, wallet)
    return wallet


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
    
    # Estimate gas with 20% buffer
    try:
        estimated = function_call.estimate_gas({"from": account.address})
        gas_limit = int(estimated * 1.2)
    except Exception:
        gas_limit = 800_000  # fallback higher limit
    
    tx = function_call.build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": gas_limit,
        **_eip1559_fees(),
    })

    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return "0x" + receipt.transactionHash.hex()


def send_transaction_async(function_call, signer_private_key: str = "") -> None:
    """Fire-and-forget variant of send_transaction for audit-only writes.

    recordView entries would otherwise hold the doctor's HTTP response for
    the ~10-15s Sepolia receipt wait. The audit still lands on-chain, but if
    the process dies mid-flight that one entry is lost — acceptable for a
    write that is already treated as best-effort by callers.
    """
    threading.Thread(
        target=send_transaction,
        args=(function_call, signer_private_key),
        daemon=True,
    ).start()


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
