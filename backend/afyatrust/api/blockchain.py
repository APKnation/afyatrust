"""Sepolia connection and transaction helper.

The contract object is created lazily so that auth/registration endpoints
still work before CONTRACT_ADDRESS is configured.
"""
import hashlib
import hmac
import json
import logging
import os
import re
import threading
import time
from pathlib import Path

from django.conf import settings
from dotenv import load_dotenv
from web3 import Web3

# backend/.env is two levels up from this file (api/ -> afyatrust/ -> backend/).
# Loading by explicit path makes this module CWD-independent.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_FILE)

logger = logging.getLogger(__name__)

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


def patient_ref(health_id: str) -> str:
    """Return a stable, keyed pseudonym for use in public-chain calls.

    The key must be stable across deployments and must never be stored on-chain.
    """
    canonical_id = (health_id or "").strip().casefold()
    if not canonical_id:
        raise ValueError("A patient Health ID is required")
    secret = getattr(settings, "CHAIN_ID_SECRET", "").strip()
    if not re.fullmatch(r"[a-fA-F0-9]{64}", secret):
        raise RuntimeError("CHAIN_ID_SECRET must be a 32-byte hexadecimal key")
    digest = hmac.new(
        secret.encode("utf-8"),
        canonical_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"pt_{digest}"


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
            patient_ref(health_id), checksum_address(wallet)
        ).call()
    except Exception:
        return False, False  # chain unreachable — never cached
    cache_set(key, (allowed, True))
    return allowed, True


def check_has_access(health_id: str, wallet: str) -> tuple[bool, bool]:
    """Read hasAccess directly for authorization decisions that must be fresh."""
    try:
        allowed = contract.functions.hasAccess(
            patient_ref(health_id), checksum_address(wallet)
        ).call()
    except Exception:
        return False, False
    return bool(allowed), True


def cached_patient_wallet(health_id: str) -> str:
    """getPatient(...).wallet with the same short TTL."""
    key = f"patientWallet:{health_id.strip().lower()}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    try:
        wallet = contract.functions.getPatient(patient_ref(health_id)).call()[0]
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


def _broadcast_transaction(function_call, signer_private_key: str = "", nonce_block: str = "latest"):
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
        "nonce": w3.eth.get_transaction_count(account.address, nonce_block),
        "gas": gas_limit,
        **_eip1559_fees(),
    })

    signed = w3.eth.account.sign_transaction(tx, key)
    return w3.eth.send_raw_transaction(signed.raw_transaction)


def send_transaction(function_call, signer_private_key: str = "") -> str:
    """Sign, send, and wait for a transaction to be mined.

    Raises when the receipt comes back with status 0 — a reverted transaction
    must never be reported to callers as a success (that is how grants used to
    "succeed" while the contract rejected them).
    """
    tx_hash = _broadcast_transaction(function_call, signer_private_key)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt.status != 1:
        raise RuntimeError(f"transaction reverted: 0x{receipt.transactionHash.hex()}")
    return "0x" + receipt.transactionHash.hex()


def send_transaction_pending(function_call, signer_private_key: str = "") -> str:
    """Send a transaction and return its hash without waiting for mining."""
    tx_hash = _broadcast_transaction(function_call, signer_private_key, nonce_block="pending")
    return "0x" + tx_hash.hex()


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


# ---------------------------------------------------------------------------
# Roles + emergency (break-glass) helpers
#
# The contract refuses breakGlass() — and patient-signed grants — for any
# wallet without CLINICIAN_ROLE, so an approved doctor's custodial wallet must
# receive that role or every emergency call reverts and only a local pending
# grant is written.
# ---------------------------------------------------------------------------


def clinician_role_id() -> bytes:
    """keccak256("CLINICIAN_ROLE") — the role break-glass requires."""
    return Web3.keccak(text="CLINICIAN_ROLE")


def admin_role_id() -> bytes:
    return Web3.keccak(text="ADMIN_ROLE")


def facility_role_id() -> bytes:
    return Web3.keccak(text="FACILITY_ROLE")


def operator_role_id() -> bytes:
    return Web3.keccak(text="OPERATOR_ROLE")


ADMIN_ROLE = Web3.keccak(text="ADMIN_ROLE")
FACILITY_ROLE = Web3.keccak(text="FACILITY_ROLE")
OPERATOR_ROLE = Web3.keccak(text="OPERATOR_ROLE")
CLINICIAN_ROLE = Web3.keccak(text="CLINICIAN_ROLE")


def ensure_backend_roles() -> dict:
    """Verifies that the facility wallet has FACILITY_ROLE and OPERATOR_ROLE.
    If the wallet holds ADMIN_ROLE, it automatically grants any missing role."""
    signer = facility_address()
    if not signer:
        return {"status": "error", "message": "Facility wallet not configured"}
    
    results = {}
    is_admin = has_role(signer, ADMIN_ROLE)
    
    for role_name, role_bytes in [("FACILITY_ROLE", FACILITY_ROLE), ("OPERATOR_ROLE", OPERATOR_ROLE), ("CLINICIAN_ROLE", CLINICIAN_ROLE)]:
        has_it = has_role(signer, role_bytes)
        if has_it is True:
            results[role_name] = "already_granted"
        elif has_it is False and is_admin:
            try:
                tx_hash = send_transaction(contract.functions.grantRole(signer, role_bytes))
                results[role_name] = f"granted:{tx_hash}"
            except Exception as e:
                results[role_name] = f"error:{type(e).__name__}"
        else:
            results[role_name] = "missing" if has_it is False else "unknown"
            
    return results


