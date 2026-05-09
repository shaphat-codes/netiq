import os

import pytest


@pytest.fixture
def app(tmp_path):
    path = str(tmp_path / "netiq_test.db")
    os.environ["NETIQ_DB_PATH"] = path
    os.environ["SECRET_KEY"] = "test-secret-key"
    os.environ["REQUIRE_API_KEY"] = "false"

    import database.db as db

    db.DB_PATH = path
    db.init_db()

    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture
def client(app):
    return app.test_client()
