"""Bounded adapter for a pinned Hermes checkout and an ISAIAH-only profile."""

from datetime import UTC, datetime
from hashlib import sha256
import json
import os
from pathlib import Path
from time import perf_counter
import re
import sys

SOURCE = Path(sys.argv[1]).resolve()
PROFILE = Path(sys.argv[2]).resolve()
COMPATIBILITY = sys.argv[3]
NAME = "isaiah-routing-evidence"
REVIEW_POLICY = "skills:\n  write_approval: true\n  ledger: true\nmemory:\n  write_approval: true\n"
SKILL = PROFILE / "skills" / NAME / "SKILL.md"
REVIEW = PROFILE / "isaiah-review.json"
LOCK = PROFILE / "isaiah-review.lock"
BASE = "Read the selected incident trace before drawing a conclusion."
LESSON = (
    "Compare the incoming priority, deployed match priority, router selection, and actual delivery receipt in that order. "
    "Report the comparisonOrder as [priority, matchPriority, selected, delivered]. "
    "If selection differs from actual delivery, review the downstream discrepancy."
)
REPAIR_LESSON = (
    LESSON + " For a suspected routing predicate mismatch, use the observed incoming priority as a candidate "
    "and require a replay and verified destination receipt before calling the repair qualified. "
    "For a predicate mismatch, report repairCheck as replay_required."
)
SEED = f"""---
name: {NAME}
description: Investigate synthetic delivery discrepancies in ISAIAH.
---

## When to Use

Use for a synthetic routing investigation in the ISAIAH sandbox.

{BASE}
"""
PATCHED = SEED.replace(BASE, LESSON)
REPAIRED = SEED.replace(BASE, REPAIR_LESSON)

if PROFILE != Path(os.environ["HERMES_HOME"]).resolve():
    raise SystemExit("Isolated profile identity mismatch")
sys.path.insert(0, str(SOURCE))
from hermes_constants import get_hermes_home
from tools import skill_ledger, skill_manager_tool, skills_tool, write_approval
from tools.memory_tool import load_on_disk_store
from tools.skill_usage import skill_file_lock
from utils import atomic_json_write

if get_hermes_home().resolve() != PROFILE:
    raise SystemExit("Hermes did not bind to the isolated profile")


class ReviewError(Exception):
    pass


def owned(path):
    if path.resolve() != path:
        raise ReviewError("Redirected file in the learning profile.")
    return path


def digest(text):
    return sha256(text.encode("utf-8")).hexdigest()


def read_skill():
    result = json.loads(skills_tool.skill_view(NAME, preprocess=False))
    content = result.get("content")
    if (result.get("success") is not True or Path(result["skill_dir"]).resolve() != SKILL.parent
            or not isinstance(content, str)):
        raise ReviewError("Hermes could not load the local routing skill.")
    return content


def check_policy():
    config = owned(PROFILE / "config.yaml")
    if not (config.is_file() and config.read_text(encoding="utf-8") == REVIEW_POLICY
            and write_approval.write_approval_enabled(write_approval.SKILLS)
            and write_approval.write_approval_enabled(write_approval.MEMORY)
            and skill_ledger.ledger_enabled()):
        raise ReviewError("The reviewed learning policy or skill ledger is disabled.")


def save(review):
    atomic_json_write(owned(REVIEW), review)


def now():
    return datetime.now(UTC).isoformat()


def read_review():
    if not owned(REVIEW).is_file():
        return None
    review = json.loads(REVIEW.read_text(encoding="utf-8"))
    if not re.fullmatch(r"[0-9a-f]{8}", review.get("id", "")):
        raise ReviewError("Stored learning review identity is invalid.")
    return review


def pending_patch(review):
    pending = write_approval.get_pending(write_approval.SKILLS, review["id"])
    payload = (pending or {}).get("payload", {})
    previous = review.get("priorLesson", BASE)
    lesson = REPAIR_LESSON if review.get("kind") == "repair" else LESSON
    if (payload.get("action") != "patch" or payload.get("name") != NAME
            or previous not in (BASE, LESSON) or payload.get("old_string") != previous
            or payload.get("new_string") != lesson
            or set(payload) - {"action", "name", "old_string", "new_string", "replace_all"}
            or payload.get("replace_all")):
        raise ReviewError("The stored Hermes pending patch differs from the reviewed change.")
    return payload


def find_patch(review):
    for row in skill_ledger.list_entries(NAME, limit=12):
        if row["action"] != "patch" or row["id"] in review["priorPatches"]:
            continue
        before, after = row["before"], row["after"]
        if (len(before) == len(after) == 1 and matches_blob(before[0], review["expectedRevision"])
                and matches_blob(after[0], review["revision"])):
            return row["id"]
    return None


