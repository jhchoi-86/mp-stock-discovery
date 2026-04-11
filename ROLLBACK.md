# Emergency Rollback Procedure (MP Stock Discovery)

> [!IMPORTANT]
> If a deployment fails or causes critical errors (e.g., 502/503), follow these steps to restore the previous stable version immediately.

## 1. Identify Stable Version
Check the git tags to find the last known stable version (e.g., `v8.7.1`).
```bash
git tag --list
```

## 2. Checkout Previous Version
```bash
# Stash current changes if any
git stash

# Checkout the target tag
git checkout v8.7.1
```

## 3. Restore Local Build (Optional)
If the build on AWS is corrupted, rebuild locally and push.
```bash
npm run build
```

## 4. Run Deploy Script
Run the standard deployment script which will sync the older stable code and reload PM2.
```bash
./aws_update.bat
```

## 5. Clean Up Checkpoints
If the error was related to corrupted data/checkpoints, delete them on the AWS server.
```bash
ssh -i "path/to/key.pem" ubuntu@15.134.243.209 "cd ~/mp-stock-discovery && rm -rf data/checkpoint_*.json"
```

## 6. Verify Health
Access `https://mpstock.co.kr/api/health` to confirm restoration.
