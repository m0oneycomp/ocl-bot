#!/bin/bash

# Force the script into your exact project directory
cd /home/mooneycomp/discord/bots/ocl/ocl-utilities || exit

while true; do
  # Check if there are any uncommitted changes
  if [[ -n $(git status -s) ]]; then
    echo "[Auto-Push] Changes detected. Pushing to GitHub..."
    git add .
    git commit -m "Auto-commit: System update $(date)"
    
    # Push silently using the authenticated origin we just set
    git push origin main
  fi
  
  # Wait 5 minutes (300 seconds) before checking again
  sleep 300
done