def matches_blob(part, expected):
    if Path(part["path"]).resolve() != SKILL:
        return False
    blob = skill_ledger.read_blob(part["sha256"])
    return (blob is not None and sha256(blob).hexdigest() == part["sha256"]
            and digest(blob.decode("utf-8").replace("\r\n", "\n")) == expected)


def reconcile(review, current):
    # Observe an interrupted action's durable result. Never replay it here.
    if review and review["status"] == "applying":
        patch = find_patch(review)
        if current == review["revision"] and patch:
            review.update(status="accepted", ledgerEntry=patch, reviewedAt=now())
            save(review)
            write_approval.discard_pending(write_approval.SKILLS, review["id"])
        elif current == review["expectedRevision"] and not patch:
            review.update(status="proposed", lastAttempt="Previous apply left the prior revision in place.")
            save(review)
    if review and review["status"] == "restoring" and current == review["expectedRevision"]:
        rollback = next((row for row in skill_ledger.list_entries(NAME, limit=12)
                         if row["action"] == "rollback"
                         and row["evidence"].get("rollback_target") == review["ledgerEntry"]), None)
        if rollback:
            review.update(status="restored", restoreEntry=rollback["id"], restoredAt=now())
            save(review)


def render(review, content, memory_revision):
    current = digest(content)
    revisions = {"skill": None, "memory": memory_revision}
    actions = {}
    display = []
    applicability = "baseline"
    guidance = BASE if current == digest(SEED) else ""
    summary = "Baseline routing skill loaded. No review is pending."
    if review:
        same_scope = COMPATIBILITY == review["compatibility"]
        status = review["status"]
        review_applicability = "applicable" if same_scope else "inapplicable"
        if status == "proposed":
            actions["reject"] = "Reject"
            if same_scope and current == review["expectedRevision"] and memory_revision == review["memoryRevision"]:
                actions["accept"] = "Accept"
        if status == "accepted" and current == review["revision"]:
            actions["restore"] = "Restore previous"
            summary = "Reviewed routing skill loaded for the next session." if same_scope else (
                "Stored lesson is inapplicable to the current routing contract. Baseline guidance is in use."
            )
        else:
            summary = {
                "proposed": "A verified run supports a routing skill patch.",
                "rejected": "Review rejected. The previous routing skill remains current.",
                "restored": "Previous routing skill restored.",
                "applying": "The last apply requires reconciliation before learning can be used.",
                "restoring": "The last restore requires reconciliation before learning can be used.",
                "accepted": "The accepted revision differs from the stored skill."
            }[status]
        display = [{**{key: value for key, value in review.items() if key not in {"priorPatches", "priorLesson", "previousReview"}},
                    "actions": actions, "applicability": review_applicability}]
        for candidate in (review, review.get("previousReview") or {}):
            if candidate.get("status") == "accepted" and candidate.get("revision") == current:
                applicability = "applicable" if candidate.get("compatibility") == COMPATIBILITY else "inapplicable"
                if applicability == "inapplicable":
                    guidance = BASE
                else:
                    guidance = {digest(PATCHED): LESSON, digest(REPAIRED): REPAIR_LESSON}.get(current, "")
                break
    if not guidance:
        applicability = "unverified"
        summary += " No learned text is included in the model context."
    else:
        revisions["skill"] = digest(SEED.replace(BASE, guidance))
    # Compute the working context from the stored skill for each new session.
    revisions["context"] = digest(f"{COMPATIBILITY}\n{guidance}\n{memory_revision}")
    return {
        "snapshot": {"summary": summary, "reviews": display},
        "context": {"guidance": guidance, "revisions": revisions, "applicability": applicability,
                    "repairLesson": guidance == REPAIR_LESSON,
                    "bytes": len(guidance.encode("utf-8"))}
    }


