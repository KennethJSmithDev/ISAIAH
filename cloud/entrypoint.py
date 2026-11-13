"""Keep provisioning mandatory when a platform replaces the image CMD."""
import os
import re
import sys
from credentials import ENVIRONMENT, bootstrap

GATEWAY_HOOK = re.compile(r"bash /opt/iris-password-hook/password-hook\.sh '[A-Za-z0-9.*_:,/-]*'")
GATEWAY_COMPATIBILITY = '[ -e /usr/irissys/bin/CSPpwd ] || ln -s /usr/irissys/csp/bin/CSPpwd /usr/irissys/bin/CSPpwd'

def validated_arguments(arguments):
    aliases = {'--instance': 'instance', '-i': 'instance', '--check-caps': 'caps',
        '--before': 'before', '-b': 'before', '--create': 'create', '-c': 'create',
        '--password-file': 'password-file', '-p': 'password-file', '--key': 'key', '-k': 'key'}
    seen = set()
    if len(arguments) > 20 or len(arguments) % 2:
        raise ValueError('Unsupported platform argument structure')
    for flag, value in zip(arguments[::2], arguments[1::2]):
        kind = aliases.get(flag)
        if kind is None or kind in seen or len(value) > 512:
            raise ValueError('Unsupported or conflicting platform arguments')
        seen.add(kind)
        allowed = ((kind == 'instance' and value == 'IRIS') or
            (kind == 'caps' and value in ('true', 'false')) or
            (kind == 'before' and GATEWAY_HOOK.fullmatch(value) is not None) or
            (kind == 'create' and value == GATEWAY_COMPATIBILITY) or
            (kind == 'password-file' and value == '/etc/iris-secrets/iris-password') or
            (kind == 'key' and re.fullmatch(r'/[A-Za-z0-9._/-]+', value) is not None and '..' not in value.split('/')))
        if not allowed:
            raise ValueError('Platform argument is outside the reviewed chart contract')
    return list(arguments)

def launch(arguments):
    accepted = validated_arguments(arguments)
    bootstrap()
    for name in ENVIRONMENT:
        os.environ.pop(name, None)
    os.execv('/tini', ['/tini', '--', '/iris-main', '--after', '/opt/isaiah/provision.sh', *accepted])

if __name__ == '__main__':
    try:
        launch(sys.argv[1:])
    except (OSError, ValueError, TypeError):
        raise SystemExit('Cloud startup refused: check the scoped runtime credentials and reviewed platform arguments.')
