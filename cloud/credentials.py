"""Materialize only the existing scoped IRIS/gateway credential contract."""
import hmac
import json
import os
import pathlib
import re
import stat

SECRET = pathlib.Path('/run/secrets/isaiah-credentials')
ENVIRONMENT = ('ISAIAH_ADAPTER_PASSWORD', 'ISAIAH_PROVIDER_TOKEN')

def validated(value):
    if not isinstance(value, dict) or not isinstance(value.get('password'), str) or not isinstance(value.get('providerToken'), str):
        raise ValueError('Invalid scoped credential shape')
    if not re.fullmatch(r'Is![0-9A-F]{28}', value['password']) or not re.fullmatch(r'[0-9A-F]{64}', value['providerToken']):
        raise ValueError('Invalid scoped credential shape')
    return {key: value[key] for key in ('password', 'providerToken')}

def private_directory(metadata):
    if not stat.S_ISDIR(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o700 or metadata.st_uid != os.geteuid():
        raise ValueError('Runtime credential directory must be private to the image user')

def create_private_file(path, value):
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        private_directory(os.fstat(directory))
        descriptor = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            metadata = os.fstat(output.fileno())
            if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600 or metadata.st_uid != os.geteuid():
                raise ValueError('Runtime credential file is not private to the image user')
            output.write(json.dumps(value, separators=(',', ':')) + '\n')
            output.flush()
            os.fsync(output.fileno())
    finally:
        os.close(directory)

def bootstrap(path=SECRET, environment=None):
    environment = os.environ if environment is None else environment
    present = [name in environment for name in ENVIRONMENT]
    supplied = None
    if any(present):
        if not all(present):
            raise ValueError('Supply both scoped runtime credential variables')
        supplied = validated({'password': environment[ENVIRONMENT[0]], 'providerToken': environment[ENVIRONMENT[1]]})
    try:
        with path.open('rb') as stream:
            content = stream.read(4097)
        if len(content) > 4096:
            raise ValueError('Scoped credential file exceeds the limit')
        mounted = validated(json.loads(content))
    except FileNotFoundError:
        if supplied is None:
            raise ValueError('Supply the scoped runtime credential file or both runtime variables')
        create_private_file(path, supplied)
        return 'environment'
    if supplied is not None and any(not hmac.compare_digest(mounted[key], supplied[key]) for key in mounted):
        raise ValueError('Scoped runtime credential sources conflict')
    return 'file'

if __name__ == '__main__':
    try:
        bootstrap()
    except (OSError, ValueError, TypeError):
        raise SystemExit('Scoped runtime credentials are missing, malformed, conflicting, or not safely writable.')
