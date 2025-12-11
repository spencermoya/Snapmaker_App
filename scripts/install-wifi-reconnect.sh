#!/bin/bash

# Install WiFi auto-reconnect for Raspberry Pi

echo "Installing WiFi auto-reconnect..."

# Make the reconnect script executable
chmod +x scripts/wifi-reconnect.sh

# Copy to system location
sudo cp scripts/wifi-reconnect.sh /usr/local/bin/wifi-reconnect.sh

# Disable WiFi power management (prevents random disconnections)
echo "Disabling WiFi power management..."
sudo /sbin/iwconfig wlan0 power off 2>/dev/null || true

# Add cron job to check WiFi every 5 minutes
(sudo crontab -l 2>/dev/null | grep -v "wifi-reconnect.sh"; echo "*/5 * * * * /usr/local/bin/wifi-reconnect.sh >> /var/log/wifi-reconnect.log 2>&1") | sudo crontab -

# Add power management disable on boot
(sudo crontab -l 2>/dev/null | grep -v "iwconfig wlan0 power off"; echo "@reboot /bin/sleep 30 && sudo /sbin/iwconfig wlan0 power off") | sudo crontab -

echo ""
echo "WiFi auto-reconnect installed!"
echo ""
echo "What it does:"
echo "  - Checks WiFi connectivity every 5 minutes"
echo "  - Automatically reconnects if connection is lost"
echo "  - Disables WiFi power management (prevents random drops)"
echo ""
echo "View logs: sudo cat /var/log/wifi-reconnect.log"
