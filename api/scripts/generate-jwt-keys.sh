#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-jwt-keys.sh
#
# Generates an RS256 (RSA-4096) key pair for JWT signing and outputs:
#   - api/certs/jwt-private.pem   Private key  (keep secret, server only)
#   - api/certs/jwt-public.pem    Public key   (safe to distribute)
#   - Base64-encoded env var values printed to stdout for copy-paste into .env
#
# Usage:
#   chmod +x api/scripts/generate-jwt-keys.sh
#   ./api/scripts/generate-jwt-keys.sh
#
# Requirements: openssl (pre-installed on macOS and most Linux distros)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)/api/certs"

mkdir -p "$CERTS_DIR"

PRIVATE_KEY="$CERTS_DIR/jwt-private.pem"
PUBLIC_KEY="$CERTS_DIR/jwt-public.pem"

echo "Generating RSA-4096 private key…"
openssl genrsa -out "$PRIVATE_KEY" 4096 2>/dev/null

echo "Extracting public key…"
openssl rsa -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY" 2>/dev/null

chmod 600 "$PRIVATE_KEY"
chmod 644 "$PUBLIC_KEY"

echo ""
echo "✓ Keys written to:"
echo "    Private: $PRIVATE_KEY"
echo "    Public:  $PUBLIC_KEY"
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "Copy the following into your api/.env (or set as environment variables):"
echo "─────────────────────────────────────────────────────────────────────────"
echo ""
echo "JWT_PRIVATE_KEY_PATH=./certs/jwt-private.pem"
echo "JWT_PUBLIC_KEY_PATH=./certs/jwt-public.pem"
echo ""
echo "# Alternatively, embed the keys as Base64 (useful for container envs):"
PRIVATE_B64=$(base64 -w 0 "$PRIVATE_KEY" 2>/dev/null || base64 "$PRIVATE_KEY")
PUBLIC_B64=$(base64 -w 0 "$PUBLIC_KEY" 2>/dev/null || base64 "$PUBLIC_KEY")
echo "JWT_PRIVATE_KEY_BASE64=$PRIVATE_B64"
echo "JWT_PUBLIC_KEY_BASE64=$PUBLIC_B64"
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "⚠  NEVER commit jwt-private.pem to version control."
echo "   Add api/certs/*.pem to .gitignore."
echo "─────────────────────────────────────────────────────────────────────────"
