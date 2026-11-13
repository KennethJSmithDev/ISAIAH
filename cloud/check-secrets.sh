#!/bin/sh
set -eu
umask 077
exec python3 "$(dirname "$0")/credentials.py"
