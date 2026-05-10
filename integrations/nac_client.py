import logging
import time
import uuid
from datetime import date
from typing import Any, Dict, Optional, Set, Tuple

import requests

from config import AppConfig
from integrations.nac_endpoints import OPERATIONS, OPERATION_PATH_ALIASES

logger = logging.getLogger(__name__)
CONFIG = AppConfig()
UNAVAILABLE_OPERATIONS: Set[str] = set()

# Not merged into generic device-style POST bodies; used only for path / dedicated builders
INTERNAL_EXTRA_KEYS: Set[str] = {
    "center_lat",
    "center_lng",
    "verification_radius_m",
    "consent_reference",
    "subscription_id",
    "max_age_hours",
    "max_age_seconds",
}


def _headers_json() -> Dict[str, str]:
    h = _headers()
    h["Content-Type"] = "application/json"
    return h


def _headers() -> Dict[str, str]:
    return {
        "X-RapidAPI-Key": CONFIG.RAPIDAPI_KEY,
        "X-RapidAPI-Host": CONFIG.RAPIDAPI_HOST,
        "Accept": "application/json",
    }


def _resolve_path(path: str, extra: Optional[Dict[str, Any]]) -> str:
    if not extra:
        return path
    out = path
    for k, v in extra.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def _normalize_sim_swap(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"sim_swap_recent": False, "_raw": body}
    swapped = body.get("swapped")
    if swapped is None:
        swapped = body.get("simSwapRecent") or body.get("sim_swap_recent")
    if swapped is None and isinstance(body.get("checkSimSwap"), dict):
        swapped = body["checkSimSwap"].get("swapped")
    recent = bool(swapped) if swapped is not None else False
    return {"sim_swap_recent": recent, "_raw": body}


def _normalize_device_swap(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"device_swap_recent": False, "_raw": body}
    v = body.get("swapped") or body.get("deviceSwapped") or body.get("device_swap_recent")
    return {"device_swap_recent": bool(v), "_raw": body}


def _normalize_device_status(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"status": "unknown", "new_device": False, "_raw": body}
    dev = body.get("device") if isinstance(body.get("device"), dict) else {}
    new_device = bool(
        body.get("newDevice")
        or body.get("new_device")
        or dev.get("newDevice")
        or dev.get("new_device")
    )
    status = body.get("status") or body.get("connectivityStatus") or "unknown"
    if isinstance(status, dict):
        status = status.get("value", "unknown")
    return {"status": str(status).lower(), "new_device": new_device, "_raw": body}


def _normalize_location(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"lat": None, "lng": None, "_raw": body}
    loc = body.get("location") or body.get("area") or body
    if not isinstance(loc, dict):
        return {"lat": None, "lng": None, "_raw": body}
    lat = loc.get("latitude") or loc.get("lat")
    lng = loc.get("longitude") or loc.get("lng")
    try:
        return {
            "lat": float(lat) if lat is not None else None,
            "lng": float(lng) if lng is not None else None,
            "_raw": body,
        }
    except (TypeError, ValueError):
        return {"lat": None, "lng": None, "_raw": body}


def _normalize_location_verification(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"location_matches": True, "_raw": body}
    ver = body.get("verificationResult") or body.get("result")
    if isinstance(ver, dict):
        m = ver.get("match") or ver.get("verified")
    else:
        m = body.get("match") or body.get("verified") or body.get("locationMatches")
    if m is None:
        return {"location_matches": True, "_raw": body}
    return {"location_matches": bool(m), "_raw": body}


def _normalize_qos(body: Any) -> Dict[str, Any]:
    if isinstance(body, list) and body:
        body = body[0]
    if not isinstance(body, dict):
        return {"quality": "medium", "_raw": body}
    q = body.get("qosStatus") or body.get("status") or body.get("quality")
    if isinstance(q, dict):
        q = q.get("value") or q.get("name")
    s = str(q or "medium").lower()
    if s in ("excellent", "high", "good"):
        quality = "high"
    elif s in ("poor", "low", "bad"):
        quality = "low"
    else:
        quality = "medium"
    return {"quality": quality, "_raw": body}


def _normalize_number_recycling(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"recycled_risk": False, "_raw": body}
    risk = body.get("recycled") or body.get("recycledRecently") or body.get("highRisk")
    return {"recycled_risk": bool(risk), "_raw": body}


def _normalize_reachability(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"reachable": True, "_raw": body}
    r = body.get("reachable") if "reachable" in body else body.get("isReachable")
    if r is None:
        r = True
    return {"reachable": bool(r), "_raw": body}


def _normalize_number_verification(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"verified": False, "_raw": body}
    v = body.get("verified") or body.get("devicePhoneNumberVerified")
    return {"verified": bool(v), "_raw": body}


def _normalize_congestion(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"congestion": "medium", "_raw": body}
    lvl = body.get("congestionLevel") or body.get("level") or body.get("congestion")
    if isinstance(lvl, dict):
        lvl = lvl.get("value") or lvl.get("name")
    s = str(lvl or "medium").lower()
    if s in ("none", "low", "light"):
        c = "low"
    elif s in ("high", "severe", "heavy", "extreme"):
        c = "high"
    else:
        c = "medium"
    return {"congestion": c, "_raw": body}