def has_role(account: str, role: bytes):
    """bool, or None when the chain/contract is unreachable."""
    if not account:
        return None
    try:
        return bool(contract.functions.hasRole(checksum_address(account), role).call())
    except Exception:
        return None


def ensure_clinician_role(wallet: str) -> tuple[str, str]:
    """Give an approved doctor's wallet CLINICIAN_ROLE on-chain.

    Returns (status, detail) with status in:
      "granted"           role granted and verified on-chain
      "already"           wallet already held the role
      "no_permission"     the backend wallet is not an admin on the contract
      "chain_unavailable" contract not configured / Sepolia unreachable
      "invalid_wallet"    wallet address is missing or malformed
      "failed"            the transaction did not succeed
    """
    wallet = checksum_address((wallet or "").strip())
    try:
        if not Web3.is_address(wallet):
            return "invalid_wallet", "doctor has no valid wallet address"
    except Exception:
        return "invalid_wallet", "doctor has no valid wallet address"

    try:
        role = clinician_role_id()
        granted = has_role(wallet, role)
        if granted is True:
            return "already", wallet
        if granted is None:
            return "chain_unavailable", "could not read roles from the contract"
        signer = facility_address()
        if not signer:
            return "chain_unavailable", "FACILITY_PRIVATE_KEY is not configured"
        if has_role(signer, admin_role_id()) is not True:
            return (
                "no_permission",
                "backend wallet is not an admin; run "
                "`npx hardhat run scripts/grant-clinician-role.js --network sepolia -- "
                f"{wallet}`",
            )
        tx_hash = send_transaction(contract.functions.grantRole(wallet, role))
        if has_role(wallet, role):
            return "granted", tx_hash
        return "failed", tx_hash
    except Exception as exc:
        # Never surface raw provider text: RPC URLs can contain credentials.
        logger.exception("Could not grant CLINICIAN_ROLE to %s", wallet)
        return "chain_unavailable", type(exc).__name__


def emergency_access_remaining(health_id: str, wallet: str) -> int:
    """Seconds left of an active emergency window; 0 when expired/unknown."""
    try:
        remaining = contract.functions.emergencyAccessRemaining(
            patient_ref(health_id), checksum_address(wallet)
        ).call()
        return max(int(remaining), 0)
    except Exception:
        return 0


def revoke_emergency_access_on_chain(health_id: str, clinician_wallet: str) -> str:
    """Operator-side revokeEmergencyAccess(...) — returns the tx hash."""
    return send_transaction(
        contract.functions.revokeEmergencyAccess(
            patient_ref(health_id), checksum_address(clinician_wallet)
        )
    )


def ensure_gas(patient_address: str) -> str:
    """Custodial patient wallets start empty, so the facility tops up gas
    before the patient signs their own grant/revoke transaction."""
    if not FACILITY_PRIVATE_KEY or FACILITY_PRIVATE_KEY.startswith("0x..."):
        raise RuntimeError("FACILITY_PRIVATE_KEY is not set in backend/.env")

    facility = w3.eth.account.from_key(FACILITY_PRIVATE_KEY)
    to = Web3.to_checksum_address(patient_address)
    print(f"ensure_gas: balance of {to} before: {w3.eth.get_balance(to)}")
    if w3.eth.get_balance(to) >= w3.to_wei(0.005, "ether"):
        print("ensure_gas: already funded")
        return ""  # already funded

    tx = {
        "from": facility.address,
        "to": to,
        "value": w3.to_wei(0.01, "ether"),
        "nonce": w3.eth.get_transaction_count(facility.address),
        "chainId": w3.eth.chain_id,  # EIP-155 required by public RPCs
        **_eip1559_fees(),
    }
    # Never hardcode the 21k transfer cost: the facility wallet carries an
    # EIP-7702 delegation (EIP7702StatelessDeleGator), so a plain transfer
    # executes ~205k gas of delegated code — a 100k cap runs out of gas and
    # the receipt comes back with status 0 while the ETH never arrives.
    try:
        tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.3)
    except Exception:
        logger.warning("estimate_gas failed for gas top-up; falling back to 400k")
        tx["gas"] = 400_000
    signed = w3.eth.account.sign_transaction(tx, FACILITY_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    print(f"ensure_gas: tx_hash {tx_hash.hex()}")
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    print(f"ensure_gas: receipt status {receipt.status}")
    if receipt.status != 1:
        raise RuntimeError(f"Gas transfer reverted! Tx: {tx_hash.hex()}")
    time.sleep(3)  # Give Infura nodes time to sync state
    print(f"ensure_gas: balance of {to} after: {w3.eth.get_balance(to)}")
    return "0x" + tx_hash.hex()
