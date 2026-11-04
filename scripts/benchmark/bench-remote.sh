#!/usr/bin/env bash
# Benchmark helper that runs ON THE DEMO SERVER (as root: sudo -n bash /tmp/dsb/bench-remote.sh <command>).
# benchmark.ps1 uploads it in one bundle and calls it once per phase, so the SSH session count stays low
# (the server's ufw limit blocks more than 6 connections in 30 s).
#   start <force|noforce>  fingerprint + outside-activity check + start the sampler
#   face <sec> <csv> <calls> <ms> <limit>  face phase inside the biometric container (always revokes and cleans up)
#   finish <keep|remove>   stop the sampler, print end images + samples, optionally remove /tmp/dsb
#   capture <video-name>   build face frames from an uploaded selfie video, print them as one base64 tar.gz
#   abort                  stop the sampler, revoke leftovers, remove everything
# Output lines are "KEY value ..." for benchmark.ps1; progress text goes to stderr.
set -u
DSB=/tmp/dsb
BIO=dentisys-biometric-1
DB=dentisys-db-1
SAMPLE_SECONDS=5   # keep in step with profile.json sampleSeconds

psqlq() { docker exec "$DB" psql -U postgres -d dentisys -qtAX -c "$1"; }

images() { # $1 = prefix: one line per container: name image-id restart-count
  for c in $(docker ps -a --format '{{.Names}}' | sort); do
    echo "$1 $c $(docker inspect -f '{{.Image}} {{.RestartCount}}' "$c")"
  done
}

cmd_start() {
  if [[ -f $DSB/sampler.pid ]] && kill -0 "$(cat $DSB/sampler.pid)" 2>/dev/null; then echo "ERROR a benchmark sampler is already running"; exit 1; fi
  echo "FP vcpu $(nproc)"
  echo "FP cpuModel $(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo)"
  echo "FP ramMb $(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo)"
  echo "FP swapMb $(awk '/SwapTotal/{printf "%d", $2/1024}' /proc/meminfo)"
  echo "FP diskGb $(df -BG --output=size / | tail -1 | tr -dc 0-9)"
  images IMG_START
  for t in user_accounts students enrollments class_sections attendance_records assessment_scores audit_events; do
    echo "ROWS $t $(psqlq "SELECT count(*) FROM $t")"
  done
  # Activity by anyone but the benchmark in the last 15 minutes (audit time is UTC).
  outside="occurred_at > (now() AT TIME ZONE 'utc') - interval '15 minutes' AND coalesce(user_agent,'') NOT LIKE 'DentiSys-Benchmark/%'"
  n=$(psqlq "SELECT count(*) FROM audit_events WHERE $outside")
  echo "OUTSIDE $n"
  if [[ $n != 0 ]]; then
    psqlq "SELECT coalesce(ip_address,'-') || ' | ' || coalesce(left(user_agent,40),'-') || ' | ' || count(*) || ' events, last ' || max(occurred_at)::time(0) FROM audit_events WHERE $outside GROUP BY ip_address, left(user_agent,40)" | sed 's/^/OUTSIDE_DETAIL /'
    [[ ${1:-noforce} == force ]] || exit 0
  fi
  docker ps --no-trunc --format '{{.Names}} {{.ID}}' > $DSB/containers.txt
  rm -f $DSB/stop $DSB/samples.log
  nohup bash "$0" sampler > /dev/null 2>&1 &
  echo $! > $DSB/sampler.pid
  echo "NOW $(date +%s.%N)"   # last, so benchmark.ps1 can match it to its own clock when this output arrives
  echo "STARTED ok"   # benchmark.ps1 reads "KEY value" lines
}

