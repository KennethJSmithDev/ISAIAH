#!/bin/sh
set -eu
umask 077
private=/tmp/isaiah-private
fixture=/opt/trace-fixture
mkdir -p "$private" /usr/irissys/mgr/isaiahdev
rm -f "$private/trace-ready"

run_step() {
    if ! iris session IRIS -U "$1" >"$private/step.log" 2>&1 || ! grep -Fxq "$2" "$private/step.log"; then
        if [ "$2" != ISAIAH-SECURITY-READY ]; then tail -n 60 "$private/step.log"; fi
        printf 'ISAIAH trace provisioning failed at %s\n' "$2" >&2
        exit 1
    fi
}

run_step '%SYS' ISAIAHDEV-BUILD-READY <<'COS'
if $ZVERSION'["2026.3.0AI (Build 154U)" halt
if (($ListFind($SYSTEM.Version.GetISCComponents(),"Health")>0)'=($SYSTEM.Util.GetEnviron("ISAIAH_EDITION")="iris-for-health")) halt
write "ISAIAHDEV-BUILD-READY",!
halt
COS
run_step '%SYS' ISAIAHDEV-NAMESPACE-READY <"$fixture/namespace.txt"
run_step ISAIAHDEV ISAIAHDEV-PRODUCTION-READY <"$fixture/production.txt"

python3 - <<'PY' | run_step '%SYS' ISAIAH-SECURITY-READY
import json, pathlib, re
profile = json.loads(pathlib.Path('/run/secrets/isaiah-developer').read_text())
password = profile['tracePassword']
if not re.fullmatch(r'Tr![0-9A-F]{28}', password):
    raise SystemExit('Invalid developer credentials')
print(f'set password="{password}"')
print(pathlib.Path('/opt/trace-fixture/security.txt').read_text(), end='')
PY

python3 - <<'PY' | run_step ISAIAHDEV ISAIAHDEV-TRACE-READY
import json, pathlib, uuid
profile = json.loads(pathlib.Path('/run/secrets/isaiah-developer').read_text())
print('set target="'+str(uuid.UUID(profile['instance']))+'"')
print('''set sc=1 if '##class(%Dictionary.ClassDefinition).%ExistsId("%IPM.Main") set sc=$SYSTEM.OBJ.Load("/opt/isaiah/zpm.xml","ck")
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
if '##class(%Dictionary.ClassDefinition).%ExistsId("Isaiah.TraceApi") set sc=##class(%IPM.Main).Shell("load /opt/isaiah -nodev")
if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt
set ^IsaiahTrace("identity")=target,^IsaiahTrace("production")="DevTrace.Production"
set grant=##class(%SQL.Statement).%ExecDirect(,"GRANT SELECT ON Ens.MessageHeader TO IsaiahTraceRole")
if grant.%SQLCODE<0 write grant.%Message,! halt
set rows=##class(%SQL.Statement).%ExecDirect(,"SELECT TOP 2 SessionId, MIN(ID) AS FirstId FROM Ens.MessageHeader WHERE SourceConfigName = ? GROUP BY SessionId ORDER BY SessionId","Fixture Intake")
if 'rows.%Next() halt
set ^IsaiahTrace("session",rows.%Get("SessionId"))=rows.%Get("FirstId")
write "ISAIAHDEV-TRACE-READY",!
halt''')
PY
touch "$private/trace-ready"
