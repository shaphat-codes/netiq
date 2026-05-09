import json
import os

from flask import Blueprint, jsonify, render_template

ui_bp = Blueprint("ui", __name__)

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@ui_bp.get("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@ui_bp.get("/simulator")
def simulator():
    return render_template("simulator.html")


@ui_bp.get("/scenarios.json")
def scenarios_json():
    path = os.path.join(_ROOT, "scenarios", "demo_scenarios.json")
    with open(path, encoding="utf-8") as f:
        return jsonify(json.load(f))
