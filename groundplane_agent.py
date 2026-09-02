#!/usr/bin/env python3
"""
Groundplane collector.

Runs on a server inside a network and reports what it can see. One
collector belongs to exactly one environment and cannot write to any
other, which is enforced by the token it holds, not by anything in this
file.

    # first run, once, using the code shown in Groundplane
    python3 groundplane_agent.py enroll --code A1B2C3D4E5F6

    # afterwards
    python3 groundplane_agent.py run --once
    python3 groundplane_agent.py run --daemon --interval 3600

Enrollment
    The dashboard issues a 12 character code that expires in 24 hours.
    `enroll` exchanges it once for a long-lived token which is written
    to a local config file with 0600 permissions. The long secret never
    appears in a command line, so it stays out of shell history and out
    of the process list on a shared box.

    The token carries the environment id. There is no flag to change
    which environment a collector reports to, so a misconfigured or
    copied collector cannot write into another customer's data. That is
    also enforced server side: the row level policies key off the
    environment the token resolves to.

Credentials
    This collector never reads, stores, or transmits a password, key,
    PSK, community string, or door code. It records that a control
    exists and how it is configured, never the secret itself. Every
    payload passes through scrub() before leaving the process as a
    backstop, not as the primary defence.
"""

import argparse
import json
import random
import os
import platform
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

VERSION = "1.0.0"

# Baked at build time by the dashboard's installer generator.
SUPABASE_URL = os.environ.get("GP_URL", "https://tejsbytmtcdzvgzlpkgp.supabase.co")
SUPABASE_KEY = os.environ.get("GP_KEY", "sb_publishable_Wu9i_AiY83mk7NwPRuq4qw_I7C0Eu7R")

CONFIG_DIR = os.environ.get("GP_CONFIG_DIR") or os.path.expanduser("~/.groundplane")
CONFIG_PATH = os.path.join(CONFIG_DIR, "agent.json")

SECRET_KEY = re.compile(
    r"(pass|pwd|secret|token|key|psk|community|credential|hash|salt|pin|code)", re.I)


def scrub(obj):
    """Drop anything that looks like a secret, at any depth."""
    if isinstance(obj, dict):
        return {k: ("[omitted by collector]" if SECRET_KEY.search(str(k)) else scrub(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub(v) for v in obj]
    return obj


def run_cmd(cmd, timeout=20):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           timeout=timeout, shell=isinstance(cmd, str))
        return (r.stdout or "") + (r.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return ""


def has(b):
    return shutil.which(b) is not None


IS_WIN = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"


# ── config ──────────────────────────────────────────────────────────

def load_config():
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save_config(cfg):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cfg, f, indent=2)
    # 0600 before the rename, so the token is never briefly world readable
    os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
    os.replace(tmp, CONFIG_PATH)


def api(path, method="GET", body=None, token=None, timeout=20):
    url = SUPABASE_URL.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"error": raw[:300]}
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": str(e)}


# ── enrollment ──────────────────────────────────────────────────────

def cmd_enroll(args):
    code = (args.code or "").strip().upper()
    if not re.fullmatch(r"[0-9A-F]{12}", code):
        sys.exit("That does not look like an enrollment code. Expect 12 hex characters.")

    status, body = api("/rest/v1/rpc/enroll_agent", "POST", {
        "p_code": code,
        "p_hostname": socket.gethostname(),
        "p_platform": platform.system() + " " + platform.release(),
        "p_version": VERSION,
    })
    if status != 200 or not body:
        sys.exit("Enrollment failed: %s" % (body or {}).get("message",
                 (body or {}).get("error", "code %s" % status)))

    row = body[0] if isinstance(body, list) else body
    token = row.get("token")
    env = row.get("environment_id")
    if not token or not env:
        sys.exit("Enrollment returned no token. The code may be used or expired.")

    save_config({"token": token, "environment_id": env,
                 "agent_id": row.get("agent_id"),
                 "enrolled_at": datetime.now(timezone.utc).isoformat()})
    print("Enrolled. Token written to %s with owner-only permissions." % CONFIG_PATH)
    print("This collector reports to environment %s and cannot report to any other." % env)


# ── checks ──────────────────────────────────────────────────────────

def chk(cid, state, detail, **data):
    return {"id": cid, "state": state, "detail": detail, "data": data}