def main(request):
    for path in (LOCK, SKILL, PROFILE / "skills" / ".locks", skill_ledger.ledger_path(),
                 skill_ledger.blobs_dir(), PROFILE / "pending" / "skills", PROFILE / "memories"):
        owned(path)
    with skill_file_lock(LOCK):
        check_policy()
        review = read_review()
        if not SKILL.exists() and review is None:
            result = json.loads(skill_manager_tool.apply_skill_pending(
                {"action": "create", "name": NAME, "content": SEED}
            ))
            if result.get("success") is not True:
                raise ReviewError("Could not initialize the baseline routing skill.")
        content = read_skill()
        current = digest(content)
        # Read the existing Hermes memory snapshot for applicability. Incident details are not promoted
        # to general memory; the useful change is a procedure specific to routing investigations.
        memory = load_on_disk_store().format_for_system_prompt("memory") or ""
        memory_revision = digest(memory)
        reconcile(review, current)
        op = request["op"]
        changed = False
        if op == "propose" and review is None and current == digest(SEED):
            result = json.loads(skill_manager_tool.skill_manage(
                "patch", NAME, old_string=BASE, new_string=LESSON
            ))
            if not result.get("staged"):
                raise ReviewError("Hermes did not stage the review.")
            run = request["run"]
            review = {
                "id": result["pending_id"], "status": "proposed", "lesson": LESSON,
                "sourceType": "verified synthetic investigation",
                "scope": "ISAIAH synthetic routing investigations",
                "evidence": [f"run:{run}#verification", f"run:{run}#decision"],
                "compatibility": COMPATIBILITY, "expectedRevision": current,
                "revision": digest(PATCHED), "memoryRevision": memory_revision, "proposedAt": now(),
                "priorPatches": [row["id"] for row in skill_ledger.list_entries(NAME, limit=12)]
            }
            pending_patch(review)
            save(review)
            changed = True
        elif op == "propose-repair" and (not review or review.get("kind") != "repair"):
            if review and review["status"] in {"proposed", "applying", "restoring"}:
                raise ReviewError("Resolve the current learning review before staging a repair correction.")
            if current == digest(SEED):
                previous = BASE
            elif (current == digest(PATCHED) and review and review["status"] == "accepted"
                    and review["revision"] == current and review["compatibility"] == COMPATIBILITY):
                previous = LESSON
            else:
                raise ReviewError("The current skill revision cannot receive this repair correction.")
            result = json.loads(skill_manager_tool.skill_manage(
                "patch", NAME, old_string=previous, new_string=REPAIR_LESSON
            ))
            if not result.get("staged"):
                raise ReviewError("Hermes did not stage the repair review.")
            run, repair = request["run"], request["repair"]
            review = {
                "id": result["pending_id"], "status": "proposed", "kind": "repair", "lesson": REPAIR_LESSON,
                "priorLesson": previous, "previousReview": review,
                "sourceType": "verified operator repair correction",
                "scope": "ISAIAH synthetic routing investigations",
                "evidence": [f"run:{run}#verification", f"run:{run}#repair:{repair}"],
                "compatibility": COMPATIBILITY, "expectedRevision": current,
                "revision": digest(REPAIRED), "memoryRevision": memory_revision, "proposedAt": now(),
                "priorPatches": [row["id"] for row in skill_ledger.list_entries(NAME, limit=12)]
            }
            pending_patch(review)
            save(review)
            changed = True
        elif op in {"accept", "reject", "restore"}:
            if not review or request["id"] != review["id"]:
                raise ReviewError("The selected review does not exist.")
            if op in {"accept", "reject"} and review["status"] != "proposed":
                raise ReviewError("The selected review is no longer proposed.")
            if op == "accept":
                if (review["compatibility"] != COMPATIBILITY or review["expectedRevision"] != current
                        or review["memoryRevision"] != memory_revision):
                    raise ReviewError("The review's scope or expected prior revision changed.")
                payload = pending_patch(review)
                review_started = perf_counter()
                review["status"] = "applying"
                save(review)
                token = skill_ledger.set_ledger_actor("user")
                try:
                    result = json.loads(skill_manager_tool.apply_skill_pending(payload))
                finally:
                    skill_ledger.reset_ledger_actor(token)
                content = read_skill()
                reconcile(review, digest(content))
                if not result.get("success") or review["status"] != "accepted":
                    raise ReviewError("Hermes could not confirm the reviewed patch and its ledger entry.")
                review["applyMs"] = round((perf_counter() - review_started) * 1000)
                save(review)
            elif op == "reject":
                review.update(status="rejected", reviewedAt=now())
                save(review)
                write_approval.discard_pending(write_approval.SKILLS, review["id"])
            else:
                if review["status"] != "accepted" or current != review["revision"]:
                    raise ReviewError("The accepted revision must still be current to restore it.")
                if find_patch(review) != review["ledgerEntry"]:
                    raise ReviewError("The reviewed mutation is missing from the Hermes ledger.")
                review["status"] = "restoring"
                save(review)
                token = skill_ledger.set_ledger_actor("user")
                try:
                    ok, _ = skill_ledger.rollback_entry(review["ledgerEntry"])
                finally:
                    skill_ledger.reset_ledger_actor(token)
                content = read_skill()
                reconcile(review, digest(content))
                if not ok and digest(content) == review["revision"]:
                    review.update(status="accepted", lastAttempt="Restore left the accepted revision in place.")
                    save(review)
                if not ok or review["status"] != "restored":
                    raise ReviewError("Hermes could not confirm the previous revision was restored.")
            changed = True
        return {**render(review, content, memory_revision), "changed": changed}


try:
    output = main(json.load(sys.stdin))
except ReviewError as error:
    output = {"error": str(error)}
except Exception:
    output = {"error": "Hermes could not read or update the isolated learning profile."}
print(json.dumps(output, ensure_ascii=True))
