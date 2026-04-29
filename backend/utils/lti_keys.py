"""
LTI 1.3 tool key material.

The tool needs an RSA key pair to:
  1. Sign Deep Linking response JWTs sent back to Canvas.
  2. Authenticate AGS service requests via the OAuth2 client_credentials flow
     (RFC 7523 — JWT bearer assertion signed with our private key).
  3. Publish the matching public key at /.well-known/jwks.json so Canvas can
     verify the signatures above.

Keys are loaded from `Config.CANVAS_LTI_PRIVATE_KEY_PEM`. Per CLAUDE.md
rule 8 (API keys via Config class only), nothing here reads `os.environ`
directly.
"""

from __future__ import annotations

import base64
from functools import lru_cache
from typing import Optional, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)


class LtiKeysNotConfigured(RuntimeError):
    """Raised when an LTI operation needs the tool key pair but it is unset."""


def _load_private_key() -> Optional[RSAPrivateKey]:
    pem = Config.CANVAS_LTI_PRIVATE_KEY_PEM
    if not pem:
        return None
    try:
        return serialization.load_pem_private_key(pem.encode(), password=None)
    except Exception as e:
        logger.error(f"[LTI keys] Failed to parse CANVAS_LTI_PRIVATE_KEY_PEM: {e}")
        return None


@lru_cache(maxsize=1)
def get_private_key() -> RSAPrivateKey:
    """Return the tool's RSA private key, raising if unconfigured."""
    key = _load_private_key()
    if key is None:
        raise LtiKeysNotConfigured(
            "CANVAS_LTI_PRIVATE_KEY_PEM is not set. Generate one with "
            "`openssl genrsa -out private.pem 2048` and load the contents "
            "into the env var."
        )
    return key


@lru_cache(maxsize=1)
def get_public_key() -> RSAPublicKey:
    return get_private_key().public_key()


@lru_cache(maxsize=1)
def get_kid() -> str:
    """Stable key identifier for our JWKS entry."""
    kid = Config.CANVAS_LTI_PUBLIC_KID
    if not kid:
        raise LtiKeysNotConfigured("CANVAS_LTI_PUBLIC_KID is not set.")
    return kid


def get_private_key_pem() -> str:
    """Return the private key as PEM (for libraries that want the string form)."""
    return Config.CANVAS_LTI_PRIVATE_KEY_PEM or ""


def get_public_jwks() -> dict:
    """Return our JWKS document. Empty `keys` array if unconfigured — Canvas
    polls JWKS periodically, so we don't want to 500 just because keys aren't
    rotated in yet."""
    private = _load_private_key()
    if private is None or not Config.CANVAS_LTI_PUBLIC_KID:
        return {"keys": []}

    public_numbers = private.public_key().public_numbers()
    n = _int_to_b64url(public_numbers.n)
    e = _int_to_b64url(public_numbers.e)

    return {
        "keys": [
            {
                "kty": "RSA",
                "alg": "RS256",
                "use": "sig",
                "kid": Config.CANVAS_LTI_PUBLIC_KID,
                "n": n,
                "e": e,
            }
        ]
    }


def _int_to_b64url(value: int) -> str:
    """Encode a positive integer as base64url without padding (JWK n/e format)."""
    byte_length = (value.bit_length() + 7) // 8
    raw = value.to_bytes(byte_length, byteorder="big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def keys_configured() -> bool:
    """Cheap feature-flag check for routes that should hide if keys are unset."""
    return _load_private_key() is not None and bool(Config.CANVAS_LTI_PUBLIC_KID)