def check_patch():
    if IS_LINUX and has("apt-get"):
        out = run_cmd(["apt-get", "-s", "upgrade"])
        m = re.search(r"(\d+) upgraded, (\d+) newly installed", out)
        # count packages from a security pocket, not lines containing the word
        sec = len([l for l in out.splitlines()
                   if l.startswith("Inst ") and "-security" in l])
        if m:
            n = int(m.group(1))
            if n == 0:
                return chk("patch.pending", "pass", "No pending package updates.", pending=0)
            return chk("patch.pending", "fail" if sec else "warn",
                       "%d updates pending, %d from a security pocket." % (n, sec),
                       pending=n, security=sec)
    if IS_WIN:
        out = run_cmd(["powershell", "-NoProfile", "-Command",
                       "(New-Object -ComObject Microsoft.Update.Session)"
                       ".CreateUpdateSearcher().Search('IsInstalled=0').Updates.Count"])
        m = re.search(r"^\s*(\d+)\s*$", out, re.M)
        if m:
            n = int(m.group(1))
            return chk("patch.pending", "pass" if n == 0 else "fail",
                       "%d Windows updates pending." % n, pending=n)
    return chk("patch.pending", "unknown", "No supported package manager found.")


def check_firewall():
    if IS_LINUX:
        if has("ufw"):
            out = run_cmd(["ufw", "status"])
            if re.search(r"Status:\s*active", out, re.I):
                return chk("fw.enabled", "pass", "Host firewall active (ufw).")
            if re.search(r"Status:\s*inactive", out, re.I):
                return chk("fw.enabled", "fail", "ufw installed but inactive.")
        if has("firewall-cmd"):
            if "running" in run_cmd(["firewall-cmd", "--state"]):
                return chk("fw.enabled", "pass", "Host firewall active (firewalld).")
            return chk("fw.enabled", "fail", "firewalld present but not running.")
        if has("nft"):
            if run_cmd(["nft", "list", "ruleset"]).strip():
                return chk("fw.enabled", "pass", "nftables ruleset present.")
            return chk("fw.enabled", "fail", "nftables present with an empty ruleset.")
        if has("iptables"):
            rules = [l for l in run_cmd(["iptables", "-S"]).splitlines() if l.startswith("-A")]
            return chk("fw.enabled", "pass" if rules else "fail",
                       "iptables has %d rules." % len(rules))
    if IS_WIN:
        out = run_cmd(["netsh", "advfirewall", "show", "allprofiles"])
        states = re.findall(r"State\s+(\w+)", out)
        if states:
            off = [s for s in states if s.upper() == "OFF"]
            return chk("fw.enabled", "fail" if off else "pass",
                       "%d of %d firewall profiles off." % (len(off), len(states))
                       if off else "All firewall profiles on.")
    return chk("fw.enabled", "unknown", "Could not determine firewall state.")


def check_disk_encryption():
    if IS_WIN:
        out = run_cmd(["powershell", "-NoProfile", "-Command",
                       "Get-BitLockerVolume | Select-Object -ExpandProperty ProtectionStatus"])
        vals = re.findall(r"\b([012])\b", out)
        if vals:
            un = [v for v in vals if v == "0"]
            return chk("disk.encrypted", "fail" if un else "pass",
                       "%d of %d volumes unprotected." % (len(un), len(vals))
                       if un else "All volumes BitLocker protected.")
    if IS_LINUX:
        out = run_cmd(["lsblk", "-o", "NAME,TYPE,FSTYPE"])
        if "crypt" in out or "LUKS" in out:
            return chk("disk.encrypted", "pass", "LUKS encrypted volume present.")
        if out.strip():
            return chk("disk.encrypted", "fail", "No encrypted volume on this host.")
    if IS_MAC:
        out = run_cmd(["fdesetup", "status"])
        if "On" in out:
            return chk("disk.encrypted", "pass", "FileVault on.")
        if "Off" in out:
            return chk("disk.encrypted", "fail", "FileVault off.")
    return chk("disk.encrypted", "unknown", "Could not determine encryption state.")


def check_edr():
    known = ["sentinelone", "sentinelagent", "crowdstrike", "falcon", "csagent",
             "sophos", "carbonblack", "cbagent", "defender", "msmpeng",
             "eset", "bitdefender", "huntress", "webroot", "malwarebytes"]
    out = ""
    if IS_WIN:
        out = run_cmd(["powershell", "-NoProfile", "-Command",
                       "Get-Service | Where-Object {$_.Status -eq 'Running'} "
                       "| Select-Object -ExpandProperty Name"]).lower()
    elif IS_LINUX or IS_MAC:
        out = run_cmd(["ps", "-eo", "comm"]).lower()
    found = sorted({k for k in known if k in out})
    if found:
        return chk("edr.present", "pass",
                   "Endpoint protection running: " + ", ".join(found), products=found)
    if out:
        return chk("edr.present", "fail", "No recognised endpoint protection running.")
    return chk("edr.present", "unknown", "Could not enumerate processes.")


