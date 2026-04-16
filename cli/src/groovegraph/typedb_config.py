from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse


class TypeDbConfigError(ValueError):
    pass


@dataclass(frozen=True)
class TypeDbConnectionParams:
    """Parameters for `typedb.driver.TypeDB.driver`."""

    address: str
    username: str
    password: str
    database: str


def _split_typedb_connection_string(connection_string: str) -> tuple[str, str, str, str | None]:
    """
    Parse `typedb://USER:PASS@https://HOST:PORT/?name=DATABASE` per docs/USER_AND_AGENT_GUIDE.md §7.
    Returns (address, username, password, database_or_none).
    """
    if not connection_string.startswith("typedb://"):
        raise TypeDbConfigError("TYPEDB_CONNECTION_STRING must start with typedb://")

    rest = connection_string[len("typedb://") :]
    split_at: int | None = None
    for i, ch in enumerate(rest):
        if ch == "@" and rest[i + 1 :].startswith("http://"):
            split_at = i
            break
        if ch == "@" and rest[i + 1 :].startswith("https://"):
            split_at = i
            break
    if split_at is None:
        raise TypeDbConfigError("TYPEDB_CONNECTION_STRING must contain userinfo@http(s)://…")

    userinfo = rest[:split_at]
    address_and_query = rest[split_at + 1 :]

    if ":" not in userinfo:
        raise TypeDbConfigError("TYPEDB_CONNECTION_STRING userinfo must be username:password")
    username, password = userinfo.split(":", 1)

    parsed = urlparse(address_and_query)
    address = f"{parsed.scheme}://{parsed.netloc}"
    if not parsed.scheme or not parsed.netloc:
        raise TypeDbConfigError("TYPEDB_CONNECTION_STRING must include a full https://host:port origin")

    db: str | None = None
    if parsed.query:
        qs = parse_qs(parsed.query)
        if "name" in qs and qs["name"]:
            db = qs["name"][0]
    return address, username, password, db


def read_typedb_connection_params() -> TypeDbConnectionParams:
    """
    Resolve TypeDB Cloud / server connection parameters from process env.

    Precedence matches docs/USER_AND_AGENT_GUIDE.md §7 (connection string, overrides, explicit vars).
    """
    conn = os.environ.get("TYPEDB_CONNECTION_STRING", "").strip()
    addresses = os.environ.get("TYPEDB_ADDRESSES", "").strip()
    username = os.environ.get("TYPEDB_USERNAME", "").strip()
    password = os.environ.get("TYPEDB_PASSWORD", "").strip()
    database = os.environ.get("TYPEDB_DATABASE", "").strip()

    address: str | None = None
    if addresses:
        first = addresses.split(",")[0].strip()
        if first:
            address = first

    if conn:
        c_addr, c_user, c_pass, c_db = _split_typedb_connection_string(conn)
        address = address or c_addr
        username = username or c_user
        password = password or c_pass
        database = database or (c_db or "")

    if not address:
        raise TypeDbConfigError("Missing TypeDB address (set TYPEDB_CONNECTION_STRING or TYPEDB_ADDRESSES).")
    if not username or not password:
        raise TypeDbConfigError("Missing TYPEDB_USERNAME / TYPEDB_PASSWORD (or embed them in TYPEDB_CONNECTION_STRING).")
    if not database:
        raise TypeDbConfigError("Missing TYPEDB_DATABASE (or name=… in TYPEDB_CONNECTION_STRING).")

    return TypeDbConnectionParams(address=address, username=username, password=password, database=database)
