#!/usr/bin/env python3
"""Same-origin SABRO Identity to Twenty session bridge."""

from __future__ import annotations

import json
import os
import re
import secrets
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]
TWENTY_GRAPHQL_URL = os.environ.get(
    "TWENTY_GRAPHQL_URL", "http://127.0.0.1:3000/metadata"
)
TWENTY_ORIGIN = os.environ["TWENTY_ORIGIN"]
TWENTY_WORKSPACE_INVITE_HASH = os.environ["TWENTY_WORKSPACE_INVITE_HASH"]
LINK_STORE = Path(
    os.environ.get(
        "SABRO_IDENTITY_LINK_STORE",
        "/var/lib/sabro-identity-bridge/links.json",
    )
)
PRINCIPAL_ID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
STORE_LOCK = threading.Lock()


class BridgeError(Exception):
    pass


def request_json(
    request: urllib.request.Request,
) -> tuple[dict[str, object], list[str]]:
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = json.load(response)
            return body, response.headers.get_all("Set-Cookie") or []
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise BridgeError("Upstream identity request failed") from error


def verify_identity(access_token: str) -> tuple[str, str]:
    request = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": f"Bearer {access_token}",
        },
    )
    user, _ = request_json(request)
    email = str(user.get("email") or "").strip().lower()
    metadata = user.get("app_metadata")
    principal = (
        str(metadata.get("principal_id") or "").strip()
        if isinstance(metadata, dict)
        else ""
    )
    if not email or not PRINCIPAL_ID.fullmatch(principal):
        raise BridgeError("Identity is not enabled for this workspace")
    return principal, email


def graphql(
    query: str, variables: dict[str, object]
) -> tuple[dict[str, object], list[str]]:
    request = urllib.request.Request(
        TWENTY_GRAPHQL_URL,
        method="POST",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={
            "Content-Type": "application/json",
            "Origin": TWENTY_ORIGIN,
        },
    )
    body, cookies = request_json(request)
    if body.get("errors"):
        raise BridgeError("CRM session exchange failed")
    return body, cookies


def load_links() -> dict[str, dict[str, str]]:
    if not LINK_STORE.exists():
        return {}
    value = json.loads(LINK_STORE.read_text())
    if not isinstance(value, dict):
        raise BridgeError("Identity link store is invalid")
    return value


def save_links(links: dict[str, dict[str, str]]) -> None:
    LINK_STORE.parent.mkdir(parents=True, exist_ok=True)
    temporary = LINK_STORE.with_suffix(".tmp")
    temporary.write_text(json.dumps(links, separators=(",", ":")))
    temporary.chmod(0o600)
    temporary.replace(LINK_STORE)


SIGN_UP = """
mutation SabroIdentitySignUp(
  $email: String!
  $password: String!
  $workspaceInviteHash: String
) {
  signUpInWorkspace(
    email: $email
    password: $password
    workspaceInviteHash: $workspaceInviteHash
  ) {
    loginToken { token }
  }
}
"""

LOGIN = """
mutation SabroIdentityLogin(
  $email: String!
  $password: String!
  $origin: String!
) {
  getLoginTokenFromCredentials(
    email: $email
    password: $password
    origin: $origin
  ) {
    loginToken { token }
  }
}
"""

EXCHANGE = """
mutation SabroIdentitySession($loginToken: String!, $origin: String!) {
  getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
    tokens { accessOrWorkspaceAgnosticToken { expiresAt } }
  }
}
"""


def login_token_for(principal: str, email: str) -> str:
    with STORE_LOCK:
        links = load_links()
        link = links.get(principal)
        if link:
            if link.get("email") != email:
                raise BridgeError("Identity link does not match")
            body, _ = graphql(
                LOGIN,
                {
                    "email": email,
                    "password": link["password"],
                    "origin": TWENTY_ORIGIN,
                },
            )
            return str(
                body["data"]["getLoginTokenFromCredentials"]["loginToken"]["token"]
            )

        password = secrets.token_urlsafe(32)
        body, _ = graphql(
            SIGN_UP,
            {
                "email": email,
                "password": password,
                "workspaceInviteHash": TWENTY_WORKSPACE_INVITE_HASH,
            },
        )
        token = str(body["data"]["signUpInWorkspace"]["loginToken"]["token"])
        links[principal] = {"email": email, "password": password}
        save_links(links)
        return token


class Handler(BaseHTTPRequestHandler):
    server_version = "SABROIdentityBridge"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ok"}')

    def do_POST(self) -> None:
        if self.path != "/session":
            self.send_error(404)
            return
        if self.headers.get("Origin") != TWENTY_ORIGIN:
            self.send_error(403)
            return
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            self.send_error(401)
            return
        try:
            principal, email = verify_identity(authorization[7:])
            login_token = login_token_for(principal, email)
            _, cookies = graphql(
                EXCHANGE,
                {"loginToken": login_token, "origin": TWENTY_ORIGIN},
            )
            if not cookies:
                raise BridgeError("CRM did not issue a session cookie")
            self.send_response(200)
            for cookie in cookies:
                self.send_header("Set-Cookie", cookie)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"redirect":"/"}')
        except BridgeError:
            self.send_response(403)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Your workspace could not be opened."}')

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} {format % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8787), Handler).serve_forever()