def check_admins():
    """Account names only. Never hashes, never password material."""
    admins = []
    if IS_WIN:
        started = False
        for line in run_cmd(["net", "localgroup", "Administrators"]).splitlines():
            if line.startswith("---"):
                started = True
                continue
            if started and line.strip() and "completed successfully" not in line:
                admins.append(line.strip())
    elif IS_LINUX:
        for line in run_cmd(["getent", "group", "sudo", "wheel"]).splitlines():
            p = line.split(":")
            if len(p) >= 4 and p[3]:
                admins += [a for a in p[3].split(",") if a]
        admins = sorted(set(admins))
    if not admins:
        return chk("admins.count", "unknown", "Could not enumerate administrators.")
    return chk("admins.count", "pass" if len(admins) <= 3 else "warn",
               "%d accounts hold local administrator rights." % len(admins),
               accounts=admins)


def check_ports():
    risky = {23: "telnet", 21: "ftp", 445: "smb", 3389: "rdp",
             5900: "vnc", 139: "netbios", 1433: "mssql", 3306: "mysql"}
    out = run_cmd(["ss", "-lntu"]) or run_cmd(["netstat", "-lntu"]) or run_cmd(["netstat", "-an"])
    ports = {int(m.group(1)) for m in re.finditer(r"[:\.](\d{1,5})\s", out)
             if 0 < int(m.group(1)) < 65536}
    if not ports:
        return chk("ports.listening", "unknown", "Could not enumerate listening ports.")
    exposed = sorted(p for p in ports if p in risky)
    if not exposed:
        return chk("ports.listening", "pass",
                   "%d listening ports, none high risk." % len(ports), count=len(ports))
    return chk("ports.listening", "warn",
               "High risk services listening: " + ", ".join("%d %s" % (p, risky[p]) for p in exposed),
               count=len(ports), exposed=exposed)


def check_smbv1():
    if IS_WIN:
        out = run_cmd(["powershell", "-NoProfile", "-Command",
                       "(Get-SmbServerConfiguration).EnableSMB1Protocol"])
        if re.search(r"\bTrue\b", out):
            return chk("smb.v1", "fail", "SMBv1 is enabled.")
        if re.search(r"\bFalse\b", out):
            return chk("smb.v1", "pass", "SMBv1 disabled.")
    return chk("smb.v1", "unknown", "Not applicable or not readable.")


def check_time():
    if IS_LINUX and has("timedatectl"):
        out = run_cmd(["timedatectl", "show"])
        if "NTPSynchronized=yes" in out:
            return chk("time.sync", "pass", "Clock synchronised to NTP.")
        if "NTPSynchronized=no" in out:
            return chk("time.sync", "warn", "Clock not NTP synchronised.")
    if IS_WIN and "Source:" in run_cmd(["w32tm", "/query", "/status"]):
        return chk("time.sync", "pass", "Windows time service reporting a source.")
    return chk("time.sync", "unknown", "Could not determine time sync.")


def check_backup(marker):
    if not marker:
        return chk("backup.recent", "unknown",
                   "No backup marker configured. Pass --backup-marker.")
    if not os.path.exists(marker):
        return chk("backup.recent", "fail",
                   "Backup marker missing, so no successful run can be confirmed.")
    age_h = (time.time() - os.path.getmtime(marker)) / 3600.0
    if age_h <= 26:
        return chk("backup.recent", "pass",
                   "Backup marker updated %.1f hours ago." % age_h, age_hours=round(age_h, 1))
    return chk("backup.recent", "fail",
               "Backup marker last updated %.1f days ago." % (age_h / 24),
               age_hours=round(age_h, 1))


def check_uptime():
    if IS_LINUX and os.path.exists("/proc/uptime"):
        try:
            days = float(open("/proc/uptime").read().split()[0]) / 86400.0
        except (OSError, ValueError):
            return chk("host.uptime", "unknown", "Could not read uptime.")
        if days > 90:
            return chk("host.uptime", "warn",
                       "Up %.0f days, so pending kernel updates are not applied." % days,
                       days=round(days, 1))
        return chk("host.uptime", "pass", "Up %.0f days." % days, days=round(days, 1))
    return chk("host.uptime", "unknown", "Could not read uptime.")


def discover():
    """Passive ARP table read. No scanning, no probing."""
    out = run_cmd(["ip", "neigh"]) or run_cmd(["arp", "-a"])
    seen, devices = set(), []
    for line in out.splitlines():
        ip = re.search(r"(\d{1,3}(?:\.\d{1,3}){3})", line)
        mac = (re.search(r"([0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5})", line)
               or re.search(r"([0-9a-fA-F]{2}(?:-[0-9a-fA-F]{2}){5})", line))
        if not (ip and mac):
            continue
        m = mac.group(1).lower().replace("-", ":")
        if m in seen:
            continue
        seen.add(m)
        devices.append({"ip": ip.group(1), "mac": m, "oui": m[:8],
                        "state": "stale" if ("FAILED" in line or "INCOMPLETE" in line)
                                 else "reachable"})
    return devices


