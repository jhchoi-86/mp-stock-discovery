#!/bin/bash
ssh -i "C:/Users/danbe/Documents/mp-key.pem" -o StrictHostKeyChecking=no ubuntu@15.134.243.209 "cd ~/mp-stock-discovery && node -e \"const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.report.findFirst({ orderBy: { sentAt: 'desc' } }).then(r => { console.log(r.content); p.\\\$disconnect(); });\""
