#!/bin/sh
set -eu
umask 077

private=/tmp/isaiah-private
source=/opt/isaiah
mkdir -p "$private" /usr/irissys/mgr/isaiah /tmp/isaiah-review-outbox
chmod 700 /tmp/isaiah-review-outbox
rm -f "$private/ready"

run_step() {
    namespace=$1
    marker=$2
    if ! iris session IRIS -U "$namespace" >"$private/step.log" 2>&1 ||
       ! grep -Fxq "$marker" "$private/step.log"; then
        if [ "$marker" != ISAIAH-SECURITY-READY ]; then cat "$private/step.log"; fi
        printf 'ISAIAH provisioning failed at %s\n' "$marker" >&2
        exit 1
    fi
}

run_step '%SYS' ISAIAH-BUILD-READY <<'COS'
if $ZVERSION'["2026.3.0AI (Build 154U)" halt
set edition=$SYSTEM.Util.GetEnviron("ISAIAH_EDITION")
if edition'="",(($ListFind($SYSTEM.Version.GetISCComponents(),"Health")>0)'=(edition="iris-for-health")) halt
write "ISAIAH-BUILD-READY",!
halt
COS

run_step '%SYS' ISAIAH-NAMESPACE-READY <"$source/iris/setup-namespace.txt"

run_step ISAIAH ISAIAH-MODULE-READY <<'COS'
set sc=1 if '##class(%Dictionary.ClassDefinition).%ExistsId("%IPM.Main") set sc=$SYSTEM.OBJ.Load("/opt/isaiah/zpm.xml","ck")
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
set rows=##class(%SQL.Statement).%ExecDirect(,"SELECT VersionString FROM %IPM_Storage.ModuleItem WHERE Name = ?","isaiah"),installed=$Select(rows.%Next():rows.%Get("VersionString"),1:"")
if installed'="",installed'="0.1.1" write "Unexpected installed ISAIAH module version",! halt
if installed="" set sc=##class(%IPM.Main).Shell("load /opt/isaiah -nodev")
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
if '##class(%Dictionary.ClassDefinition).%ExistsId("Isaiah.Api") halt
write "ISAIAH-MODULE-READY",!
halt
COS

python3 - "$private" <<'PY' | run_step '%SYS' ISAIAH-SECURITY-READY
import json
import pathlib
import re
import sys

secret = json.loads(pathlib.Path('/run/secrets/isaiah-credentials').read_text())
password, token = secret['password'], secret['providerToken']
if not re.fullmatch(r'Is![0-9A-F]{28}', password) or not re.fullmatch(r'[0-9A-F]{64}', token):
    raise SystemExit('Invalid ISAIAH secret file')
pathlib.Path(sys.argv[1], 'provider').write_text(token)
print(f'set password="{password}"')
print(pathlib.Path('/opt/isaiah/iris/setup-security.txt').read_text(), end='')
PY

run_step ISAIAH ISAIAH-PRODUCTION-READY <<'COS'
set sc=##class(Ens.Director).GetProductionStatus(.name,.state)
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
if state=1,name'="Isaiah.Production" write "Different production already running",! halt
if state'=1 set sc=##class(Ens.Director).StartProduction("Isaiah.Production")
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
if '$Data(^IsaiahReceipt("R17"))!('$Data(^IsaiahReceipt("R29"))) set sc=##class(Isaiah.Fixture).Seed()
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
write "ISAIAH-PRODUCTION-READY",!
halt
COS

touch "$private/ready"
printf 'ISAIAH IPM module and synthetic production ready.\n'
