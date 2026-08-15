# Rotating the GitHub credential used by the bug-report relay

The relay holds a server-side GitHub credential scoped to
`Riloox/fleetdeck-open` with **Issues: read/write** and **Metadata:
read-only** — nothing else. Because it can create public issues, it is the
highest-value secret on the Pi. This document is the rotation and incident
procedure. See `relay/THREAT-MODEL.md` (T5–T9, T13) for why this matters.

## When to rotate

Rotate **immediately** if any of these happens:

1. The token appears in a chat, transcript, log, screenshot, commit, backup,
   issue body, or anywhere outside `/etc/fleetdeck-relay/relay.env`.
2. Unexplained issue creation volume or content you did not authorize.
3. The credential's expiry is near (fine-grained PATs have a max lifetime;
   set a calendar reminder at creation).
4. The relay host, user, or SSH key may have been compromised.
5. Routine hygiene: at least every 90 days.

## Before you rotate

- Confirm the relay currently **fails closed** (no token = no submissions):
  `sudo systemctl status fleetdeck-relay`.
- Have SSH access via the LAN/Tailscale admin path. Do **not** rotate over the
  public tunnel path.

## Procedure (fine-grained PAT)

1. **Revoke the old token first.** GitHub → Settings → Developer settings →
   Fine-grained tokens → find the token (name it `fleetdeck-relay-<date>`) →
   Revoke. The relay immediately starts failing closed on `/v1/reports`
   (queue keeps accepting? — no: fail closed means it refuses; queued reports
   already persisted are safe and will drain once the new token is live).
2. **Create the new token.**
   - Owner: `Riloox`; repository access: **Only select repositories** →
     `fleetdeck-open`.
   - Permissions: Issues **Read and write**; Metadata **Read-only** (granted
     automatically). No Contents, Actions, Administration, Secrets, or
     Workflows.
   - Expiration: as short as practical (≤ 90 days). Copy it once.
3. **Install it on the Pi** (token never touches the repo, chat, or logs):
   ```bash
   sudo nano /etc/fleetdeck-relay/relay.env   # replace RELAY_GITHUB_TOKEN value
   sudo chown root:root /etc/fleetdeck-relay/relay.env
   sudo chmod 0600 /etc/fleetdeck-relay/relay.env
   sudo systemctl restart fleetdeck-relay
   ```
4. **Verify without printing the secret:**
   ```bash
   sudo systemctl is-active fleetdeck-relay
   curl -fsS http://127.0.0.1:8787/healthz
   # submit one harmless test report and confirm exactly one issue appears
   # in Riloox/fleetdeck-open with the in-app-report label
   sudo journalctl -u fleetdeck-relay --since "5 minutes ago" --no-pager
   ```
   If the relay logs a 401/403, the token scope is wrong — fix the scope, do
   not widen it beyond Issues read/write + Metadata read-only.

## Procedure (GitHub App, preferred for v2)

1. In the GitHub App settings: **Regenerate private key** (keep the old key
   until the new one is verified — GitHub allows a short overlap window).
2. Install the new private key in `/etc/fleetdeck-relay/relay.env`
   (or `/etc/fleetdeck-relay/github-app.pem`, root 0600) and point the relay
   env at it.
3. Restart and verify as above. Installation tokens issued from the new key
   are short-lived (~1h), which is a defense-in-depth win over a long-lived
   PAT.

## Incident: abuse detected

1. **Revoke the credential now** (GitHub → token settings → Revoke).
2. **Pause the tunnel hostname** in the Cloudflare dashboard (or
   `cloudflared tunnel route dns` removal) to stop inbound submissions.
3. Note the queue contents on the Pi for evidence; do not delete it yet.
4. Triage the created issues; close/spam-label them; consider requiring
   maintainer review for relay-created issues going forward.
5. Investigate: were there valid-looking submissions, or pure spam? Was the
   token used from an unexpected IP (GitHub's audit log shows API usage)?
6. Rotate per the procedure above, re-enable the tunnel, and restore the daily
   budget to a low value until volume looks normal again.

## Hygiene reminders

- The token value lives in exactly one place: `/etc/fleetdeck-relay/relay.env`.
  Backups of the Pi must **exclude** `/etc/fleetdeck-relay/`.
- Never put the value in shell history: use `sudo nano` or a root-only file,
  not `echo TOKEN | sudo tee ...` in a command you paste.
- Name tokens by purpose+date so the GitHub UI makes rotation obvious.
- The relay **fails closed** when the variable is missing or empty — a missing
  credential is a service outage, not a security hole.
