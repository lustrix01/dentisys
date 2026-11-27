#!/usr/bin/env bash
# Waits for one agy-handoff.ps1 run to end, so Claude is woken when it does (no polling by Claude).
# Start it from Claude's Bash tool with run_in_background right after the driver starts in its Terminal tab:
#   bash .agents/scripts/agy-wait.sh build        (or readiness / learn)
# Exit 0: the driver wrote a new <phase>-<stamp>.response.md (its last step); read the summary in the tab.
# Exit 1: agy.exe is not running and no result came (quota refusal, startup error, or the run died).
phase="${1:?phase: readiness, build or learn}"
dir="${TEMP:-/tmp}/agy-handoff"
mark="$(mktemp)"
start=$(date +%s)
mkdir -p "$dir"
result() { find "$dir" -name "$phase-*.response.md" -newer "$mark" 2>/dev/null | head -1; }
while true; do
  r=$(result); [ -n "$r" ] && { echo "AGY $phase ENDED: $r"; exit 0; }
  # Give the driver 2 min to pass its quota and Docker checks and start agy.exe.
  if [ $(( $(date +%s) - start )) -gt 120 ] && ! tasklist 2>/dev/null | grep -qi '^agy.exe'; then
    sleep 60; r=$(result); [ -n "$r" ] && { echo "AGY $phase ENDED: $r"; exit 0; }
    echo "AGY $phase: agy.exe is not running and no result file came. Read the run's Terminal tab."; exit 1
  fi
  sleep 30
done
