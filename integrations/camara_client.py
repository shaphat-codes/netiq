import logging
import time
from typing import Any, Callable, Dict

from config import AppConfig
from integrations.nac_client import call_nac

CONFIG = AppConfig()
logger = logging.getLogger(__name__)
logger.info("Network signals: Nokia NaC (RapidAPI) only")

_cache_store: Dict[str, Any] = {}


def _cache_get(key: str, ttl_seconds: int):
    if key in _cache_store:
        value, ts = _cache_store[key]
        if (time.time() - ts) <= ttl_seconds:
            return value
        del _cache_store[key]
    return None


def _cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    _cache_store[key] = (value, time.time())


def _with_cache(name: str, key: str, func: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    cache_key = f"{name}:{key}"
    cached = _cache_get(cache_key, CONFIG.CACHE_TTL_SECONDS)
    if cached is not None:
        logger.debug("Cache hit for %s", cache_key)
        return cached
    value = func()
    _cache_set(cache_key, value, CONFIG.CACHE_TTL_SECONDS)
    return value


def _real_sim_swap(phone: str) -> Dict[str, Any]:
    data, err = call_nac("check_sim_swap", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_device_swap(phone: str) -> Dict[str, Any]:
    data, err = call_nac("device_swap_check", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_device(phone: str) -> Dict[str, Any]:
    data, err = call_nac("device_status_retrieve", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_location(phone: str) -> Dict[str, Any]:
    data, err = call_nac("location_retrieve", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_loc_verify(phone: str, lat: float, lng: float, radius_m: int) -> Dict[str, Any]:
    data, err = call_nac(
        "location_verification_verify",
        phone,
        {"center_lat": lat, "center_lng": lng, "verification_radius_m": radius_m},
    )
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_qos(phone: str) -> Dict[str, Any]:
    data, err = call_nac("qos_sessions", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_recycling(phone: str) -> Dict[str, Any]:
    data, err = call_nac("number_recycling", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_reachability(phone: str) -> Dict[str, Any]:
    data, err = call_nac("reachability", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_verify(phone: str) -> Dict[str, Any]:
    data, err = call_nac("number_verification", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_congestion(phone: str) -> Dict[str, Any]:
    data, err = call_nac("congestion_insights", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_roaming(phone: str) -> Dict[str, Any]:
    data, err = call_nac("roaming_status", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_call_forwarding(phone: str) -> Dict[str, Any]:
    data, err = call_nac("call_forwarding_retrieve", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_kyc_match(phone: str, name: str = "", id_doc: str = "") -> Dict[str, Any]:
    data, err = call_nac("kyc_match", phone, {"name": name, "id_document": id_doc})
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_kyc_tenure(phone: str) -> Dict[str, Any]:
    data, err = call_nac("kyc_tenure", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_age_verify(phone: str, min_age: int = 18) -> Dict[str, Any]:
    data, err = call_nac("kyc_age_verify", phone, {"min_age": min_age})
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_sim_swap_date(phone: str) -> Dict[str, Any]:
    data, err = call_nac("retrieve_sim_swap_date", phone)
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_geofence(phone: str, subscription_id: str) -> Dict[str, Any]:
    data, err = call_nac("geofencing_subscription_get", phone, {"subscription_id": subscription_id})
    if err:
        data.setdefault("_degraded", True)
    return data


def _real_consent(phone: str, consent_reference: str) -> Dict[str, Any]:
    data, err = call_nac("consent_info", phone, {"consent_reference": consent_reference})
    if err:
        data.setdefault("_degraded", True)
    return data


def check_sim_swap(phone: str) -> Dict[str, Any]:
    return _with_cache("sim_swap", phone, lambda: _real_sim_swap(phone))


def check_device_swap(phone: str) -> Dict[str, Any]:
    return _with_cache("dev_swap", phone, lambda: _real_device_swap(phone))


def check_device_status(phone: str) -> Dict[str, Any]:
    return _with_cache("device", phone, lambda: _real_device(phone))


def get_location(phone: str) -> Dict[str, Any]:
    return _with_cache("loc", phone, lambda: _real_location(phone))


def get_qos_status(phone: str) -> Dict[str, Any]:
    return _with_cache("qos", phone, lambda: _real_qos(phone))


def check_number_recycling(phone: str) -> Dict[str, Any]:
    return _with_cache("recycle", phone, lambda: _real_recycling(phone))


def check_reachability(phone: str) -> Dict[str, Any]:
    return _with_cache("reach", phone, lambda: _real_reachability(phone))


def verify_number(phone: str) -> Dict[str, Any]:
    return _with_cache("nv", phone, lambda: _real_verify(phone))


def verify_location_at(phone: str, lat: float, lng: float, radius_m: int = 3000) -> Dict[str, Any]:
    k = f"{phone}|{lat}|{lng}|{radius_m}"
    return _with_cache("locv", k, lambda: _real_loc_verify(phone, lat, lng, radius_m))


def get_congestion(phone: str) -> Dict[str, Any]:
    return _with_cache("cong", phone, lambda: _real_congestion(phone))


def get_geofencing_subscription(phone: str, subscription_id: str) -> Dict[str, Any]:
    k = f"{phone}|{subscription_id}"
    return _with_cache("geo", k, lambda: _real_geofence(phone, subscription_id))


def get_consent_info(phone: str, consent_reference: str) -> Dict[str, Any]:
    k = f"{phone}|{consent_reference}"
    return _with_cache("consent", k, lambda: _real_consent(phone, consent_reference))


def get_roaming_status(phone: str) -> Dict[str, Any]:
    return _with_cache("roaming", phone, lambda: _real_roaming(phone))


def get_call_forwarding(phone: str) -> Dict[str, Any]:
    return _with_cache("cfwd", phone, lambda: _real_call_forwarding(phone))


def verify_kyc_match(phone: str, name: str = "", id_doc: str = "") -> Dict[str, Any]:
    k = f"{phone}|{name}|{id_doc}"
    return _with_cache("kycm", k, lambda: _real_kyc_match(phone, name, id_doc))


def check_tenure(phone: str) -> Dict[str, Any]:
    return _with_cache("tenure", phone, lambda: _real_kyc_tenure(phone))


def verify_age(phone: str, min_age: int = 18) -> Dict[str, Any]:
    k = f"{phone}|{min_age}"
    return _with_cache("agev", k, lambda: _real_age_verify(phone, min_age))


def retrieve_sim_swap_date(phone: str) -> Dict[str, Any]:
    return _with_cache("simdate", phone, lambda: _real_sim_swap_date(phone))
