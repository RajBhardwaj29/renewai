"""Operator-only Gmail authorization. Never imports the application or sends email.

Use a Google OAuth Desktop client JSON and an output path OUTSIDE this repository.
The browser account owner completes Google's consent. Tokens stay in a mode-0600
local file for direct entry into the backend host's secret settings.
"""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
import time
from urllib.parse import parse_qs, urlencode, urlparse

import requests

SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
SCOPES = f"openid email {SEND_SCOPE}"


def authorization_url(client_id, redirect_uri, state, verifier):
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "prompt": "consent select_account",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })


def callback_code(path, state):
    parsed = urlparse(path)
    values = parse_qs(parsed.query)
    if parsed.path != "/" or values.get("state") != [state] or "error" in values:
        raise ValueError("Authorization was declined or its state did not match.")
    code = values.get("code", [])
    if len(code) != 1 or not code[0]:
        raise ValueError("Authorization code was not returned.")
    return code[0]


def connect(client_path, email, output):
    output = output.resolve()
    repository = Path(__file__).resolve().parents[2]
    if output.is_relative_to(repository) or output.exists() or not output.parent.is_dir():
        raise ValueError("Choose a new file in an existing private directory outside this repository.")
    if not email or "@" not in email or any(c.isspace() for c in email):
        raise ValueError("Provide the dedicated Gmail address.")
    client = json.loads(client_path.read_text()).get("installed", {})
    client_id, client_secret = client.get("client_id", ""), client.get("client_secret", "")
    if not client_id.endswith(".apps.googleusercontent.com") or not client_secret:
        raise ValueError("A Google OAuth Desktop client JSON is required.")
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log the callback URL, authorization code or credentials.

        def do_GET(self):
            try:
                result["code"] = callback_code(self.path, state)
                body = b"Google authorization received. You may close this tab. Check the local setup result."
                status = 200
            except ValueError:
                body, status = b"Authorization could not be verified. Return to the local setup tool.", 400
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

    with HTTPServer(("127.0.0.1", 0), Callback) as server:
        server.timeout = 1
        redirect_uri = f"http://127.0.0.1:{server.server_port}/"
        print("Open this Google URL and authorize only the dedicated sender account:", flush=True)
        print(authorization_url(client_id, redirect_uri, state, verifier), flush=True)
        deadline = time.monotonic() + 300
        while "code" not in result and time.monotonic() < deadline:
            server.handle_request()
        if "code" not in result:
            raise ValueError("Authorization timed out; run setup again.")
    token_response = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id, "client_secret": client_secret,
        "code": result["code"], "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": redirect_uri,
    }, timeout=(5, 30), allow_redirects=False)
    if token_response.status_code != 200:
        raise ValueError("Google authorization exchange failed; check the client setup and try again.")
    tokens = token_response.json()
    scopes = set(tokens.get("scope", "").split())
    allowed_scopes = {SEND_SCOPE, "openid", "email", "https://www.googleapis.com/auth/userinfo.email"}
    if not tokens.get("refresh_token") or SEND_SCOPE not in scopes or not scopes.issubset(allowed_scopes):
        raise ValueError("Offline sending permission was not granted; authorize again.")
    identity = requests.get("https://openidconnect.googleapis.com/v1/userinfo",
                            headers={"Authorization": f"Bearer {tokens['access_token']}"},
                            timeout=(5, 20), allow_redirects=False)
    if identity.status_code != 200:
        raise ValueError("The connected sender identity could not be verified.")
    account = identity.json()
    if account.get("email_verified") is not True or account.get("email", "").lower() != email.lower():
        raise ValueError("The authorized Google account does not match the requested sender.")
    values = {"EMAIL_PROVIDER": "gmail", "GMAIL_SENDER_ADDRESS": email,
              "GMAIL_CLIENT_ID": client_id, "GMAIL_CLIENT_SECRET": client_secret,
              "GMAIL_REFRESH_TOKEN": tokens["refresh_token"]}
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write("".join(f"{key}={json.dumps(value)}\n" for key, value in values.items()))
    print(f"Sender verified. Private backend settings saved to {output}. No email was sent.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-json", type=Path, required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        connect(args.client_json, args.email, args.output)
    except Exception:
        # Even HTTP/JSON/OS errors must not print credentials or response bodies.
        print("Gmail setup did not complete. Check the desktop client, account, permissions and private output path; then retry.", file=sys.stderr)
        sys.exit(1)