def _normalize_geofencing(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"inside_geofence": True, "_raw": body}
    inside = body.get("inside") if "inside" in body else body.get("deviceInside")
    if inside is None:
        inside = body.get("status") in ("INSIDE", "inside", "active")
    return {"inside_geofence": bool(inside) if inside is not None else True, "_raw": body}


def _normalize_consent(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"consent_granted": True, "_raw": body}
    g = body.get("granted") or body.get("consentGranted") or body.get("active")
    if g is None:
        g = body.get("status") in ("GRANTED", "ACTIVE", "granted")
    if g is None:
        g = True
    return {"consent_granted": bool(g), "_raw": body}


def _normalize_age_verification(body: Dict[str, Any]) -> Dict[str, Any]:
    if not body or not isinstance(body, dict):
        return {"age_verified": True, "_raw": body}
    verified = body.get("verifiedStatus")
    if verified is None:
        age_check = str(body.get("ageCheck") or "").lower()
        if age_check in {"true", "false"}:
            verified = age_check == "true"
    if verified is None:
        verified = True
    return {"age_verified": bool(verified), "_raw": body}


NORMALIZERS = {
    "check_sim_swap": _normalize_sim_swap,
    "device_swap_check": _normalize_device_swap,
    "device_status_retrieve": _normalize_device_status,
    "location_retrieve": _normalize_location,
    "location_verification_verify": _normalize_location_verification,
    "qos_sessions": _normalize_qos,
    "number_recycling": _normalize_number_recycling,
    "reachability": _normalize_reachability,
    "number_verification": _normalize_number_verification,
    "congestion_insights": _normalize_congestion,
    "geofencing_subscription_get": _normalize_geofencing,
    "consent_info": _normalize_consent,
    "kyc_age_verify": _normalize_age_verification,
}


