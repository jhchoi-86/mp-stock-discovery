#!/bin/bash
# fix_nginx.sh
sudo sed -i "s/user www-data;/user ubuntu;/" /etc/nginx/nginx.conf
sudo systemctl restart nginx
echo "Nginx user changed to ubuntu and restarted."
