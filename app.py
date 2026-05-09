import logging

from flask import Flask, request

from config import AppConfig, configure_logging
from database.db import init_db
from routes.a2a import a2a_bp
from routes.api_v1 import api_v1_bp
from routes.consumer import consumer_bp
from routes.decision import agent_bp, decision_bp
from routes.events import events_bp
from routes.mcp_http import mcp_bp
from routes.openapi_spec import VALID_INTENTS as SUPPORTED_INTENTS
from routes.ui import ui_bp

PLATFORM_NAME = "NetIQ"
PLATFORM_VERSION = "2.0.0"
PLATFORM_TAGLINE = (
    "Horizontal trust-and-decision orchestration over Nokia Network as Code / "
    "GSMA CAMARA. One API turns a phone number into a structured decision for "
    "any vertical — fintech, delivery, health, e-commerce, mobility, and more."
)


def create_app() -> Flask:
    configure_logging()
    logger = logging.getLogger(__name__)
    logger.debug("Initializing Flask app")

    cfg = AppConfig()
    app = Flask(__name__)
    app.config.from_object(cfg)
    app.secret_key = cfg.SECRET_KEY
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    if cfg.SESSION_CROSS_SITE:
        app.config["SESSION_COOKIE_SAMESITE"] = "None"
        app.config["SESSION_COOKIE_SECURE"] = True
    else:
        app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
        app.config["SESSION_COOKIE_SECURE"] = False
    app.config["PERMANENT_SESSION_LIFETIME"] = 86400 * 7

    if not cfg.RAPIDAPI_KEY:
        logger.warning("RAPIDAPI_KEY is empty — NaC calls will fail until it is set in the environment")

    init_db()

    @app.before_request
    def cors_preflight():
        if request.method == "OPTIONS":
            return "", 204

    @app.after_request
    def cors_headers(response):
        if not cfg.CORS_ORIGINS:
            return response
        o = request.headers.get("Origin")
        allowed = False
        if cfg.CORS_ORIGINS == "*" and o:
            allowed = True
        elif o and o in [x.strip() for x in cfg.CORS_ORIGINS.split(",") if x.strip()]:
            allowed = True
        if not allowed:
            return response
        response.headers["Access-Control-Allow-Origin"] = o
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
        req_headers = request.headers.get("Access-Control-Request-Headers")
        response.headers["Access-Control-Allow-Headers"] = (
            req_headers or "Content-Type, Authorization"
        )
        return response

    app.register_blueprint(api_v1_bp)
    app.register_blueprint(decision_bp, url_prefix="/")
    app.register_blueprint(agent_bp, url_prefix="/")
    app.register_blueprint(events_bp)
    app.register_blueprint(mcp_bp, url_prefix="/")
    app.register_blueprint(a2a_bp, url_prefix="/")
    app.register_blueprint(consumer_bp, url_prefix="/")
    app.register_blueprint(ui_bp, url_prefix="/")

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "name": PLATFORM_NAME,
            "version": PLATFORM_VERSION,
            "tagline": PLATFORM_TAGLINE,
            "policy_version": cfg.POLICY_VERSION,
            "protocols": ["rest", "mcp", "a2a", "consumer_chat"],
            "intents": SUPPORTED_INTENTS,
        }, 200

    logger.info("Flask app initialized")
    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=AppConfig().PORT, debug=AppConfig().DEBUG)
