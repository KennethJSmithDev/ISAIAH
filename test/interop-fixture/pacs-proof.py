"""QIDO query and WADO retrieval of the generated 2x2 fixture, never clinical data."""
import base64
import email.policy
import email.parser
import hashlib
import io
import json
import pathlib
import sys
import urllib.error
import urllib.request
import pydicom

fixture, secret_file, receipt_file = map(pathlib.Path, sys.argv[1:])
source = fixture.read_bytes()
dataset = pydicom.dcmread(io.BytesIO(source))
uids = [str(dataset.StudyInstanceUID), str(dataset.SeriesInstanceUID), str(dataset.SOPInstanceUID)]
assert hashlib.sha256(source).hexdigest() == '8e0c8f1afebbfb8c3a1cb915e569bdee53cd0b2f59df9a4454f523bc8fca1608'
assert dataset.PatientName == 'SYNTHETIC^TEST' and dataset.Rows == 2 and dataset.Columns == 2
auth = 'Basic ' + base64.b64encode(('isaiah013:' + secret_file.read_text().strip()).encode()).decode()
base = 'http://127.0.0.1:18873'


def request(path, method='GET', data=None, headers=None, authorized=True):
    headers = dict(headers or {})
    if authorized:
        headers['Authorization'] = auth
    req = urllib.request.Request(base + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, response.headers, response.read(2_000_001)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, b''


status, _, _ = request('/system', authorized=False)
assert status == 401
status, _, body = request('/system')
system = json.loads(body)
assert status == 200
status, _, body = request('/instances', 'POST', source, {'Content-Type': 'application/dicom'})
stored = json.loads(body)
assert status == 200 and stored['Status'] in ('Success', 'AlreadyStored')
path = '/dicom-web/studies/' + uids[0] + '/series/' + uids[1] + '/instances'
status, _, body = request(path, headers={'Accept': 'application/dicom+json'})
query = json.loads(body)
assert status == 200 and len(query) == 1 and query[0]['00080018']['Value'] == [uids[2]]
status, headers, body = request(path + '/' + uids[2], headers={'Accept': 'multipart/related; type="application/dicom"'})
assert status == 200 and len(body) <= 2_000_000
message = email.parser.BytesParser(policy=email.policy.default).parsebytes(
    ('Content-Type: ' + headers['Content-Type'] + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + body)
parts = list(message.iter_parts())
assert len(parts) == 1
retrieved = parts[0].get_payload(decode=True)
destination = pydicom.dcmread(io.BytesIO(retrieved))
assert [str(destination.StudyInstanceUID), str(destination.SeriesInstanceUID), str(destination.SOPInstanceUID)] == uids
assert destination.PixelData == dataset.PixelData
receipt_file.write_bytes(retrieved)
digest = hashlib.sha256(retrieved).hexdigest()
assert hashlib.sha256(receipt_file.read_bytes()).hexdigest() == digest
status, _, _ = request(path + '/1.2.999999999')
assert status == 404
print(json.dumps({'status': 'pass', 'kind': 'actual-local-QIDO-WADO', 'orthancVersion': system['Version'],
                  'uids': uids, 'storedId': stored['ID'], 'retrievedSha256': digest,
                  'destinationReceipt': receipt_file.name, 'productionDeliveryClaim': False,
                  'checks': ['anonymous denied', 'synthetic seed stored', 'QIDO exact UID',
                             'WADO received exact UIDs and pixels', 'independent destination readback', 'missing instance refused']}))
