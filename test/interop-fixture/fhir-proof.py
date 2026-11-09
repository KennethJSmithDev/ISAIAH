"""Disposable local R5 endpoint proof. Never uses patient data or prints credentials."""
import base64
import hashlib
import json
import pathlib
import urllib.error
import urllib.request
import uuid

BASE = 'http://127.0.0.1:52773/isaiah-proof/fhir/r5'
password = pathlib.Path('/tmp/isaiah-interop013/fhir-secret').read_text().strip()
auth = 'Basic ' + base64.b64encode(('ISAIAHFHIRClient013:' + password).encode()).decode()


def request(path, method='GET', body=None, authorized=True):
    headers = {'Accept': 'application/fhir+json', 'Prefer': 'return=representation'}
    if authorized:
        headers['Authorization'] = auth
    if body is not None:
        headers['Content-Type'] = 'application/fhir+json'
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, dict(response.headers), json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, {}, None


status, _, _ = request('/Patient', authorized=False)
assert status in (401, 403, 404), ('Anonymous access', status)
anonymous_status = status
status, _, metadata = request('/metadata')
assert status == 200 and metadata['fhirVersion'] == '5.0.0'
identifier = 'ISAIAH-SYNTHETIC-' + str(uuid.uuid4())
resource = {'resourceType': 'Organization', 'active': True,
            'identifier': [{'system': 'urn:isaiah:synthetic', 'value': identifier}],
            'name': 'ISAIAH synthetic fixture destination'}
status, headers, created = request('/Organization', 'POST', resource)
assert status == 201, ('Create failed', status)
resource_id = created['id']
status, _, readback = request('/Organization/' + resource_id)
assert status == 200 and readback['identifier'] == resource['identifier']
assert readback['meta']['versionId'] == created['meta']['versionId']
status, _, _ = request('/Organization/not-present-isaiah013')
assert status == 404
print(json.dumps({'status': 'pass', 'kind': 'actual-local-FHIR-HTTP', 'path': 'direct-resource-repository',
                  'version': metadata['fhirVersion'], 'resourceType': 'Organization', 'id': resource_id,
                  'anonymousStatus': anonymous_status,
                  'identifier': identifier, 'versionId': readback['meta']['versionId'],
                  'sha256': hashlib.sha256(json.dumps(readback, sort_keys=True).encode()).hexdigest(),
                  'productionDeliveryClaim': False,
                  'checks': ['anonymous denied', 'authenticated R5 metadata', 'create/read identity and version', 'missing resource 404']}))
