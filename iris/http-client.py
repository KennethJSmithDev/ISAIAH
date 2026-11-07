"""Fixed local transport to the ISAIAH-only IRIS REST application."""
import base64
import http.client
import json
import re
import sys

try:
    request = json.loads(sys.stdin.buffer.read(20000))
    method, path = request["method"], request["path"]
    allowed = (method == "GET" and path == "/health"
               or method == "POST" and path in ("/run", "/repair")
               or method == "GET" and re.fullmatch(r"/(?:state|verify|repair)/[0-9a-f-]{36}", path)
               or method == "POST" and re.fullmatch(r"/cancel/[0-9a-f-]{36}", path))
    if not allowed:
        raise ValueError("unsupported request")
    credential = base64.b64encode(("IsaiahAdapter:" + request["password"]).encode()).decode()
    timeout = {"/run": 310, "/repair": 20}.get(path, 5)
    connection = http.client.HTTPConnection("127.0.0.1", 52773, timeout=timeout)
    connection.request(method, "/isaiah" + path, json.dumps(request.get("body")) if method == "POST" else None,
                       {"Authorization": "Basic " + credential, "Content-Type": "application/json"})
    response = connection.getresponse()
    data = response.read(196609)
    connection.close()
    try:
        payload = json.loads(data)
    except (ValueError, UnicodeError):
        payload = {"error": "IRIS gateway returned a non-JSON response."}
    print(json.dumps({"code": response.status, "payload": payload}, ensure_ascii=True))
except (ValueError, OSError, KeyError, http.client.HTTPException):
    print(json.dumps({"code": 503, "payload": {"error": "Task-owned IRIS transport unavailable."}}))
