#!/bin/bash
CONF="/etc/letsencrypt/renewal/mpstock.co.kr.conf"
if [ ! -f "$CONF" ]; then
    echo "File not found: $CONF"
    # Fallback to duckdns if they used it
    CONF="/etc/letsencrypt/renewal/mp-stock.duckdns.org.conf"
    if [ ! -f "$CONF" ]; then
        echo "No valid conf found."
        exit 1
    fi
fi

if ! sudo grep -q "renew_hook" "$CONF"; then
    echo "renew_hook = systemctl reload nginx" | sudo tee -a "$CONF" > /dev/null
    echo "Successfully added deploy-hook to certbot config."
else
    echo "renew_hook already exists."
fi
