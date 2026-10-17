"""Wait at most 45 seconds for the intended Java service, without printing bodies."""
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

deadline = time.monotonic() + 45
while time.monotonic() < deadline:
    try:
        with urlopen(sys.argv[1], timeout=2) as response:
            data = json.load(response)
            if response.status == 200 and data.get("language") == "Java" and data.get("matching_engine") == "C++":
                print("PASS: Java/C++ HTTP service is ready")
                break
    except (HTTPError, URLError, TimeoutError, ValueError):
        pass
    time.sleep(0.5)
else:
    raise SystemExit("Java service did not become ready within 45 seconds")