# Light sampler: reads /proc and the containers' cgroup files only (no `docker stats`, which is slow on 1 vCPU).
# Per container CPU% is of one core; memory is the cgroup's current use (includes page cache).
cmd_sampler() {
  declare -A dir prev
  while read -r name id; do
    for p in /sys/fs/cgroup/system.slice/docker-$id.scope /sys/fs/cgroup/docker/$id; do
      [[ -f $p/cpu.stat && -f $p/memory.current ]] && dir[$name]=$p
    done
  done < $DSB/containers.txt
  usage() { awk '/^usage_usec/{print $2}' "$1/cpu.stat"; }
  for n in "${!dir[@]}"; do prev[$n]=$(usage "${dir[$n]}"); done
  read -r _ u n s idle w irq sirq steal _ < /proc/stat
  ptotal=$((u + n + s + idle + w + irq + sirq + steal)); pidle=$((idle + w)); psteal=$steal
  pwall=$(date +%s%N)
  while [[ ! -e $DSB/stop ]]; do
    sleep $SAMPLE_SECONDS
    now=$(date +%s)
    wall=$(date +%s%N)
    read -r _ u n s idle w irq sirq steal _ < /proc/stat
    total=$((u + n + s + idle + w + irq + sirq + steal)); dt=$((total - ptotal)); [[ $dt -gt 0 ]] || dt=1
    busy=$(( (dt - (idle + w - pidle)) * 1000 / dt )); stl=$(( (steal - psteal) * 1000 / dt ))
    ptotal=$total; pidle=$((idle + w)); psteal=$steal
    line="T=$now load1=$(cut -d' ' -f1 /proc/loadavg) busy=$((busy / 10)).$((busy % 10)) steal=$((stl / 10)).$((stl % 10))"
    line+=" $(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} /SwapTotal/{st=$2} /SwapFree/{sf=$2} END{printf "memused=%d memavail=%d swap=%d", (t-a)/1024, a/1024, (st-sf)/1024}' /proc/meminfo)"
    dwall=$(( (wall - pwall) / 1000 )); [[ $dwall -gt 0 ]] || dwall=1
    for name in "${!dir[@]}"; do
      cur=$(usage "${dir[$name]}"); c10=$(( (cur - ${prev[$name]}) * 1000 / dwall )); prev[$name]=$cur
      line+=" c.$name=$((c10 / 10)).$((c10 % 10)):$(( $(cat "${dir[$name]}/memory.current") / 1048576 ))"
    done
    pwall=$wall
    echo "$line" >> $DSB/samples.log
  done
}

face_cleanup() {
  docker exec -u root "$BIO" python /tmp/dsb-face/face.py revoke-leftover /tmp/dsb-face >&2 2>/dev/null
  docker exec -u root "$BIO" rm -rf /tmp/dsb-face /tmp/dsb-cap >/dev/null 2>&1
}

cmd_face() {
  [[ -d $DSB/face ]] || { echo "FACE_SKIPPED no face frames"; exit 0; }
  trap 'exit 1' HUP INT TERM
  trap face_cleanup EXIT
  docker exec -u root "$BIO" rm -rf /tmp/dsb-face
  docker cp "$DSB/face" "$BIO:/tmp/dsb-face" && docker cp "$DSB/face.py" "$BIO:/tmp/dsb-face/face.py" || exit 1
  echo "FACE_JSON $(docker exec -u root "$BIO" python /tmp/dsb-face/face.py run /tmp/dsb-face "$@")"
}

cmd_capture() {
  trap face_cleanup EXIT
  docker exec -u root "$BIO" sh -c 'rm -rf /tmp/dsb-cap && mkdir /tmp/dsb-cap' >&2 || exit 1
  docker cp "$DSB/$1" "$BIO:/tmp/dsb-cap/video" && docker cp "$DSB/face.py" "$BIO:/tmp/dsb-cap/face.py" || exit 1
  docker exec -u root "$BIO" python /tmp/dsb-cap/face.py capture /tmp/dsb-cap/video /tmp/dsb-cap/out || exit 1
}

stop_sampler() {
  touch $DSB/stop
  for _ in 1 2 3 4 5 6 7 8; do
    [[ -f $DSB/sampler.pid ]] && kill -0 "$(cat $DSB/sampler.pid)" 2>/dev/null || break
    sleep 1
  done
  [[ -f $DSB/sampler.pid ]] && kill "$(cat $DSB/sampler.pid)" 2>/dev/null
  return 0
}

cmd_finish() {
  stop_sampler
  images IMG_END
  echo "SAMPLES"
  cat $DSB/samples.log 2>/dev/null
  rm -f $DSB/samples.log $DSB/stop $DSB/sampler.pid
  if [[ ${1:-keep} == remove ]]; then cd / && rm -rf $DSB /tmp/dsb.tgz; fi
}

cmd_abort() {
  stop_sampler
  face_cleanup
  cd / && rm -rf $DSB /tmp/dsb.tgz
}

cmd=${1:-}; shift || true
case $cmd in
  start) cmd_start "$@" ;; sampler) cmd_sampler ;; face) cmd_face "$@" ;; capture) cmd_capture "$@" ;;
  finish) cmd_finish "$@" ;; abort) cmd_abort ;;
  *) echo "ERROR unknown command: $cmd" >&2; exit 2 ;;
esac
