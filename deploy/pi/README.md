# Deploying the Fleetdeck bug-report relay on a Raspberry Pi

This directory contains the deployment artifacts for the upstream bug-report
relay (plan Task 6–8). The goal: let Fleetdeck users submit bug reports to
`Riloox/fleetdeck-open` without giving users a GitHub token, while keeping the
Pi and the home network as small and locked down as possible.

**Architecture in one line:** the relay binds `127.0.0.1` only; Cloudflare
Tunnel (outbound QUIC, no port forwarding) publishes exactly one hostname to
it; SSH and Fleetdeck administration stay private over LAN/Tailscale; a
dedicated system user runs the relay under a hardened systemd unit; the GitHub
credential is root-only and the relay fails closed without it.

```
PUBLIC INTERNET ──HTTPS──> Cloudflare edge ──outbound tunnel──> cloudflared ──http://127.0.0.1:8787──> relay (fleetdeck-relay user)
                                                                                                          │
LAN / Tailscale (private): SSH (key-only) + Fleetdeck panel + relay /readyz      relay ──https──> api.github.com (fixed paths only)
```

## Files in this directory

| File | Purpose |
| --- | --- |
| `fleetdeck-relay.service` | Hardened systemd unit for the relay. |
| `fleetdeck-relay.env.example` | Environment template → `/etc/fleetdeck-relay/relay.env` (root 0600). |
| `fleetdeck-relay-tmpfiles.conf` | Creates `/var/lib/fleetdeck-relay` owned by the service user. |
| `cloudflared-config.yml.example` | Tunnel ingress: one relay hostname + catch-all 404. |
| `cloudflared.service` | Hardened systemd unit for the tunnel agent. |
| `rotate-github-credential.md` | Rotation and incident procedure for the GitHub credential. |

Companion documents in the repo: `relay/README.md` (wire contract),
`relay/THREAT-MODEL.md` (threat model).

---

## 0. Inputs you must supply before SSH deployment

Nothing below can be invented by this repo — collect these first:

1. **A domain managed in Cloudflare**, e.g. `example.com`, and a chosen relay
   hostname `bugs.example.com` (or `bugs.<subdomain>`). Required for the
   tunnel (Task 7). Without it, the relay can still run LAN-only, but is not
   publicly reachable.
2. **A Cloudflare account** with the zone added, and the ability to create a
   Tunnel (dashboard → Zero Trust → Networks → Tunnels).
3. **A GitHub credential** for `Riloox/fleetdeck-open`: prefer a GitHub App
   (Issues read/write + Metadata read-only, installed on that repo only);
   fine-grained PAT acceptable for v1 with the same scopes. See
   `rotate-github-credential.md`.
4. **Pi hardware and OS**: Raspberry Pi 4/5, 64-bit Raspberry Pi OS Lite
   (Bookworm or newer), with a static DHCP reservation (or fixed IP) on the
   home LAN. Node 22 LTS (arm64) will be installed on it.
5. **Private admin path**: either the Pi is on the same LAN you administer
   from, or it is joined to Tailscale (or Raspberry Pi Connect). Decide which;
   SSH policy below assumes LAN/Tailscale-only SSH.
6. **Who may submit reports**: v1 is anonymous-but-rate-limited. If you want
   per-instance relay keys, that is a v2 feature (plan open question 4).

## 1. Base OS hardening (do this first, on the Pi)

```bash
# Create your admin user (NOT root), give it sudo, then log in as it.
sudo useradd -m -s /bin/bash adminuser
sudo usermod -aG sudo adminuser

# SSH: key-only, no root, LAN/Tailscale only.
sudo mkdir -p /etc/ssh/sshd_config.d
cat <<'EOF' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
AllowUsers adminuser
EOF
sudo systemctl restart ssh

# UFW: default deny incoming, allow SSH from LAN/Tailscale only, allow outbound.
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
# Example: 192.168.1.0/24 = your LAN; tailscale0 = your Tailscale interface.
sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp
sudo ufw allow in on tailscale0 to any port 22 proto tcp
sudo ufw enable
sudo ufw status verbose

# Automatic security updates.
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes

# Fail2ban — only needed if SSH is reachable beyond the LAN/Tailscale.
# If SSH is LAN-only, skip it (fewer moving parts).
# sudo apt-get install -y fail2ban

# Verify: no relay port is reachable from the LAN yet.
sudo ss -tlnp
```

