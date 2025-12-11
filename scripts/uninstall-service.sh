#!/bin/bash

# Uninstall Snapmaker Control systemd service

echo "Uninstalling Snapmaker Control service..."

# Stop the service
sudo systemctl stop snapmaker.service

# Disable service from starting on boot
sudo systemctl disable snapmaker.service

# Remove service file
sudo rm /etc/systemd/system/snapmaker.service

# Reload systemd
sudo systemctl daemon-reload

echo "Service uninstalled successfully!"
