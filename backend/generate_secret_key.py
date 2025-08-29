#!/usr/bin/env python3
"""Generate a secure secret key for Flask application"""

import secrets

def generate_secure_key(length=32):
    """Generate a cryptographically secure secret key"""
    return secrets.token_hex(length)

if __name__ == "__main__":
    print("=" * 60)
    print("SECURE SECRET KEY GENERATOR")
    print("=" * 60)
    print("\nGenerate a new secure key for FLASK_SECRET_KEY:")
    print("-" * 60)
    
    # Generate a 32-byte (64 character hex) key
    key = generate_secure_key(32)
    
    print(f"\nFLASK_SECRET_KEY={key}")
    
    print("\n" + "=" * 60)
    print("IMPORTANT INSTRUCTIONS:")
    print("=" * 60)
    print("1. Copy the key above")
    print("2. Add it to your .env file (backend/.env)")
    print("3. NEVER commit this key to version control")
    print("4. Use different keys for development and production")
    print("5. Keep this key secret and secure")
    print("=" * 60)