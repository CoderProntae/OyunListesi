#!/bin/sh
# Rebuilds the local toolchain after a sandbox reset (not shipped).
set -e
mkdir -p /home/user/.cache/node22
cd /home/user/.cache/node22
[ -x node_modules/node/bin/node ] || { npm init -y >/dev/null; npm install --no-audit --no-fund node@22 >/dev/null; }
export PATH=/home/user/.cache/node22/node_modules/node/bin:$PATH
node -v
(sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq xvfb xauth libgtk-3-0t64 >/dev/null) &
APT=$!
cd /home/user/oyun-siralayici
npm ci --no-audit --no-fund
node node_modules/electron/install.js
wait $APT || true
npx playwright install --with-deps chromium
echo SETUP-DONE
