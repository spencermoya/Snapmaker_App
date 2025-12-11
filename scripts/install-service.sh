#!/bin/bash

# Install Snapmaker Control as a systemd service
# This makes the app start automatically on boot

echo "Installing Snapmaker Control service..."

# Copy service file
sudo cp scripts/snapmaker.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable snapmaker.service

# Start the service now
sudo systemctl start snapmaker.service

echo ""
echo "Service installed successfully!"
echo ""
echo "Useful commands:"
echo "  Check status:    sudo systemctl status snapmaker"
echo "  View logs:       sudo journalctl -u snapmaker -f"
echo "  Stop service:    sudo systemctl stop snapmaker"
echo "  Restart service: sudo systemctl restart snapmaker"
echo "  Disable on boot: sudo systemctl disable snapmaker"
echo ""
echo "The app will now start automatically when your Pi boots."
