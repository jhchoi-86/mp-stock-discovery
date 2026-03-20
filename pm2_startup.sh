#!/bin/bash
export PATH=$PATH:/usr/local/bin:/usr/bin
CMD=$(pm2 startup | grep -Eo 'sudo env PATH.*')
eval "$CMD"
pm2 save
