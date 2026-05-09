"""
Nokia Network as Code via RapidAPI — path suffixes under RAPIDAPI_BASE_URL.
Paths follow EU passthrough layout; adjust in NaC playground if a call returns 404.
Use {subscription_id} in a path — replaced from extra when calling call_nac.
"""

from typing import Dict, Tuple

OPERATIONS: Dict[str, Tuple[str, str]] = {
    "check_sim_swap": ("POST", "/passthrough/camara/v1/sim-swap/sim-swap/v0/check"),
    "retrieve_sim_swap_date": ("POST", "/passthrough/camara/v1/sim-swap/sim-swap/v0/retrieve-date"),
    "device_status_retrieve": ("POST", "/device-status/v0/retrieve"),
    "location_retrieve": ("POST", "/location-retrieval/v0/retrieve"),
    "location_verification_verify": (
        "POST",
        "/passthrough/camara/v1/location-verification/location-verification/v1/verify",
    ),
    "qos_sessions": ("GET", "/qod/v0/sessions"),
    "number_verification": ("POST", "/passthrough/camara/v1/number-verification/number-verification/v0/verify"),
    "number_recycling": ("POST", "/passthrough/camara/v1/number-recycling/number-recycling/v0.2/check"),
    "reachability": ("POST", "/device-status/device-reachability-status/v1/retrieve"),
    "congestion_insights": ("POST", "/congestion-insights/v0/query"),
    "geofencing_subscription_get": (
        "GET",
        "/passthrough/camara/v1/geofencing/geofencing/v0/subscriptions/{subscription_id}",
    ),
    "consent_info": ("POST", "/passthrough/camara/v1/consent/consent-info/v0/retrieve"),
    "device_swap_check": ("POST", "/passthrough/camara/v1/device-swap/device-swap/v1/check"),
    # --- new APIs ---
    "roaming_status": ("POST", "/device-status/device-roaming-status/v1/retrieve"),
    "call_forwarding_retrieve": (
        "POST",
        "/passthrough/camara/v1/call-forwarding-signal/call-forwarding-signal/v0.3/call-forwardings",
    ),
    "kyc_match": ("POST", "/passthrough/camara/v1/kyc-match/kyc-match/v0.3/match"),
    "kyc_tenure": ("POST", "/passthrough/camara/v1/kyc-tenure/kyc-tenure/v0.1/check-tenure"),
    "kyc_age_verify": (
        "POST",
        "/passthrough/camara/v1/kyc-age-verification/kyc-age-verification/v0.1/verify",
    ),
}

