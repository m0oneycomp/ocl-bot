#!/bin/bash
while true; do
  if [[ -n $(git status -s) ]]; then
    echo "[Auto-Push] Changes detected. Pushing to GitHub..."
    git add .
    git commit -m "Auto-commit: System update $(date)"
    git push origin main
  fi
  sleep 300
done
