"""Operational events without account IDs, cookies, query strings, or bodies."""
import json
import logging
import time
import uuid

logger = logging.getLogger("lot.requests")


class RequestMetrics:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        request_id = str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "private, no-store"
        match = getattr(request, "resolver_match", None)
        logger.info(json.dumps({"event": "request", "request_id": request_id,
                               "method": request.method, "route": match.route if match else "unmatched",
                               "status": response.status_code,
                               "duration_ms": round((time.perf_counter() - started) * 1000, 2)}))
        return response
