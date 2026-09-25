#!/usr/bin/env bash
# Read-only automount of USB sticks for FloppyOctoTouch.
#
#   usb-mount.sh add <kernel name> <owner>   from the udev rule (ID_FS_TYPE, ID_FS_LABEL in the environment)
#   usb-mount.sh remove <kernel name>        from the udev rule, when the stick is pulled out
#   usb-mount.sh eject <mount point>         from the agent ("Eject" button), through sudo
#
# Sticks are mounted by systemd (systemd-mount --no-block, as udev rules must not wait) on
# /media/usb-<label>, read-only, never executable. Disks of the running system are skipped.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

MEDIA=${FOT_USB_MEDIA:-/media}

log() {
  logger -t floppyoctotouch-usb -- "$*" 2>/dev/null || true
  printf 'floppyoctotouch-usb: %s\n' "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

# Label -> safe directory name: letters, digits, "." "_" "-" only, at most 32 characters.
safe_name() {
  local name
  name=$(printf '%s' "$1" | LC_ALL=C tr -c 'A-Za-z0-9._-' '_' | cut -c1-32)
  while [[ $name == [._-]* ]]; do
    name=${name:1}
  done
  printf '%s' "$name"
}

# Parent disk of a partition (sda1 -> sda); the device itself when it is not a partition.
parent_disk() {
  local parent
  parent=$(lsblk -ndo PKNAME "$1" 2>/dev/null | head -n1 || true)
  if [ -n "$parent" ]; then
    printf '%s' "$parent"
  else
    basename "$1"
  fi
}

add() {
  local kname=$1 owner=$2 dev fstype=${ID_FS_TYPE:-} label=${ID_FS_LABEL:-} type options own=0
  local name target root_source root_disk
  [[ $kname =~ ^[a-z][a-z0-9]*$ ]] || fail "ignoring '$kname': unexpected device name"
  [[ $owner =~ ^[a-z_][a-z0-9_-]*$ ]] || fail "ignoring $kname: unexpected owner '$owner'"
  dev=/dev/$kname

  if findmnt -rn -S "$dev" >/dev/null 2>&1; then
    log "$dev is already mounted, left alone"
    return 0
  fi
  # A Pi booting from a USB SSD: never mount its own partitions as a "stick".
  root_source=$(findmnt -rno SOURCE / 2>/dev/null || true)
  if [[ $root_source == /dev/* ]]; then
    root_disk=$(parent_disk "$root_source")
    if [ "$(parent_disk "$dev")" = "$root_disk" ]; then
      log "$dev is on the system disk, not mounted"
      return 0
    fi
  fi

  options=ro,nosuid,nodev,noexec,noatime
  case $fstype in
    vfat | exfat)
      type=$fstype
      options=$options,umask=0022
      own=1
      ;;
    ntfs)
      type=ntfs3
      options=$options,umask=0022
      own=1
      ;;
    ext2 | ext3 | ext4)
      type=$fstype
      ;;
    *)
      log "$dev: file system '${fstype:-unknown}' not supported (FAT32, exFAT, NTFS, ext4), not mounted"
      return 0
      ;;
  esac

  name=$(safe_name "$label")
  [ -n "$name" ] || name=$kname
  target=$MEDIA/usb-$name
  if mountpoint -q "$target" 2>/dev/null; then
    target=$MEDIA/usb-$name-$kname
  fi

  local -a args=(--no-block --automount=no --collect "--type=$type" "--options=$options"
    "--description=USB stick $name (FloppyOctoTouch)")
  if [ "$own" = 1 ]; then
    args+=("--owner=$owner")
  fi
  log "mounting $dev ($fstype) read-only on $target"
  systemd-mount "${args[@]}" "$dev" "$target"
}

remove() {
  local kname=$1 target
  [[ $kname =~ ^[a-z][a-z0-9]*$ ]] || fail "ignoring '$kname': unexpected device name"
  # The mount unit is bound to the device and normally goes away by itself; this catches the rest.
  while IFS= read -r target; do
    [[ $target == "$MEDIA"/usb-* ]] || continue
    log "stick /dev/$kname removed: unmounting $target"
    systemd-mount --no-block --umount "$target" || true
  done < <(findmnt -rno TARGET -S "/dev/$kname" 2>/dev/null || true)
}

eject() {
  local target=$1 source
  [[ $target =~ ^/media/usb-[A-Za-z0-9._-]+$ ]] || fail "refusing to eject '$target': not a USB stick mount point"
  mountpoint -q "$target" || fail "$target is not mounted"
  source=$(findmnt -rno SOURCE --mountpoint "$target")
  [[ $source == /dev/sd* ]] || fail "refusing to eject $target: $source is not a USB disk"
  sync
  systemd-mount --umount "$target"
  log "ejected $target ($source)"
}

case ${1:-} in
  add)
    [ $# -eq 3 ] || fail "usage: $0 add <kernel name> <owner>"
    add "$2" "$3"
    ;;
  remove)
    [ $# -eq 2 ] || fail "usage: $0 remove <kernel name>"
    remove "$2"
    ;;
  eject)
    [ $# -eq 2 ] || fail "usage: $0 eject <mount point>"
    eject "$2"
    ;;
  *)
    fail "usage: $0 add|remove|eject ..."
    ;;
esac
