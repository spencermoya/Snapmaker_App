#!/bin/bash

CERT_DIR="${SSL_CERT_DIR:-./certs}"
KEY_FILE="$CERT_DIR/server.key"
CERT_FILE="$CERT_DIR/server.crt"
IP_FILE="$CERT_DIR/.ip_address"

if ! command -v openssl &> /dev/null; then
    echo "Error: openssl is not installed."
    echo "Install it with: sudo apt install openssl"
    exit 1
fi

PI_IP="${1:-$(hostname -I | awk '{print $1}')}"

if [ -z "$PI_IP" ]; then
    echo "Error: Could not detect IP address."
    echo "Please provide your Pi's IP address as an argument:"
    echo "  bash script/generate-certs.sh 192.168.1.100"
    exit 1
fi

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    if [ -f "$IP_FILE" ]; then
        OLD_IP=$(cat "$IP_FILE")
        if [ "$OLD_IP" != "$PI_IP" ]; then
            echo "IP address changed from $OLD_IP to $PI_IP"
            echo "Regenerating certificates..."
            rm -f "$KEY_FILE" "$CERT_FILE" "$IP_FILE"
        else
            echo "SSL certificates already exist for IP $PI_IP"
            echo "To regenerate, run: rm -rf $CERT_DIR && npm run generate-certs"
            exit 0
        fi
    else
        echo "SSL certificates already exist in $CERT_DIR"
        echo "To regenerate, run: rm -rf $CERT_DIR && npm run generate-certs"
        exit 0
    fi
fi

mkdir -p "$CERT_DIR"

echo "Generating self-signed SSL certificate..."
echo "Using IP address: $PI_IP"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/C=US/ST=Local/L=Local/O=Snapmaker/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$PI_IP"

if [ $? -eq 0 ]; then
    echo "$PI_IP" > "$IP_FILE"
    echo ""
    echo "SSL certificates generated successfully!"
    echo "  Key:  $KEY_FILE"
    echo "  Cert: $CERT_FILE"
    echo ""
    echo "Access the app at: https://$PI_IP:5000"
    echo ""
    echo "Note: Your browser will show a security warning on first visit."
    echo "Click 'Advanced' and 'Proceed' to trust the self-signed certificate."
else
    echo "Failed to generate SSL certificates."
    exit 1
fi