def collect(args):
    return scrub({
        "agent_version": VERSION,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "host": {"hostname": socket.gethostname(), "os": platform.system(),
                 "release": platform.release(), "arch": platform.machine()},
        "checks": [check_patch(), check_firewall(), check_disk_encryption(),
                   check_edr(), check_admins(), check_ports(), check_smbv1(),
                   check_time(), check_backup(args.backup_marker), check_uptime()],
        "devices": discover(),
    })


SPOOL_DIR = os.path.join(CONFIG_DIR, "spool")
SPOOL_MAX = 500


def spool_write(payload):
    """Persist a report we could not send. Oldest is dropped once the
    cap is reached, so a long outage cannot fill the disk."""
    os.makedirs(SPOOL_DIR, exist_ok=True)
    files = sorted(os.listdir(SPOOL_DIR))
    while len(files) >= SPOOL_MAX:
        try:
            os.remove(os.path.join(SPOOL_DIR, files.pop(0)))
        except OSError:
            break
    name = "%s.json" % payload["collected_at"].replace(":", "").replace(".", "")
    with open(os.path.join(SPOOL_DIR, name), "w") as f:
        json.dump(payload, f)


def spool_list():
    try:
        return sorted(os.listdir(SPOOL_DIR))
    except OSError:
        return []


def post_report(cfg, payload):
    """Returns (ok, fatal). fatal means stop trying: the token is gone."""
    status, body = api("/rest/v1/agent_reports", "POST", {
        "environment_id": cfg["environment_id"],
        "agent_id": cfg.get("agent_id"),
        "collected_at": payload["collected_at"],
        "payload": payload,
    }, token=cfg["token"])
    if 200 <= status < 300:
        return True, False
    if status in (401, 403):
        return False, True
    return False, False


def cmd_run(args):
    cfg = load_config()
    if not cfg:
        sys.exit("Not enrolled. Run: groundplane_agent.py enroll --code YOURCODE")

    backoff = [0]          # seconds of extra wait after a failure

    def flush_spool():
        """Replay missed reports oldest first, so a gap in the record is
        filled in order rather than arriving jumbled."""
        sent = 0
        for name in spool_list():
            path = os.path.join(SPOOL_DIR, name)
            try:
                with open(path) as f:
                    old = json.load(f)
            except (OSError, ValueError):
                os.remove(path)
                continue
            ok, fatal = post_report(cfg, old)
            if fatal:
                return sent, True
            if not ok:
                return sent, False
            os.remove(path)
            sent += 1
        return sent, False

    def once():
        payload = collect(args)
        if args.show:
            print(json.dumps(payload, indent=2))
            return False

        stamp = datetime.now().strftime("%H:%M:%S")
        replayed, fatal = flush_spool()
        if replayed:
            print("[%s] replayed %d spooled report(s)" % (stamp, replayed))
        if fatal:
            print("[%s] token rejected. This collector has been revoked in "
                  "Groundplane. Stopping rather than retrying forever." % stamp)
            return True

        ok, fatal = post_report(cfg, payload)
        if fatal:
            print("[%s] token rejected. This collector has been revoked in "
                  "Groundplane. Stopping rather than retrying forever." % stamp)
            return True
        if ok:
            backoff[0] = 0
            print("[%s] reported %d checks, %d devices"
                  % (stamp, len(payload["checks"]), len(payload["devices"])))
        else:
            spool_write(payload)
            # exponential, capped at 30 minutes, so a provider outage does
            # not turn 150 collectors into a retry storm
            backoff[0] = min(1800, (backoff[0] * 2) or 60)
            print("[%s] upload failed, spooled. Next attempt in %ds (%d queued)."
                  % (stamp, backoff[0], len(spool_list())))
        return False

    if args.daemon:
        while True:
            if once():
                sys.exit(2)
            base = max(60, args.interval)
            # +/- 10 percent, so collectors deployed the same day do not
            # all report on the same second forever
            jitter = base * random.uniform(-0.1, 0.1)
            time.sleep(max(30, base + jitter + backoff[0]))
    else:
        once()


def main():
    ap = argparse.ArgumentParser(description="Groundplane collector")
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("enroll", help="exchange a one time code for a token")
    e.add_argument("--code", required=True)
    e.set_defaults(func=cmd_enroll)

    r = sub.add_parser("run", help="collect and report")
    r.add_argument("--once", action="store_true")
    r.add_argument("--daemon", action="store_true")
    r.add_argument("--interval", type=int, default=3600)
    r.add_argument("--backup-marker", default=os.environ.get("GP_BACKUP_MARKER", ""),
                   help="file the backup job touches on success")
    r.add_argument("--print", dest="show", action="store_true",
                   help="print the payload and upload nothing")
    r.set_defaults(func=cmd_run)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