# Alternate path candidates tried when NaC returns:
#   {"message":"Endpoint '...' does not exist"}
# This guards against route drift across NaC project versions/regions.
OPERATION_PATH_ALIASES: Dict[str, Tuple[str, ...]] = {
    "check_sim_swap": (
        "/passthrough/camara/v1/sim-swap/sim-swap/v0/check",
        "/passthrough/camara/v1/sim-swap/v0/check",
        "/passthrough/camara/v1/sim-swap/v1/check",
    ),
    "retrieve_sim_swap_date": (
        "/passthrough/camara/v1/sim-swap/sim-swap/v0/retrieve-date",
        "/passthrough/camara/v1/sim-swap/v0/retrieve-date",
        "/passthrough/camara/v1/sim-swap/v1/retrieve-date",
    ),
    "device_status_retrieve": (
        "/device-status/v0/retrieve",
        "/device-status/v1/retrieve",
        "/passthrough/camara/v1/device-status/device-status/v0/retrieve",
        "/passthrough/camara/v1/device-status/v0/retrieve",
        "/passthrough/camara/v1/device-status/v1/retrieve",
    ),
    "location_retrieve": (
        "/location-retrieval/v0/retrieve",
        "/location-retrieval/v1/retrieve",
        "/passthrough/camara/v1/location-retrieval/location/v0/retrieve",
        "/passthrough/camara/v1/location-retrieval/v0/retrieve",
        "/passthrough/camara/v1/location-retrieval/v1/retrieve",
        "/passthrough/camara/v1/location/v0/retrieve",
    ),
    "location_verification_verify": (
        "/passthrough/camara/v1/location-verification/location-verification/v1/verify",
        "/passthrough/camara/v1/location-verification/v1/verify",
        "/passthrough/camara/v1/location-verification/v0/verify",
    ),
    "qos_sessions": (
        "/qod/v0/sessions",
        "/qod/v1/sessions",
        "/passthrough/camara/v1/quality-on-demand/qos/v0/sessions",
        "/passthrough/camara/v1/quality-on-demand/v0/sessions",
        "/passthrough/camara/v1/quality-on-demand/v1/sessions",
        "/passthrough/camara/v1/qod/v0/sessions",
    ),
    "number_verification": (
        "/passthrough/camara/v1/number-verification/number-verification/v0/verify",
        "/passthrough/camara/v1/number-verification/number-verification/v1/verify",
        "/passthrough/camara/v1/number-verification/v0/verify",
        "/passthrough/camara/v1/number-verification/v1/verify",
        "/passthrough/camara/v1/number-verification/v0/verify",
    ),
    "number_recycling": (
        "/passthrough/camara/v1/number-recycling/number-recycling/v0.2/check",
        "/passthrough/camara/v1/number-recycling/number-recycling/v0/check",
        "/passthrough/camara/v1/number-recycling/v0/check",
        "/passthrough/camara/v1/number-recycling/v1/check",
    ),
    "reachability": (
        "/device-status/device-reachability-status/v1/retrieve",
        "/passthrough/camara/v1/device-reachability/device-reachability/v0/retrieve",
        "/passthrough/camara/v1/device-reachability/v0/retrieve",
        "/passthrough/camara/v1/device-reachability/v1/retrieve",
    ),
    "congestion_insights": (
        "/congestion-insights/v0/query",
        "/congestion-insights/v0/subscriptions/fetch",
        "/congestion-insights/v0/subscriptions",
        "/congestion-insights/v1/retrieve",
        "/congestion-insights/v0/retrieve",
        "/passthrough/camara/v1/congestion-insights/congestion-insights/v1/retrieve",
        "/passthrough/camara/v1/congestion-insights/v1/retrieve",
        "/passthrough/camara/v1/congestion-insights/v0/retrieve",
    ),
    "geofencing_subscription_get": (
        "/passthrough/camara/v1/geofencing/geofencing/v0/subscriptions/{subscription_id}",
        "/passthrough/camara/v1/geofencing/v0/subscriptions/{subscription_id}",
        "/passthrough/camara/v1/geofencing/v1/subscriptions/{subscription_id}",
    ),
    "consent_info": (
        "/passthrough/camara/v1/consent/consent-info/v0/retrieve",
        "/passthrough/camara/v1/consent/v0/retrieve",
        "/passthrough/camara/v1/consent-info/v0/retrieve",
    ),
    "device_swap_check": (
        "/passthrough/camara/v1/device-swap/device-swap/v1/check",
        "/passthrough/camara/v1/device-swap/v1/check",
        "/passthrough/camara/v1/device-swap/v0/check",
    ),
    "roaming_status": (
        "/device-status/device-roaming-status/v1/retrieve",
        "/device-status/device-roaming-status/v0/retrieve",
        "/passthrough/camara/v1/device-roaming-status/roaming/v0/retrieve",
        "/passthrough/camara/v1/device-roaming-status/v0/retrieve",
        "/passthrough/camara/v1/roaming/v0/retrieve",
    ),
    "call_forwarding_retrieve": (
        "/passthrough/camara/v1/call-forwarding-signal/call-forwarding-signal/v0.3/call-forwardings",
        "/passthrough/camara/v1/call-forwarding-signal/call-forwarding-signal/v0/retrieve",
        "/passthrough/camara/v1/call-forwarding-signal/v0.3/call-forwardings",
        "/passthrough/camara/v1/call-forwarding-signal/v0/retrieve",
        "/passthrough/camara/v1/call-forwarding/v0/retrieve",
    ),
    "kyc_match": (
        "/passthrough/camara/v1/kyc-match/kyc-match/v0.3/match",
        "/passthrough/camara/v1/kyc-match/kyc-match/v0/match",
        "/passthrough/camara/v1/kyc-match/v0.3/match",
        "/passthrough/camara/v1/kyc-match/v0/match",
        "/passthrough/camara/v1/kyc-match/v1/match",
    ),
    "kyc_tenure": (
        "/passthrough/camara/v1/kyc-tenure/kyc-tenure/v0.1/check-tenure",
        "/passthrough/camara/v1/kyc-tenure/kyc-tenure/v0/check",
        "/passthrough/camara/v1/kyc-tenure/v0.1/check-tenure",
        "/passthrough/camara/v1/kyc-tenure/v0/check",
        "/passthrough/camara/v1/kyc-tenure/v1/check",
    ),
    "kyc_age_verify": (
        "/passthrough/camara/v1/kyc-age-verification/kyc-age-verification/v0.1/verify",
        "/passthrough/camara/v1/kyc-age-verification/kyc-age-verification/kyc-age-verification",
        "/passthrough/camara/v1/kyc-age-verification/kyc-age-verification/v0/verify",
        "/passthrough/camara/v1/kyc-age-verification/v0/verify",
        "/passthrough/camara/v1/age-verification/age-verification/v0/verify",
        "/passthrough/camara/v1/age-verification/v0/verify",
        "/passthrough/camara/v1/age-verification/v1/verify",
    ),
}
