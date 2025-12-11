#!/bin/bash

# WiFi auto-reconnect script for Raspberry Pi
# Checks connectivity every 5 minutes via cron and reconnects if needed

PING_HOST="8.8.8.8"

# Check if we can reach the internet
if ! ping -c2 $PING_HOST > /dev/null 2>&1; then
    echo "$(date): WiFi connection lost, attempting to reconnect..."
    
    # Bring down the WiFi interface
    sudo ifconfig wlan0 down
    sleep 2
    
    # Bring it back up (triggers auto-reconnect)
    sudo ifconfig wlan0 up
    sleep 10
    
    # Check if reconnection worked
    if ping -c2 $PING_HOST > /dev/null 2>&1; then
        echo "$(date): WiFi reconnected successfully"
    else
        echo "$(date): Reconnection failed, will try again next cycle"
    fi
fi
