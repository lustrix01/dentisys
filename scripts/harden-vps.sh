#!/usr/bin/env bash
set +x
set -euo pipefail

# Owner's Ubuntu 26.04 guide, steps 1-6; AWS keys replace ssh-copy-id.
no_db_tunnel=false
non_interactive=false
sg_confirmed=false
password_stdin=false
check_only=false
ssh_port=2202
admin_user=devops
fail() { echo "ERROR: $*" >&2; exit 1; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --non-interactive) non_interactive=true; shift ;;
    --sg-confirmed) sg_confirmed=true; shift ;;
    --password-stdin) password_stdin=true; shift ;;
    --check-only) check_only=true; shift ;;
    --ssh-port) [[ $# -ge 2 && "$2" =~ ^[0-9]+$ ]] || fail "--ssh-port needs a port."; ssh_port="$2"; shift 2 ;;
    --user) [[ $# -ge 2 ]] || fail "--user needs a username."; admin_user="$2"; shift 2 ;;
    --no-db-tunnel) no_db_tunnel=true; shift ;;
    --help|-h)
      echo 'Usage: sudo bash harden-vps.sh [--user devops] [--ssh-port 2202] [--no-db-tunnel] [--non-interactive --sg-confirmed --password-stdin]'
      exit 0
      ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
[[ "$ssh_port" -ge 1024 && "$ssh_port" -le 65535 ]] || fail "SSH port must be between 1024 and 65535."
[[ "$admin_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$admin_user" != root && "$admin_user" != ubuntu ]] || fail 'The sudo account must be a lowercase Linux username other than root or ubuntu.'
admin_home="/home/$admin_user"
[[ "$EUID" -eq 0 ]] || fail 'Run this script with sudo.'
invoking_user="${SUDO_USER:-}"
[[ "$invoking_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$invoking_user" != root ]] || fail 'Run sudo from the SSH login user; direct root invocation is refused.'
[[ "$(id -u "$invoking_user")" -ne 0 ]] || fail 'The invoking account must not be root.'
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 26.04 ]] || fail 'This script supports fresh Ubuntu 26.04 LTS hosts only.'
export PATH="/usr/sbin:/sbin:$PATH"
if [[ "$non_interactive" == false && "$check_only" == false ]]; then
  [[ -t 0 ]] || fail 'A TTY is required for passwd and the Security Group confirmation. Reconnect with ssh -t.'
elif [[ "$check_only" == false ]]; then
  [[ "$sg_confirmed" == true && "$password_stdin" == true ]] || fail 'Non-interactive hardening requires --sg-confirmed and --password-stdin.'
fi
password=''
if [[ "$password_stdin" == true ]]; then
  IFS= read -r -d '' password || fail "Missing NUL-terminated $admin_user password on stdin."
  [[ -n "$password" && "$password" != *$'\n'* && "$password" != *$'\r'* ]] || fail 'Password must be a nonempty single-line value.'
fi
umask 077
work_dir="$(mktemp -d /tmp/dentisys-hardening.XXXXXX)"
trap 'rm -rf -- "$work_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ssh_config=/etc/ssh/sshd_config.d/99-hardening.conf

validate_keys() {
  local file="$1" line line_number=0 key_count=0
  [[ -s "$file" ]] || fail "No authorized_keys found: $file"
  # The first field can contain quoted spaces and escaped quotes in key options.
  # A comment after the key may legitimately contain the text command=.
  if ! awk '
    /^[[:space:]]*(#|$)/ { next }
    {
      sub(/^[[:space:]]+/, "")
      field = ""; quoted = 0; escaped = 0
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)
        if (!quoted && !escaped && c ~ /[[:space:]]/) break
        field = field c
        if (escaped) escaped = 0
        else if (c == "\\") escaped = 1
        else if (c == "\"") quoted = !quoted
      }
      if (tolower(field) ~ /command=/) exit 1
    }
  ' "$file"; then
    fail 'An authorized key has a command= option. Refusing forced-command keys, including the AWS root login trap.'
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))
    line="${line//$'\r'/}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -n "$line" && "$line" != \#* ]] || continue
    printf '%s\n' "$line" > "$work_dir/key-line"
    if ! ssh-keygen -l -f "$work_dir/key-line" > "$work_dir/key-check" 2>&1; then
      cat "$work_dir/key-check" >&2
      fail "Invalid authorized_keys line $line_number in $file."
    fi
    key_count=$((key_count + 1))
  done < "$file"
  [[ "$key_count" -gt 0 ]] || fail "No usable SSH public keys in $file."
}

