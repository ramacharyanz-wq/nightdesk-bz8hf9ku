#!/bin/zsh
# Double-click to start Card Recon and open it in your browser.
cd "$(dirname "$0")"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then echo "Node.js is needed. Install it from https://nodejs.org and try again."; read; exit 1; fi
if lsof -iTCP:4747 -sTCP:LISTEN >/dev/null 2>&1; then open "http://localhost:4747"; exit 0; fi
( sleep 1; open "http://localhost:4747" ) &
node server.mjs
