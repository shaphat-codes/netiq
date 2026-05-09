import logging
from flask import Blueprint, jsonify, request

from database.db import list_analyze_events

events_bp = Blueprint("events_api", __name__, url_prefix="/api")
logger = logging.getLogger(__name__)


@events_bp.get("/events")
def list_events():
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except ValueError:
        limit = 50
    before_id = request.args.get("before_id")
    bid = int(before_id) if before_id and before_id.isdigit() else None
    rows = list_analyze_events(limit=limit, before_id=bid)
    return jsonify({"events": rows})
