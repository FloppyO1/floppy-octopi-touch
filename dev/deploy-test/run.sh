#!/usr/bin/env bash
# Installer test (service `deploy-test`): prepares a Debian bookworm container like OctoPi, installs the
# newest release from release/, checks the result, runs the agent and the kiosk launcher (with a fake
# Chromium), then update.sh and uninstall.sh. systemd is not PID 1 here: units are enabled, not started.
set -euo pipefail

KEY=floppyoctotouch-deploy-test-key-0123456789
PREFIX=/opt/floppyoctotouch
CONFIG=/home/pi/.config/floppyoctotouch/config.json
BOOT=/boot/firmware
PASSED=0
FAILED=0

section() { printf '\n### %s\n' "$*"; }

check() {
  local what=$1
  shift
  if "$@" >/dev/null 2>&1; then
    PASSED=$((PASSED + 1))
    printf '  ok    %s\n' "$what"
  else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$what"
  fi
}

# check_eq DESCRIPTION EXPECTED ACTUAL
check_eq() {
  if [ "$2" = "$3" ]; then
    PASSED=$((PASSED + 1))
    printf '  ok    %s\n' "$1"
  else
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s: expected [%s], got [%s]\n' "$1" "$2" "$3"
  fi
}

config_value() {
  python3 -c '
import json, sys
value = json.load(open(sys.argv[1])).get(sys.argv[2])
print(value if isinstance(value, str) else json.dumps(value))
' "$CONFIG" "$1"
}

wait_url() {
  local _
  for _ in $(seq 1 100); do
    curl -fsS -o /dev/null --max-time 1 "$1" 2>/dev/null && return 0
    sleep 0.2
  done
  return 1
}

count() { grep -cF -- "$1" "$2" || true; }

tarball=$(find /release -maxdepth 1 -name 'floppyoctotouch-*.tar.gz' -printf '%T@ %p\n' | sort -n | tail -n1 |
  cut -d' ' -f2)