> No inbound port forwarding, no UPnP/NAT-PMP exposure, ever. The tunnel is
> the only public path and it is outbound.

## 2. Install Node.js 22 LTS (arm64)

Use the NodeSource package (kept up to date by `unattended-upgrades`):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v22.x — matches the repo engines requirement (>=22)
```

## 3. Create the relay user and directories

```bash
# Dedicated user: system account, no login shell, no home directory.
sudo useradd --system --no-create-home --shell /usr/sbin/nologin fleetdeck-relay

# Data directory (SQLite queue) — tmpfiles does this at boot too.
sudo install -d -o fleetdeck-relay -g fleetdeck-relay -m 0700 /var/lib/fleetdeck-relay

# Secrets directory: root-only.
sudo install -d -o root -g root -m 0700 /etc/fleetdeck-relay
```

Install the tmpfiles snippet so the data dir survives reboots with the right
owner:

```bash
sudo install -o root -g root -m 0644 deploy/pi/fleetdeck-relay-tmpfiles.conf /etc/tmpfiles.d/fleetdeck-relay.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/fleetdeck-relay.conf
```

## 4. Install the relay code

```bash
# From the repo root on the Pi (or scp the relay/ directory):
sudo mkdir -p /opt/fleetdeck-relay
sudo cp -r relay/. /opt/fleetdeck-relay/
cd /opt/fleetdeck-relay
sudo npm install --omit=dev --ignore-scripts=false
# Code tree is root-owned and read-only to the service user:
sudo chown -R root:root /opt/fleetdeck-relay
sudo chmod -R a+rX /opt/fleetdeck-relay
```

The relay stays a **separate process and directory from the Fleetdeck panel**
(plan Task 6, step 9). If the panel runs on the same Pi, it gets its own user
and its own systemd unit — do not merge them.

## 5. Secrets: `/etc/fleetdeck-relay/relay.env`

```bash
sudo install -o root -g root -m 0600 deploy/pi/fleetdeck-relay.env.example /etc/fleetdeck-relay/relay.env
sudo nano /etc/fleetdeck-relay/relay.env   # fill in RELAY_GITHUB_TOKEN (and nothing else that is secret)
sudo chown root:root /etc/fleetdeck-relay/relay.env
sudo chmod 0600 /etc/fleetdeck-relay/relay.env
```

- The file is parsed by systemd (root) and is **unwritable by the
  `fleetdeck-relay` user**.
- The relay **fails closed**: if `RELAY_GITHUB_TOKEN` is missing/empty, it
  refuses to serve `/v1/reports`. A missing credential is an outage, not a
  security hole.
- Never commit this file. `.gitignore` already ignores `.env*`-style secrets;
  the tracked `.env.example` is the only copy in Git.

## 6. Run the relay under systemd

```bash
sudo install -o root -g root -m 0644 deploy/pi/fleetdeck-relay.service /etc/systemd/system/fleetdeck-relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now fleetdeck-relay

sudo systemctl is-active fleetdeck-relay
curl -fsS http://127.0.0.1:8787/healthz
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/readyz
sudo journalctl -u fleetdeck-relay --since "10 minutes ago" --no-pager
sudo ss -tlnp | grep 8787    # must show 127.0.0.1:8787, never 0.0.0.0
```

Hardening in the unit: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`,
`ProtectHome=yes`, `ReadWritePaths=/var/lib/fleetdeck-relay`, restricted
address families (AF_UNIX/AF_INET/AF_INET6 only), empty capability bounding
set, private devices/namespaces, and `EnvironmentFile` for the root-owned
secrets. Optional `MemoryDenyWriteExecute` is documented but left off by
default because it can crash Node's JIT on some arm64 builds — enable it only
after confirming `/healthz` still responds.

## 7. Publish only the relay via Cloudflare Tunnel

