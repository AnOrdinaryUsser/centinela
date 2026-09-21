"""Shared PostGIS connection helper for the ETL scripts."""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()


def get_engine():
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "centinela_cyl")
    user = os.getenv("POSTGRES_USER", "centinela")
    password = os.getenv("POSTGRES_PASSWORD", "change_me")

    connection_string = f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db}"
    return create_engine(connection_string)