validate_admin_keys() {
  [[ -d "$admin_home/.ssh" && "$(stat -c '%U:%a' "$admin_home/.ssh")" == "$admin_user:700" ]] || fail "$admin_user .ssh must be owned by $admin_user with mode 700."
  [[ -f "$admin_home/.ssh/authorized_keys" && "$(stat -c '%U:%a' "$admin_home/.ssh/authorized_keys")" == "$admin_user:600" ]] || fail "$admin_user authorized_keys must exist, be owned by $admin_user and have mode 600."
  validate_keys "$admin_home/.ssh/authorized_keys"
}

stage_ssh() {
  local config setting forwarding=no
  install -d -m 0700 "$work_dir/sshd_config.d"
  for config in /etc/ssh/sshd_config.d/*.conf; do
    [[ -f "$config" ]] || continue
    cp -p -- "$config" "$work_dir/sshd_config.d/"
  done
  cp -- "$work_dir/99-hardening.conf" "$work_dir/sshd_config.d/99-hardening.conf"
  # Test the complete Ubuntu configuration with staged drop-ins, without writing /etc/ssh.
  awk -v include_path="$work_dir/sshd_config.d/*.conf" '
    /^[[:space:]]*Include[[:space:]]+\/etc\/ssh\/sshd_config.d\/\*\.conf[[:space:]]*$/ {
      print "Include " include_path; found = 1; next
    }
    { print }
    END { if (!found) exit 1 }
  ' /etc/ssh/sshd_config > "$work_dir/sshd-test.conf" || fail 'Expected the Ubuntu sshd_config.d Include in /etc/ssh/sshd_config.'
  sshd -t -f "$work_dir/sshd-test.conf" || fail 'Generated SSH configuration failed validation; live SSH settings were not changed.'
  sshd -T -f "$work_dir/sshd-test.conf" -C "user=$admin_user,host=localhost,addr=127.0.0.1" > "$work_dir/sshd-effective"
  [[ "$no_db_tunnel" == true ]] || forwarding=local
  while IFS= read -r setting; do
    grep -Fxq "$setting" "$work_dir/sshd-effective" || fail "An existing SSH setting overrides the guide: $setting. Live SSH settings were not changed."
  done <<EOF
port $ssh_port
permitrootlogin no
passwordauthentication no
kbdinteractiveauthentication no
pubkeyauthentication yes
maxauthtries 3
logingracetime 20
allowusers $admin_user
x11forwarding no
allowagentforwarding no
allowtcpforwarding $forwarding
clientaliveinterval 300
clientalivecountmax 2
EOF
  [[ "$(grep -c '^port ' "$work_dir/sshd-effective")" -eq 1 && "$(grep -c '^allowusers ' "$work_dir/sshd-effective")" -eq 1 ]] || fail 'Existing SSH settings add ports or users outside the guide. Live SSH settings were not changed.'
  if [[ "$no_db_tunnel" == false ]]; then
    grep -Fxq 'permitopen 127.0.0.1:5050 127.0.0.1:8025' "$work_dir/sshd-effective" || fail 'Existing SSH settings override the loopback tunnel restriction.'
  fi
}

# Read and check the invoking user's AWS keys, never root's authorized_keys.
invoking_home="$(getent passwd "$invoking_user" | cut -d: -f6)"
[[ "$invoking_home" == /* && "$invoking_home" != /root && "$invoking_home" != /root/* ]] || fail 'Refusing to read SSH keys from a root home directory.'
source_keys="$invoking_home/.ssh/authorized_keys"
[[ -s "$source_keys" ]] || fail "No authorized_keys found for the invoking user: $source_keys"
tr -d '\r' < "$source_keys" > "$work_dir/authorized_keys"
validate_keys "$work_dir/authorized_keys"
# Never add a second sudo account to a host hardened for another user.
if [[ -f "$ssh_config" ]] && grep -Eq '^[[:space:]]*AllowUsers[[:space:]]' "$ssh_config" &&
   ! grep -Fxq "AllowUsers $admin_user" "$ssh_config"; then
  fail "$ssh_config already allows a different SSH user: $(grep -E '^[[:space:]]*AllowUsers[[:space:]]' "$ssh_config" | head -1). Rerun with that user."
fi
password_status=''
if id "$admin_user" >/dev/null 2>&1; then
  [[ "$(id -u "$admin_user")" -ne 0 && "$(getent passwd "$admin_user" | cut -d: -f6)" == "$admin_home" ]] || fail "$admin_user must be a non-root account with home $admin_home."
  if [[ -e "$admin_home/.ssh/authorized_keys" ]]; then validate_admin_keys; fi
  password_status="$(passwd -S "$admin_user" | awk '{print $2}')"
fi

cat > "$work_dir/99-hardening.conf" <<EOF
# Owner's guide: SSH settings (step 3).
Port $ssh_port
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
AllowUsers $admin_user
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
if [[ "$no_db_tunnel" == false ]]; then
  cat >> "$work_dir/99-hardening.conf" <<EOF

# DentiSys exception: local pgAdmin/Mailpit tunnels only.
# Omit this separate block with --no-db-tunnel.
Match User $admin_user
    AllowTcpForwarding local
    PermitOpen 127.0.0.1:5050 127.0.0.1:8025
EOF
fi
stage_ssh
if [[ "$check_only" == true ]]; then
  [[ "$password_status" == P && -f "$ssh_config" ]] || exit 1
  validate_admin_keys
  cmp -s "$work_dir/99-hardening.conf" "$ssh_config"
  exit $?
fi

# All operator input precedes changes to the live host. passwd handles both
# hidden entries in a private prefix; only its hash is applied during step 2.
if [[ "$password_status" != P ]]; then
  install -d -m 0700 "$work_dir/password/etc"
  printf 'root:x:0:0:root:/root:/bin/bash\n%s:x:1000:1000::%s:/bin/bash\n' "$admin_user" "$admin_home" > "$work_dir/password/etc/passwd"
  printf 'root:*:0:0:99999:7:::\n%s:!:0:0:99999:7:::\n' "$admin_user" > "$work_dir/password/etc/shadow"
  cp /etc/login.defs "$work_dir/password/etc/login.defs"
  if [[ "$password_stdin" == true ]]; then echo "Applying the $admin_user password supplied at the launcher."; else echo "Set the $admin_user sudo password now. passwd will ask for it twice."; fi
  if [[ "$password_stdin" == true ]]; then
    printf '%s:%s\n' "$admin_user" "$password" | chpasswd --prefix "$work_dir/password"
  else
    passwd --prefix "$work_dir/password" "$admin_user"
  fi
  [[ "$(passwd --prefix "$work_dir/password" -S "$admin_user" | awk '{print $2}')" == P ]] || fail "$admin_user needs a usable sudo password."
else
  echo "$admin_user already has a usable password; it will be retained."
fi
unset password
echo 'Keep this session open. Have an AWS recovery route ready (Session Manager, or configured EC2 Instance Connect).'
if [[ "$sg_confirmed" == false ]]; then
  read -r -p "Does the AWS Security Group already allow TCP $ssh_port from your IP and TCP 80/443 for the web server? Type yes to continue: " security_group_ready
  [[ "$security_group_ready" == yes ]] || fail 'Security Group confirmation declined. No live host settings were changed.'
else
  echo 'Security Group readiness was confirmed at the launcher summary.'
fi
exec </dev/null
export DEBIAN_FRONTEND=noninteractive APT_LISTCHANGES_FRONTEND=none NEEDRESTART_MODE=a

# Step 1: patch the host and configure unattended upgrades.
apt update
apt -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade -y
apt -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold install -y unattended-upgrades apt-listchanges
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
chmod 644 /etc/apt/apt.conf.d/20auto-upgrades

# Step 2: create the sudo account and copy the invoking user's AWS public keys.
if ! id "$admin_user" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$admin_user"
fi
usermod -aG sudo "$admin_user"
if [[ "$password_status" != P ]]; then
  awk -F: -v account="$admin_user" '$1 == account { print $1 ":" $2 }' "$work_dir/password/etc/shadow" | chpasswd -e
  rm -rf -- "$work_dir/password"
fi
target_group="$(id -gn "$admin_user")"
install -d -m 0700 -o "$admin_user" -g "$target_group" "$admin_home/.ssh"
install -m 0600 -o "$admin_user" -g "$target_group" "$work_dir/authorized_keys" "$admin_home/.ssh/authorized_keys"

# Step 3: stop on any lockout pre-check failure before writing the live drop-in.
validate_admin_keys
[[ "$(passwd -S "$admin_user" | awk '{print $2}')" == P ]] || fail "$admin_user has no usable sudo password."
stage_ssh
had_config=false
service_enabled=false
socket_enabled=false
socket_active=false
if [[ -f "$ssh_config" ]]; then
  cp -p -- "$ssh_config" "$work_dir/previous-sshd.conf"
  had_config=true
fi
if systemctl is-enabled --quiet ssh.service; then service_enabled=true; fi
if systemctl is-enabled --quiet ssh.socket; then socket_enabled=true; fi
if systemctl is-active --quiet ssh.socket; then socket_active=true; fi
install -m 0644 "$work_dir/99-hardening.conf" "$ssh_config"
if ! sshd -t || ! systemctl stop ssh.socket || ! systemctl disable ssh.socket ||
   ! systemctl enable ssh.service || ! systemctl restart ssh.service ||
   ! systemctl is-active --quiet ssh.service; then
  if [[ "$had_config" == true ]]; then
    cp -p -- "$work_dir/previous-sshd.conf" "$ssh_config"
  else
    rm -f -- "$ssh_config"
  fi
  # Restore the original socket/service startup mode as well as the drop-in.
  if sshd -t; then
    if [[ "$service_enabled" == false ]]; then systemctl disable ssh.service || echo 'WARNING: Could not restore ssh.service startup mode.' >&2; fi
    if [[ "$socket_enabled" == true ]]; then systemctl enable ssh.socket || echo 'WARNING: Could not re-enable ssh.socket.' >&2; fi
    if [[ "$socket_active" == true ]]; then
      systemctl stop ssh.service || echo 'WARNING: Could not stop ssh.service for socket recovery.' >&2
      systemctl start ssh.socket || echo 'WARNING: Could not restore ssh.socket.' >&2
    else
      systemctl restart ssh.service || echo 'WARNING: Could not restart SSH with the previous configuration.' >&2
    fi
  fi
  fail 'SSH switch failed; restored the previous drop-in. Keep this session open and use AWS EC2 Instance Connect / Session Manager if recovery is needed.'
fi

# Step 4: firewall policies and only the guide's SSH/HTTP/HTTPS rules.
apt -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw limit "$ssh_port/tcp" comment "SSH"
ufw allow 80/tcp comment "HTTP"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
ufw status verbose

# Step 5: journal-backed SSH fail2ban jail.
apt -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold install -y fail2ban
cat > /etc/fail2ban/jail.d/sshd.local <<EOF
[sshd]
enabled = true
port = $ssh_port
maxretry = 3
findtime = 10m
bantime = 1h
backend = systemd
EOF
chmod 644 /etc/fail2ban/jail.d/sshd.local
fail2ban-client -t
systemctl enable --now fail2ban.service
systemctl restart fail2ban.service
# Wait for the journal-backed jail without another operator prompt.
jail_ready=false
for attempt in {1..10}; do
  if fail2ban-client status sshd > "$work_dir/fail2ban-status" 2>&1; then jail_ready=true; break; fi
  sleep 1
done
cat "$work_dir/fail2ban-status"
[[ "$jail_ready" == true ]] || fail 'The fail2ban SSH jail did not become ready.'

# Step 6: exactly the guide's sysctl settings; Docker's ip_forward is untouched.
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
net.ipv4.conf.default.rp_filter=1
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.all.accept_source_route=0
net.ipv6.conf.all.accept_source_route=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_redirects=0
net.ipv6.conf.all.accept_redirects=0
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.tcp_syncookies=1
net.ipv4.tcp_max_syn_backlog=2048
net.ipv4.tcp_synack_retries=2
net.ipv4.tcp_syn_retries=5
net.ipv4.conf.all.log_martians=1
kernel.randomize_va_space=2
kernel.kptr_restrict=2
kernel.dmesg_restrict=1
kernel.yama.ptrace_scope=1
fs.protected_hardlinks=1
fs.protected_symlinks=1
fs.suid_dumpable=0
EOF
chmod 644 /etc/sysctl.d/99-hardening.conf
sysctl --system
if [[ "$non_interactive" == true ]]; then
  echo 'Hardening complete; provisioning continues in the current SSH session.'
else
cat <<EOF
Hardening complete. Keep this session open until the second login succeeds.
In a SECOND window, test: ssh -i <key> -p $ssh_port $admin_user@<ip>
Use the same AWS .pem and public IP/hostname as your original login.
After a successful login, remove TCP 22 from the AWS Security Group, then continue with the bundle/deploy steps.
Recovery: AWS EC2 -> instance -> Connect -> Session Manager (requires configured SSM Agent/IAM).
EC2 Instance Connect is another route when configured for $admin_user on $ssh_port with network access; the default port-22 browser connection cannot reach the hardened SSH listener.
EOF
fi
if [[ -f /var/run/reboot-required ]]; then
  if [[ "$non_interactive" == true ]]; then
    echo 'A reboot is required; provisioning reboots only after deployment and verification pass.'
  else
    echo 'A reboot is required. Reboot manually after verifying the new key login; this run keeps the current SSH session alive.'
  fi
fi
