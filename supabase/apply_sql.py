#!/usr/bin/env python3
"""Apply a SQL file to the cloud DB in one transaction.

Usage: agent/.venv/bin/python supabase/apply_sql.py migrations/0004_tool_events.sql
Reads SUPABASE_DB_URL from the repo-root .env (never printed).
"""
import os
import pathlib
import sys

from dotenv import load_dotenv
import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

url = os.environ.get("SUPABASE_DB_URL")
if not url:
    raise SystemExit("SUPABASE_DB_URL missing from .env")

sql_path = pathlib.Path(__file__).parent / sys.argv[1]
sql = sql_path.read_text()

with psycopg.connect(url) as conn:
    conn.execute(sql)
    conn.commit()

print(f"applied {sys.argv[1]} OK")
