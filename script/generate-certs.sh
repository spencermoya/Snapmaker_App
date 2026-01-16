#!/bin/bash

CERT_DIR="${SSL_CERT_DIR:-./certs}"
KEY_FILE="$CERT_DIR/server.key"
CERT_FILE="$CERT_DIR/server.crt"
HOST_FILE="$CERT_DIR/.host_address"

if ! command -v openssl &> /dev/null; then
    echo "Error: openssl is not installed."
    echo "Install it with: sudo apt install openssl"
    exit 1
fi

HOST_ARG="${1:-$(hostname -I | awk '{print $1}')}"

if [ -z "$HOST_ARG" ]; then
    echo "Error: Could not detect IP address."
    echo "Please provide your Pi's IP address or hostname as an argument:"
    echo "  bash script/generate-certs.sh 192.168.1.100"
    echo "  bash script/generate-certs.sh raspberrypi.local"
    exit 1
fi

is_ip_address() {
    local ip=$1
    if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    fi
    return 1
}

if is_ip_address "$HOST_ARG"; then
    HOST_TYPE="IP"
    SAN_ENTRY="IP:$HOST_ARG"
    echo "Detected IP address: $HOST_ARG"
else
    HOST_TYPE="DNS"
    SAN_ENTRY="DNS:$HOST_ARG"
    echo "Detected hostname: $HOST_ARG"
fi

if [ -f "$KEY_FILE" ] && [ -f "$CERT_FILE" ]; then
    if [ -f "$HOST_FILE" ]; then
        OLD_HOST=$(cat "$HOST_FILE")
        if [ "$OLD_HOST" != "$HOST_ARG" ]; then
            echo "Host changed from $OLD_HOST to $HOST_ARG"
            echo "Regenerating certificates..."
            rm -f "$KEY_FILE" "$CERT_FILE" "$HOST_FILE"
        else
            echo "SSL certificates already exist for $HOST_ARG"
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
echo "Using $HOST_TYPE: $HOST_ARG"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -sha256 \
    -subj "/C=US/ST=Local/L=Local/O=Snapmaker/CN=$HOST_ARG" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,$SAN_ENTRY" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth"

if [ $? -eq 0 ]; then
    echo "$HOST_ARG" > "$HOST_FILE"
    echo ""
    echo "SSL certificates generated successfully!"
    echo "  Key:  $KEY_FILE"
    echo "  Cert: $CERT_FILE"
    echo ""
    echo "Access the app at: https://$HOST_ARG:5000"
    echo ""
    echo "Note: Your browser will show a security warning on first visit."
    echo "Click 'Advanced' and 'Proceed' to trust the self-signed certificate."
    if [ "$HOST_TYPE" = "DNS" ]; then
        echo ""
        echo "For iOS home screen apps, use the hostname URL (not IP address)."
    fi
else
    echo "Failed to generate SSL certificates."
    exit 1
fi