[ -n "$tarball" ] || {
  echo "no release tarball in release/: run the release service first" >&2
  exit 1
}
version=$(basename "$tarball" .tar.gz)
version=${version#floppyoctotouch-}
work=$(mktemp -d)
cp "$tarball" "$tarball.sha256" "$work/"
tar -xzf "$work/floppyoctotouch-$version.tar.gz" -C "$work"
src=$work/floppyoctotouch-$version
echo "Testing floppyoctotouch-$version"

section "OctoPi-like system"
useradd -m -s /bin/bash pi
runuser -u pi -- mkdir -p /home/pi/.octoprint/uploads
mkdir -p "$BOOT"
printf '# config.txt\ndtoverlay=vc4-kms-v3d\n' >"$BOOT/config.txt"
printf 'console=serial0,115200 console=tty1 root=PARTUUID=0123abcd-02 rootfstype=ext4 rootwait\n' \
  >"$BOOT/cmdline.txt"
cp "$BOOT/config.txt" /tmp/config.txt.orig
cp "$BOOT/cmdline.txt" /tmp/cmdline.txt.orig
cat >/etc/systemd/system/octoprint.service <<'EOF'
[Unit]
Description=The snappy web interface for your 3D printer
After=network-online.target

[Service]
Type=exec
User=pi
ExecStart=/opt/octopi/oprint/bin/octoprint serve --host=127.0.0.1 --port=5000

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q getty@tty1.service
python3 /test/fake_octoprint.py "$KEY" &
check "fake OctoPrint on :5000" wait_url "http://127.0.0.1:5000/robots.txt"

section "install.sh --non-interactive --api-key=…"
bash "$src/deploy/install.sh" --non-interactive --api-key="$KEY"

check "install.sh is executable in the tarball" bash -c \
  "tar -tvzf $tarball | grep -Eq '^-rwxr-xr-x .* floppyoctotouch-$version/deploy/install.sh$'"
check_eq "installed version" "$version" "$(cat $PREFIX/VERSION)"
check "web app in $PREFIX/frontend" test -f $PREFIX/frontend/index.html
check_eq "agent in the venv" "$version" "$($PREFIX/venv/bin/floppyoctotouch-agent --version)"
check_eq "config.json mode and owner" "600 pi" "$(stat -c '%a %U' $CONFIG)"
check_eq "config: api_key" "$KEY" "$(config_value api_key)"
check_eq "config: host" "127.0.0.1" "$(config_value host)"
check_eq "config: octoprint_url" "http://127.0.0.1:5000" "$(config_value octoprint_url)"
check_eq "config: uploads_dir" "/home/pi/.octoprint/uploads" "$(config_value uploads_dir)"
check_eq "config: usb_roots" '["/media/usb-*"]' "$(config_value usb_roots)"
check_eq "config: usb_eject_command" \
  "[\"sudo\", \"-n\", \"$PREFIX/deploy/usb/usb-mount.sh\", \"eject\", \"{path}\"]" \
  "$(config_value usb_eject_command)"
check_eq "config: kiosk_restart_command" \
  '["sudo", "-n", "/usr/bin/systemctl", "restart", "floppyoctotouch-kiosk.service"]' \
  "$(config_value kiosk_restart_command)"
check "agent unit enabled" test -L /etc/systemd/system/multi-user.target.wants/floppyoctotouch-agent.service
check "kiosk unit enabled" test -L /etc/systemd/system/multi-user.target.wants/floppyoctotouch-kiosk.service
check "getty@tty1 disabled" test ! -e /etc/systemd/system/getty.target.wants/getty@tty1.service
check "units rendered for pi (uid 1000)" grep -q '^Environment=XDG_RUNTIME_DIR=/run/user/1000$' \
  /etc/systemd/system/floppyoctotouch-agent.service
check "kiosk unit runs cage as pi" grep -q '^User=pi$' /etc/systemd/system/floppyoctotouch-kiosk.service
if ! systemd-analyze verify --man=no /etc/systemd/system/floppyoctotouch-agent.service \
  /etc/systemd/system/floppyoctotouch-kiosk.service 2>/tmp/verify.log; then
  cat /tmp/verify.log
fi
check "systemd-analyze verify" test ! -s /tmp/verify.log
check "PAM session file" test -f /etc/pam.d/floppyoctotouch-kiosk
check "kiosk.env" test -f /etc/floppyoctotouch/kiosk.env
check "sudoers rule is valid" visudo -c -q -f /etc/sudoers.d/floppyoctotouch
check "pi may restart the kiosk" runuser -u pi -- sudo -n -l /usr/bin/systemctl restart floppyoctotouch-kiosk.service
check "pi may eject a stick" runuser -u pi -- sudo -n -l $PREFIX/deploy/usb/usb-mount.sh eject /media/usb-KINGSTON
check "pi may not restart OctoPrint" test "$(runuser -u pi -- sudo -n -l /usr/bin/systemctl restart octoprint 2>/dev/null)" = ""
check "udev rule for pi" grep -q 'usb-mount.sh add %k pi"' /etc/udev/rules.d/99-floppyoctotouch-usb.rules
for group in video input render; do
  check "pi in the $group group" bash -c "id -nG pi | grep -qw $group"
done
check_eq "display block in config.txt" 1 "$(count '# >>> FloppyOctoTouch display >>>' $BOOT/config.txt)"
check_eq "video= in cmdline.txt" 1 "$(count 'video=HDMI-A-1:1024x600@60' $BOOT/cmdline.txt)"
check "cmdline.txt is still one line" test "$(wc -l <$BOOT/cmdline.txt)" = 1
check "boot file backups" bash -c "ls $BOOT/config.txt.floppyoctotouch-*.bak $BOOT/cmdline.txt.floppyoctotouch-*.bak"
check "update/uninstall commands" test -L /usr/local/bin/floppyoctotouch-update -a -L /usr/local/bin/floppyoctotouch-uninstall
check "state file" grep -q '^FOT_USER_SAVED=pi$' /etc/floppyoctotouch/install.conf

section "agent with the installed configuration"
runuser -u pi -- env FOT_CONFIG=$CONFIG $PREFIX/venv/bin/floppyoctotouch-agent >/tmp/agent.log 2>&1 &
agent_pid=$!
check "agent answers" wait_url http://127.0.0.1:8765/local/health
health=$(curl -s http://127.0.0.1:8765/local/health)
check "OctoPrint authorized through the saved key" python3 -c '
import json, sys
body = json.loads(sys.argv[1])
assert body["octoprint"]["authorized"] and body["version"] == sys.argv[2], body
' "$health" "$version"
check "serves the installed web app" cmp <(curl -s http://127.0.0.1:8765/) $PREFIX/frontend/index.html
check "API key source is the config file" bash -c \
  "curl -s http://127.0.0.1:8765/local/apikey | grep -q '\"source\": \"file\"'"

section "kiosk launcher (fake Chromium)"
mkdir -p /tmp/stub /tmp/xdg-pi
chown pi: /tmp/xdg-pi
cat >/tmp/stub/chromium <<'EOF'
#!/bin/sh
printf '%s\n' "$@" >/tmp/xdg-pi/chromium.args
EOF
chmod 755 /tmp/stub/chromium
runuser -u pi -- env PATH="/tmp/stub:$PATH" XDG_RUNTIME_DIR=/tmp/xdg-pi FOT_CHROMIUM_FLAGS="--extra-one --extra-two" \
  bash $PREFIX/deploy/kiosk/kiosk.sh 2>/dev/null
args=/tmp/xdg-pi/chromium.args
check "chromium started in kiosk mode" grep -qx -- --kiosk $args
check "on Wayland" grep -qx -- --ozone-platform=wayland $args
check "fresh profile in XDG_RUNTIME_DIR" grep -qx -- --user-data-dir=/tmp/xdg-pi/floppyoctotouch-chromium $args
check "extra flags from kiosk.env" grep -qx -- --extra-two $args
check_eq "dashboard URL last" "http://127.0.0.1:8765/?kiosk=1" "$(tail -n1 $args)"
kill "$agent_pid"
wait "$agent_pid" 2>/dev/null || true

section "USB mount helper (fake systemd-mount)"
mv /usr/bin/systemd-mount /usr/bin/systemd-mount.real
cat >/usr/bin/systemd-mount <<'EOF'
#!/bin/sh
printf '%s\n' "$@" >/tmp/systemd-mount.args
EOF
chmod 755 /usr/bin/systemd-mount
usb=$PREFIX/deploy/usb/usb-mount.sh
mount_args() {
  rm -f /tmp/systemd-mount.args
  env FOT_USB_MEDIA=/tmp/media "$@" >/dev/null 2>&1 || true
  cat /tmp/systemd-mount.args 2>/dev/null | tr '\n' ' ' || true
}
check_eq "FAT stick: read-only, owned by pi, named after the label" \
  "--no-block --automount=no --collect --type=vfat --options=ro,nosuid,nodev,noexec,noatime,umask=0022 --description=USB stick My_Stick_ (FloppyOctoTouch) --owner=pi /dev/sdz1 /tmp/media/usb-My_Stick_ " \
  "$(mount_args ID_FS_TYPE=vfat 'ID_FS_LABEL=My Stick!' "$usb" add sdz1 pi)"
check_eq "NTFS through ntfs3, no label" \
  "--no-block --automount=no --collect --type=ntfs3 --options=ro,nosuid,nodev,noexec,noatime,umask=0022 --description=USB stick sdz1 (FloppyOctoTouch) --owner=pi /dev/sdz1 /tmp/media/usb-sdz1 " \
  "$(mount_args ID_FS_TYPE=ntfs "$usb" add sdz1 pi)"
check_eq "ext4 without owner option" \
  "--no-block --automount=no --collect --type=ext4 --options=ro,nosuid,nodev,noexec,noatime --description=USB stick DATA (FloppyOctoTouch) /dev/sdz1 /tmp/media/usb-DATA " \
  "$(mount_args ID_FS_TYPE=ext4 ID_FS_LABEL=DATA "$usb" add sdz1 pi)"
check_eq "unsupported file system ignored" "" "$(mount_args ID_FS_TYPE=swap "$usb" add sdz1 pi)"
check_eq "odd device name refused" "" "$(mount_args ID_FS_TYPE=vfat "$usb" add ../sda1 pi)"
check "eject refuses paths outside /media/usb-*" bash -c "! $usb eject /etc 2>/dev/null"
check "eject refuses a mount point that is not mounted" bash -c "! $usb eject /media/usb-NOPE 2>/dev/null"
check_eq "eject never called systemd-mount" "" "$(cat /tmp/systemd-mount.args 2>/dev/null || true)"
mv /usr/bin/systemd-mount.real /usr/bin/systemd-mount

section "install.sh again from the installed copy (idempotent)"
bash $PREFIX/deploy/install.sh --non-interactive
check_eq "API key kept" "$KEY" "$(config_value api_key)"
check_eq "config.json mode" "600" "$(stat -c '%a' $CONFIG)"
check_eq "display block still once" 1 "$(count '# >>> FloppyOctoTouch display >>>' $BOOT/config.txt)"
check_eq "video= still once" 1 "$(count 'video=HDMI-A-1' $BOOT/cmdline.txt)"
check_eq "agent still installed" "$version" "$($PREFIX/venv/bin/floppyoctotouch-agent --version)"

section "update.sh"
echo 'FOT_CHROMIUM_FLAGS=--kept-by-update' >>/etc/floppyoctotouch/kiosk.env
runuser -u pi -- sh -c 'echo "{\"schemaVersion\": 7, \"marker\": true}" >~/.config/floppyoctotouch/settings.json'
mkdir -p /tmp/bad
cp "$work/floppyoctotouch-$version.tar.gz" /tmp/bad/
sed 's/^./0/' "$work/floppyoctotouch-$version.tar.gz.sha256" >"/tmp/bad/floppyoctotouch-$version.tar.gz.sha256"
check "damaged tarball refused" bash -c "! floppyoctotouch-update --non-interactive --force /tmp/bad/floppyoctotouch-$version.tar.gz"
check "same version refused without --force" bash -c \
  "! floppyoctotouch-update --non-interactive $work/floppyoctotouch-$version.tar.gz"
floppyoctotouch-update --non-interactive --force "$work/floppyoctotouch-$version.tar.gz"
check "kiosk.env kept" grep -qx 'FOT_CHROMIUM_FLAGS=--kept-by-update' /etc/floppyoctotouch/kiosk.env
check "dashboard settings kept" grep -q '"marker": true' /home/pi/.config/floppyoctotouch/settings.json
check_eq "API key kept" "$KEY" "$(config_value api_key)"
check_eq "display block not duplicated" 1 "$(count '# >>> FloppyOctoTouch display >>>' $BOOT/config.txt)"

section "uninstall.sh"
floppyoctotouch-uninstall --non-interactive
check "$PREFIX removed" test ! -e $PREFIX
check "units removed" test ! -e /etc/systemd/system/floppyoctotouch-agent.service -a ! -e /etc/systemd/system/floppyoctotouch-kiosk.service
check "no dangling enable links" test ! -L /etc/systemd/system/multi-user.target.wants/floppyoctotouch-kiosk.service
check "getty@tty1 enabled again" test -L /etc/systemd/system/getty.target.wants/getty@tty1.service
check "udev rule, sudoers and PAM removed" test ! -e /etc/udev/rules.d/99-floppyoctotouch-usb.rules -a ! -e /etc/sudoers.d/floppyoctotouch -a ! -e /etc/pam.d/floppyoctotouch-kiosk
check "/etc/floppyoctotouch removed" test ! -e /etc/floppyoctotouch
check "commands removed" test ! -e /usr/local/bin/floppyoctotouch-update
check "config.txt restored" cmp /tmp/config.txt.orig $BOOT/config.txt
check "cmdline.txt restored" cmp /tmp/cmdline.txt.orig $BOOT/cmdline.txt
check "configuration kept without --purge" test -f $CONFIG

section "install.sh from a git clone (bundled release/ tarball)"
clone=/tmp/clone
mkdir -p "$clone/release" "$clone/agent"
cp -r "$src/deploy" "$clone/deploy"
cp "$work/floppyoctotouch-$version.tar.gz" "$work/floppyoctotouch-$version.tar.gz.sha256" "$clone/release/"
printf '[project]\nversion = "%s"\n' "$version" >"$clone/agent/pyproject.toml"
bash "$clone/deploy/install.sh" --non-interactive --skip-display-config
check_eq "installed from the bundled tarball" "$version" "$(cat $PREFIX/VERSION)"
check_eq "saved API key reused" "$KEY" "$(config_value api_key)"
check "display settings skipped" cmp /tmp/config.txt.orig $BOOT/config.txt
sed -i 's/^./0/' "$clone/release/floppyoctotouch-$version.tar.gz.sha256"
check "damaged bundled tarball refused" bash -c "! bash $clone/deploy/install.sh --non-interactive 2>/dev/null"
floppyoctotouch-uninstall --non-interactive --purge
check "configuration deleted with --purge" test ! -e /home/pi/.config/floppyoctotouch

section "not root: 'bash deploy/install.sh' without the executable bit runs itself through sudo"
# OctoPi's default user may use sudo without a password.
echo 'pi ALL=(ALL) NOPASSWD: ALL' >/etc/sudoers.d/010_pi-nopasswd
chmod 440 /etc/sudoers.d/010_pi-nopasswd
noexec=/tmp/clone-noexec
mkdir -p "$noexec/release" /tmp/pub
cp -r "$clone/deploy" "$clone/agent" "$noexec/"
cp "$work/floppyoctotouch-$version.tar.gz" "$work/floppyoctotouch-$version.tar.gz.sha256" "$noexec/release/"
cp "$work/floppyoctotouch-$version.tar.gz" "$work/floppyoctotouch-$version.tar.gz.sha256" /tmp/pub/
find "$noexec" -type f -exec chmod 644 {} +
chmod -R a+rX "$noexec" /tmp/pub
check "install.sh has lost its executable bit" test ! -x "$noexec/deploy/install.sh"
status=0
runuser -u pi -- bash "$noexec/deploy/install.sh" --non-interactive --api-key="$KEY" --skip-display-config \
  >/tmp/elevate.log 2>&1 || status=$?
check_eq "installed by pi" 0 "$status"
check "said it runs itself again with sudo" grep -q "running it again with sudo" /tmp/elevate.log
check_eq "installed version" "$version" "$(cat $PREFIX/VERSION)"
check_eq "config.json mode and owner" "600 pi" "$(stat -c '%a %U' $CONFIG)"
check "update.sh from pi runs itself through sudo" \
  runuser -u pi -- floppyoctotouch-update --non-interactive --force "/tmp/pub/floppyoctotouch-$version.tar.gz"
check "uninstall.sh from pi runs itself through sudo" runuser -u pi -- floppyoctotouch-uninstall --non-interactive --purge
check "uninstalled" test ! -e $PREFIX -a ! -e /home/pi/.config/floppyoctotouch

# Interactive runs on a fake terminal: every question must come before apt starts ("Installing packages").
drive() { python3 /test/drive.py --no-prompt-after "Installing packages" "$@"; }

section "interactive install: key refused, then accepted; Ctrl+C cancels the reboot"
status=0
drive --transcript /tmp/drive1.log --interrupt-on "Ctrl+C to cancel" --answers "$(printf '%s' \
  '[["API key", "not a key"], ["API key", "wrong-key-0123456789abcdef"], ["API key", " '"$KEY"' "],' \
  ' ["display settings", ""], ["Reboot automatically", ""]]')" -- bash "$src/deploy/install.sh" || status=$?
check_eq "installer finished, questions only at the start, user not asked" 0 "$status"
check "shows where to create the key" grep -q "Settings (wrench icon at the top) > Application Keys" /tmp/drive1.log
check "bad format asked again" grep -q "does not look like an API key" /tmp/drive1.log
check "refused key asked again" grep -q "OctoPrint rejected that key" /tmp/drive1.log
check_eq "accepted key saved (spaces removed)" "$KEY" "$(config_value api_key)"
check_eq "display settings added (Enter = yes)" 1 "$(count '# >>> FloppyOctoTouch display >>>' $BOOT/config.txt)"
check "reboot countdown cancelled with Ctrl+C" grep -q "reboot cancelled: starting the dashboard now" /tmp/drive1.log

section "interactive reinstall: saved key kept without asking, reboot after the countdown"
status=0
drive --transcript /tmp/drive2.log --answers '[["Reboot automatically", "y"]]' -- bash "$src/deploy/install.sh" ||
  status=$?
check_eq "only the reboot question" 0 "$status"
check "saved key kept" grep -q "still accepted by OctoPrint: kept" /tmp/drive2.log
check "countdown ran out (no systemd here, so no reboot)" \
  grep -q "systemd is not running (container?): not rebooting" /tmp/drive2.log
floppyoctotouch-uninstall --non-interactive --purge

section "interactive install without a key (Enter): the touch screen asks for it"
status=0
drive --transcript /tmp/drive3.log \
  --answers '[["API key", ""], ["display settings", "n"], ["Reboot automatically", ""]]' \
  -- bash "$src/deploy/install.sh" || status=$?
check_eq "installer finished" 0 "$status"
check "warned about the missing key" grep -q "the touch screen asks for it" /tmp/drive3.log
check_eq "no key in config.json" null "$(config_value api_key)"
check "display settings declined" cmp /tmp/config.txt.orig $BOOT/config.txt
floppyoctotouch-uninstall --non-interactive --purge

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" = 0 ]
