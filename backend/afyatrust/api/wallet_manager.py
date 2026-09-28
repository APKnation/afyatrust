"""Custodial wallet manager for patients.

Patients never touch MetaMask. The backend generates a Sepolia wallet for
each patient and stores the private key encrypted with AES-256-GCM.
MASTER_KEY comes from .env (32 bytes, base64-encoded or hex).
"""
import base64
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from eth_account import Account


def _master_key() -> bytes:
    """Load the 32-byte AES master key from env (hex or base64)."""
    raw = os.getenv("MASTER_KEY", "")
    if not raw:
        raise RuntimeError("MASTER_KEY is not set in backend/.env")
    try:  # hex first (64 hex chars)
        return bytes.fromhex(raw)
    except ValueError:
        key = base64.b64decode(raw)
    if len(key) != 32:
        raise RuntimeError("MASTER_KEY must decode to exactly 32 bytes")
    return key


def _encrypt(plaintext: bytes) -> tuple[str, str]:
    """Encrypt with AES-256-GCM. Returns (base64_ciphertext, base64_iv)."""
    iv = secrets.token_bytes(12)  # 96-bit nonce recommended for GCM
    aes = AESGCM(_master_key())
    ct = aes.encrypt(iv, plaintext, None)
    return base64.b64encode(ct).decode(), base64.b64encode(iv).decode()


def _decrypt(ciphertext_b64: str, iv_b64: str) -> bytes:
    """Decrypt AES-256-GCM ciphertext."""
    aes = AESGCM(_master_key())
    return aes.decrypt(base64.b64decode(iv_b64), base64.b64decode(ciphertext_b64), None)


def create_wallet() -> dict:
    """Generate a new Sepolia wallet. Returns address + encrypted key parts."""
    acct = Account.create()
    encrypted_key, iv = _encrypt(bytes(acct.key))
    return {
        "address": acct.address,
        "encrypted_key": encrypted_key,
        "iv": iv,
    }


def get_private_key(encrypted_key_b64: str, iv_b64: str) -> str:
    """Decrypt a stored key; used by the backend to sign transactions."""
    return "0x" + _decrypt(encrypted_key_b64, iv_b64).hex()
