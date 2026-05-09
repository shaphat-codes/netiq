from typing import Dict, Tuple


def clamp(value: float, min_value: float = 0.0, max_value: float = 1.0) -> float:
    if value < min_value:
        return min_value
    if value > max_value:
        return max_value
    return value


def normalize_risk_to_confidence(risk_score: float, max_risk: float = 100.0) -> float:
    normalized = 1.0 - (risk_score / max_risk)
    return clamp(normalized, 0.0, 1.0)


def compute_location_mismatch(requested_location: Dict, actual_location: Dict, tolerance_km: float = 5.0) -> bool:
    if not requested_location or not actual_location:
        return False
    lat_diff = abs(float(requested_location.get("lat", 0)) - float(actual_location.get("lat", 0)))
    lng_diff = abs(float(requested_location.get("lng", 0)) - float(actual_location.get("lng", 0)))
    km_lat = lat_diff * 111.0
    km_lng = lng_diff * 111.0
    return (km_lat > tolerance_km) or (km_lng > tolerance_km)


def select_best_mobility_action(signals: Dict) -> Tuple[str, float, str]:
    gf = signals.get("geofencing", {})
    if not gf.get("_degraded") and gf.get("inside_geofence") is False:
        return "OTP", 0.55, "Outside expected geofence; verify user position"

    cong = signals.get("congestion", {})
    if not cong.get("_degraded"):
        c = str(cong.get("congestion", "medium")).lower()
        if c == "high":
            return "PRIORITIZE", 0.74, "High congestion; prioritize connectivity for trip"

    qos = signals.get("qos_status", {}).get("quality", "medium")
    device_ok = signals.get("device_status", {}).get("status", "unknown") == "active"
    reach = signals.get("reachability", {}).get("reachable", True)
    if not reach:
        return "PRIORITIZE", 0.75, "User reachability low; prioritize connectivity"
    if qos == "high" and device_ok:
        return "ALLOW", 0.9, "High QoS and device active"
    if qos == "low":
        return "PRIORITIZE", 0.7, "Low QoS; prioritize network resources"
    return "ALLOW", 0.65, "Default mobility allowance"