```bash
# 1. Install the arm64 package (official build).
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-archive-keyring.gpg] https://pkg.cloudflare.com/cloudflared bookworm main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# 2. Authenticate the tunnel (opens a browser to authorize; keep the cert in /etc/cloudflared).
sudo cloudflared tunnel login

# 3. Create the named tunnel.
sudo cloudflared tunnel create fleetdeck-relay   # prints a TUNNEL_ID

# 4. Install the ingress config (one hostname + catch-all 404).
sudo install -o root -g root -m 0600 deploy/pi/cloudflared-config.yml.example /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml            # set TUNNEL_ID + bugs.<domain>
sudo chmod 0600 /etc/cloudflared/<TUNNEL_ID>.json

# 5. Route the DNS hostname through the tunnel.
sudo cloudflared tunnel route dns fleetdeck-relay bugs.<your-domain>

# 6. Run it under systemd (hardened unit above).
sudo install -o root -g root -m 0644 deploy/pi/cloudflared.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
```

Tunnel rules to respect:

- The ingress table has **exactly one** hostname rule plus the catch-all
  `http_status:404`. No SSH, no panel, no `/readyz`, no metrics, no SQLite.
- Tunnel credentials (`/etc/cloudflared/*.json`) are root-only.
- In the Cloudflare dashboard, add WAF managed rules and rate limiting for
  `bugs.<domain>` (the relay already rate-limits per-IP and has a daily
  budget; Cloudflare is defense in depth).

## 8. Verify — local first, then from an external network

Local (on the Pi):

```bash
sudo systemctl is-active fleetdeck-relay
sudo systemctl is-active cloudflared
curl -fsS http://127.0.0.1:8787/healthz
sudo ss -tlnp
sudo ufw status verbose
```

External (from a phone on cellular data, NOT the home LAN — plan Task 9):

1. `https://bugs.<your-domain>/healthz` returns ok.
2. Unknown paths and unknown hostnames through the tunnel return 404
   (`/readyz`, `/admin`, arbitrary host headers).
3. Submit one harmless test report; confirm **exactly one** GitHub issue
   appears in `Riloox/fleetdeck-open` with the `in-app-report` label.
4. Kill/restart the relay during a submission; confirm the queue drains
   without duplicates (idempotency).
5. Search logs and the repo for token-shaped strings **without printing the
   values**:
   ```bash
   sudo journalctl -u fleetdeck-relay --no-pager | grep -Ei 'gh[pous]_|github_pat|token' || echo clean
   ```
6. Confirm a browser network trace of the Fleetdeck UI never contains a
   GitHub token or a direct `api.github.com` request — the browser only talks
   to the Fleetdeck server, which forwards to the relay.

## 9. Backups (exclude secrets)

```bash
# Backup ONLY the queue; never /etc/fleetdeck-relay/relay.env.
sudo -u fleetdeck-relay sqlite3 /var/lib/fleetdeck-relay/relay.db ".backup '/var/lib/fleetdeck-relay/backups/relay-$(date +%F).db'"
# Or rsync /var/lib/fleetdeck-relay/ to a trusted host, excluding nothing else —
# the whole directory is report data, not secrets.
```

Restore: stop the relay, replace `relay.db`, start the relay; the worker
resumes from the queue and idempotency keys prevent duplicate issues.

## 10. Operations

- **Logs:** `sudo journalctl -u fleetdeck-relay -f`. Structured, redacted.
- **Credential rotation:** every ≤90 days or immediately on suspicion —
  `rotate-github-credential.md`.
- **Updates:** `unattended-upgrades` covers OS + NodeSource packages.
  `cloudflared` upgrades are delivered by the same apt source; pin and test
  before mass rollout if uptime matters.
- **Monitoring:** `systemctl is-active fleetdeck-relay` + `/healthz` from a
  cron or external uptime check; watch the daily budget in logs.
- **Incident response:** revoke credential → pause tunnel hostname → triage
  issues → rotate → restore with a low daily budget (see rotate doc).

## 11. Alternatives (from the plan, Task 7)

If the home IP, ISP terms, uptime, or the Cloudflare dependency are
undesirable, run this exact stack on a low-cost VPS instead — operationally
safer than exposing a home device, even through a tunnel. The artifacts in
this directory are distro-agnostic (systemd + UFW) and work on a Debian/Ubuntu
VPS with only the SSH policy (LAN/Tailscale) adapted.

## Open questions (see plan)

1. Domain + Cloudflare management for `bugs.<domain>`?
2. Public builds → upstream repo, self-hosters keep own-repo mode?
3. Pi reachable via Tailscale / Raspberry Pi Connect for private admin?
4. Anonymous public submissions vs. per-instance relay keys?
5. Home Pi vs. VPS for the public relay?
