import json
import sys
import requests


def main():
    if len(sys.argv) < 2:
        print("Usage: python -m netiq.cli '<json_request>' [host=http://localhost:8080]")
        sys.exit(1)
    body = json.loads(sys.argv[1])
    host = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8080"
    r = requests.post(f"{host}/analyze", json=body, timeout=10)
    print(r.status_code, r.text)


if __name__ == "__main__":
    main()

