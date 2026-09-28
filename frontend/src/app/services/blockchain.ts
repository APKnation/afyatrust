/**
 * PoC note: all blockchain calls go through the Django backend
 * (backend/api/blockchain.py), which signs with the facility wallet.
 * This file is intentionally minimal — the frontend never talks to
 * Sepolia directly. Remove it if unused.
 */
export const BLOCKCHAIN_VIA_BACKEND = true;
