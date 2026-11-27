#!/usr/bin/env bash
# Rebuild the Linux native modules Space ships against glibc 2.28 so the package runs
# on RHEL 8-family systems (e.g. Anolis OS 8). Run from the repo root, after `npm ci`,
# inside quay.io/pypa/manylinux_2_28_x86_64 (AlmaLinux 8 + gcc-toolset, whose
# libstdc++_nonshared keeps output within the system GCC 8 libstdc++).
# See docs/research/kodax-space-linux-glibc-2-28-build.md.
set -euo pipefail

node_version="$(cat .nvmrc)"
node_dist="node-v${node_version}-linux-x64"
node_root="$(mktemp -d)"
(
  cd "$node_root"
  curl -fsSLO "https://nodejs.org/dist/v${node_version}/${node_dist}.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
  grep " ${node_dist}.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "${node_dist}.tar.xz"
)
export PATH="${node_root}/${node_dist}/bin:${PATH}"
export npm_config_python=/opt/python/cp312-cp312/bin/python3

# better-sqlite3 targets Electron's ABI. Forcing a source build skips the upstream
# prebuild (built on Debian 12, needs GLIBC_2.34); the .forge-meta it writes makes
# electron-builder's pack-time rebuild keep this binary. No pre-gyp copy: it would
# ship a second copy under better-sqlite3/bin/.
electron_version="$(node -p "require('electron/package.json').version")"
node node_modules/@electron/rebuild/lib/cli.js --module-dir . \
  --force --build-from-source --disable-pre-gyp-copy \
  --only better-sqlite3 --version "$electron_version"

# node-pty is N-API and ships as an extra resource, so its own install script
# (node-gyp; no Linux prebuilds) is the build electron-builder packages as-is.
npm rebuild node-pty

node scripts/check-linux-glibc.mjs \
  node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  node_modules/node-pty/build/Release/pty.node