def _body_for_operation(operation: str, phone: str, extra: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    extra = extra or {}
    if operation == "check_sim_swap":
        return {"phoneNumber": phone, "maxAge": int(extra.get("max_age_hours", 240))}
    if operation == "device_swap_check":
        return {"phoneNumber": phone, "maxAge": int(extra.get("max_age_hours", 48))}
    if operation in ("device_status_retrieve", "reachability", "roaming_status"):
        base: Dict[str, Any] = {"device": {"phoneNumber": phone}}
        for k, v in extra.items():
            if k not in INTERNAL_EXTRA_KEYS:
                base[k] = v
        return base
    if operation == "number_recycling":
        # NaC playground expects a flat body, e.g. {"phoneNumber":"+..","specifiedDate":"YYYY-MM-DD"}
        body: Dict[str, Any] = {"phoneNumber": phone}
        specified = extra.get("specifiedDate") or extra.get("specified_date")
        body["specifiedDate"] = str(specified) if specified else date.today().isoformat()
        return body
    if operation == "number_verification":
        # NaC number verification expects a direct phoneNumber field.
        return {"phoneNumber": phone}
    if operation == "call_forwarding_retrieve":
        return {"phoneNumber": phone}
    if operation == "kyc_tenure":
        body: Dict[str, Any] = {"phoneNumber": phone}
        tenure_date = extra.get("tenureDate") or extra.get("tenure_date")
        body["tenureDate"] = str(tenure_date) if tenure_date else date.today().isoformat()
        return body
    if operation == "kyc_match":
        # Keep schema flexible; NaC expects a flat JSON with phoneNumber + identity fields.
        body: Dict[str, Any] = {"phoneNumber": phone}
        for k, v in extra.items():
            if k in INTERNAL_EXTRA_KEYS:
                continue
            if k in {"phoneNumber", "device"}:
                continue
            body[k] = v
        return body
    if operation == "location_retrieve":
        return {
            "device": {"phoneNumber": phone},
            "maxAge": int(extra.get("max_age_seconds", 60)),
        }
    if operation == "location_verification_verify":
        lat = float(extra["center_lat"])
        lng = float(extra["center_lng"])
        r_m = int(extra.get("verification_radius_m", 3000))
        return {
            "device": {"phoneNumber": phone},
            "area": {
                "areaType": "CIRCLE",
                "center": {"latitude": lat, "longitude": lng},
                "radius": r_m,
            },
        }
    if operation == "congestion_insights":
        return {"device": {"phoneNumber": phone}}
    if operation == "kyc_age_verify":
        return {
            "ageThreshold": int(extra.get("min_age", 18)),
            "phoneNumber": phone,
            # Playground accepts optional fields; safe defaults for simulator mode.
            "includeParentalControl": bool(extra.get("include_parental_control", True)),
        }
    if operation == "consent_info":
        ref = extra.get("consent_reference")
        if ref:
            return {"consentId": ref}
        return {"device": {"phoneNumber": phone}}
    if operation == "retrieve_sim_swap_date":
        return {"phoneNumber": phone}
    return {k: v for k, v in extra.items() if k not in INTERNAL_EXTRA_KEYS} or None


def call_nac(operation: str, phone: str, extra: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], Optional[str]]:
    if not (CONFIG.RAPIDAPI_KEY or "").strip():
        msg = (
            "RAPIDAPI_KEY is not set — add your Nokia Network as Code / RapidAPI key "
            "to the API server's environment"
        )
        return {"_degraded": True, "_error": msg, "_operation": operation}, msg

    if operation in UNAVAILABLE_OPERATIONS:
        msg = (
            f"operation {operation} is unavailable in this NaC project "
            "(endpoint not provisioned)."
        )
        return {"_degraded": True, "_error": msg, "_operation": operation}, msg

    spec = OPERATIONS.get(operation)
    if not spec:
        err = f"unknown operation {operation}"
        return {"_degraded": True, "_error": err}, err

    method, path_tmpl = spec[0], spec[1]
    extra = extra or {}
    path_candidates = list(OPERATION_PATH_ALIASES.get(operation, (path_tmpl,)))
    if path_tmpl not in path_candidates:
        path_candidates.insert(0, path_tmpl)
    correlator = str(uuid.uuid4())

    body = _body_for_operation(operation, phone, extra)

    max_attempts = max(1, int(getattr(CONFIG, "NAC_RETRY_ATTEMPTS", 2)))
    last_err: Optional[Exception] = None
    raw: Dict[str, Any]
    resolved_path: Optional[str] = None
    final_error: Optional[str] = None

    for idx, candidate_tmpl in enumerate(path_candidates):
        path = _resolve_path(candidate_tmpl, extra)
        url = f"{CONFIG.RAPIDAPI_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
        r = None
        last_err = None
        for attempt in range(max_attempts):
            try:
                if method == "GET":
                    headers = _headers()
                    headers["x-correlator"] = correlator
                    params: Dict[str, str] = {}
                    if phone:
                        params["phoneNumber"] = phone
                    r = requests.get(url, headers=headers, params=params or None, timeout=CONFIG.NAC_TIMEOUT_SECONDS)
                else:
                    headers = _headers_json()
                    headers["x-correlator"] = correlator
                    r = requests.post(url, headers=headers, json=body or {}, timeout=CONFIG.NAC_TIMEOUT_SECONDS)

                logger.debug("NaC %s %s -> %s [%s]", method, operation, r.status_code, path)
                break
            except requests.RequestException as e:
                last_err = e
                if attempt + 1 < max_attempts:
                    time.sleep(0.2 * (attempt + 1))
                else:
                    final_error = str(e)

        if r is None:
            # Request exceptions are not path-shape errors, so no point in trying
            # other aliases for the same operation.
            msg = final_error or str(last_err or "no response")
            logger.warning("NaC call failed after retries %s: %s", operation, msg)
            return {"_degraded": True, "_error": msg, "_operation": operation}, msg

        body_text = (r.text or "").strip()
        missing_endpoint = r.status_code == 404 and "does not exist" in body_text

        if missing_endpoint and idx + 1 < len(path_candidates):
            snippet = body_text[:300]
            logger.warning(
                "NaC HTTP 404 %s on path %s; trying alias %s/%s. body=%s",
                operation,
                path,
                idx + 2,
                len(path_candidates),
                snippet or "(empty body)",
            )
            continue

        if missing_endpoint:
            UNAVAILABLE_OPERATIONS.add(operation)
            msg = (
                f"operation {operation} unavailable: NaC reports endpoint not provisioned "
                f"for this project. Last path tried: {path}"
            )
            logger.warning(msg)
            return {"_degraded": True, "_error": msg, "_operation": operation}, msg

        try:
            if r.status_code >= 400:
                snippet = body_text[:500]
                logger.warning("NaC HTTP %s %s: %s", r.status_code, operation, snippet or "(empty body)")
            r.raise_for_status()
            try:
                raw = r.json()
            except ValueError:
                raw = {"_text": r.text[:500]}
            resolved_path = path
            break
        except requests.HTTPError as e:
            resp = e.response
            snippet = (resp.text or "").strip()[:500] if resp is not None else ""
            msg = str(e)
            if snippet:
                msg = f"{msg} | body={snippet!r}"
            logger.warning("NaC call failed %s: %s", operation, msg)
            return {"_degraded": True, "_error": msg, "_operation": operation}, msg
        except requests.RequestException as e:
            msg = str(e)
            logger.warning("NaC call failed %s: %s", operation, msg)
            return {"_degraded": True, "_error": msg, "_operation": operation}, msg
    else:
        msg = final_error or f"all endpoint aliases failed for {operation}"
        return {"_degraded": True, "_error": msg, "_operation": operation}, msg

    norm_fn = NORMALIZERS.get(operation)
    out = norm_fn(raw) if norm_fn else {"_raw": raw}
    out["_operation"] = operation
    if resolved_path:
        out["_endpoint_path"] = resolved_path
    return out, None
