#!/usr/bin/env python3
from __future__ import annotations
import json, re, sys, hashlib
from pathlib import Path
from typing import Any

try:
    import yaml
except Exception as exc:
    print(f"FATAL: PyYAML unavailable: {exc}")
    raise SystemExit(2)

try:
    import jsonschema
except Exception as exc:
    print(f"FATAL: jsonschema unavailable: {exc}")
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []
warnings: list[str] = []

# Local toolchains, generated outputs, caches, and dependency trees are not part
# of the authored design pack.  Keeping this boundary explicit prevents a real
# runtime installation from changing design-validation semantics.
IGNORED_PARTS = {
    ".git", ".runtime", ".venv", "node_modules", "dist", "target",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
}

def project_files(pattern: str = "*") -> list[Path]:
    return [
        p for p in ROOT.rglob(pattern)
        if p.is_file() and not any(part in IGNORED_PARTS or part.startswith(".venv") for part in p.relative_to(ROOT).parts)
    ]

def err(msg: str) -> None: errors.append(msg)
def warn(msg: str) -> None: warnings.append(msg)

required_files = [
    "README.md","DESK_CODE_AGENT_V2_MASTER_DESIGN.md","CONTEXT.md","AGENTS.md",
    "GITHUB_SYNC_POLICY.md","THIRD_PARTY_NOTICES.md","SOURCE_BASELINE.md",
    "skills/README.md","skills/ADAPTATION_MATRIX.md","skills/VALIDATION_FRAMEWORK.md",
    "ui/UI_UX_SYSTEM.md","ui/ANIMATE_UI_INTEGRATION.md","ui/MOTION_SYSTEM.md",
    "ui/PERFORMANCE_ACCESSIBILITY.md","prototypes/desk-code-agent-motion-prototype.html",
    "config/workflow_registry.example.yaml","config/github_policy.example.yaml",
    "checklists/M0_DESIGN_ACCEPTANCE.md",
]
for rel in required_files:
    if not (ROOT/rel).is_file(): err(f"missing required file: {rel}")

# Text and GitHub target
text_files: list[Path] = []
for p in project_files():
    if p.suffix.lower() in {".md",".yaml",".yml",".json",".py",".html",".txt"}:
        text_files.append(p)
        try:
            txt=p.read_text(encoding="utf-8")
        except Exception as exc:
            err(f"UTF-8 read failed {p.relative_to(ROOT)}: {exc}")
            continue
        if "hanklin9188/Desk-Code-Agent" in txt and "hanklin91888/Desk-Code-Agent" not in txt:
            err(f"stale GitHub owner in {p.relative_to(ROOT)}")
master=(ROOT/"DESK_CODE_AGENT_V2_MASTER_DESIGN.md")
if master.exists():
    mtxt=master.read_text(encoding="utf-8")
    if len(mtxt.splitlines()) < 1500: err("master design unexpectedly short")
    if "https://github.com/hanklin91888/Desk-Code-Agent" not in mtxt: err("master missing canonical GitHub target")
    for token in ["11 Development","28 Runtime","Animate UI","paired evaluation","M10"]:
        if token not in mtxt: err(f"master missing v2 marker: {token}")

# Skills
skill_files=sorted((ROOT/"skills").glob("*/*/SKILL.md"))
dev=[p for p in skill_files if "/development/" in p.as_posix()]
runtime=[p for p in skill_files if "/runtime/" in p.as_posix()]
if len(dev)!=11: err(f"expected 11 development skills, found {len(dev)}")
if len(runtime)!=28: err(f"expected 28 runtime skills, found {len(runtime)}")
required_headings=[
"## 1. Purpose","## 2. Boundedness contract","## 3. Trigger","## 4. Input contract",
"## 5. Output contract","## 6. Allowed tools","## 7. State transitions","## 8. Procedure",
"## 9. Completion criteria","## 10. Context and efficiency policy","## 11. Guardrails",
"## 12. Failure and recovery","## 13. Observability events","## 14. Validation suite",
"## 15. Source adaptation note","## 16. Change control"
]
ids: set[str]=set()
metadata_by_id: dict[str, dict[str, Any]]={}
for p in skill_files:
    txt=p.read_text(encoding="utf-8")
    match=re.match(r"^---\n(.*?)\n---\n",txt,re.S)
    if not match:
        err(f"frontmatter missing: {p.relative_to(ROOT)}"); continue
    try: meta=yaml.safe_load(match.group(1))
    except Exception as exc:
        err(f"frontmatter YAML invalid {p.relative_to(ROOT)}: {exc}"); continue
    required_meta={"skill_id","name","display_name","version","category","kind","invocation","owner","risk","status","max_llm_calls","max_context_tokens","schema_version"}
    missing=required_meta-set(meta or {})
    if missing: err(f"{p.relative_to(ROOT)} missing meta {sorted(missing)}")
    sid=(meta or {}).get("skill_id")
    if sid in ids: err(f"duplicate skill id {sid}")
    ids.add(sid); metadata_by_id[sid]=meta
    expected=r"D\d{2}" if "/development/" in p.as_posix() else r"R\d{2}"
    if not sid or not re.fullmatch(expected,sid): err(f"bad skill id/category {sid}: {p.relative_to(ROOT)}")
    if meta.get("max_llm_calls",0)<0 or meta.get("max_context_tokens",0)<0: err(f"negative budget {sid}")
    for h in required_headings:
        if h not in txt: err(f"{sid} missing heading {h}")
    for phrase in ["Tool/schema validity ≥ `99%`","Safety violations = `0`"]:
        if phrase not in txt: err(f"{sid} missing gate phrase {phrase}")
    if "paired evaluation" not in txt.lower():
        err(f"{sid} missing gate phrase paired evaluation")
if ids != {f"D{i:02d}" for i in range(1,12)} | {f"R{i:02d}" for i in range(1,29)}:
    err("skill ID set is not exactly D01-D11 plus R01-R28")

# skill definition schema validates frontmatter
skill_schema_path=ROOT/"schemas/skill_definition.schema.json"
if skill_schema_path.exists():
    schema=json.loads(skill_schema_path.read_text())
    for sid,meta in metadata_by_id.items():
        try: jsonschema.Draft202012Validator(schema).validate(meta)
        except Exception as exc: err(f"skill metadata schema fail {sid}: {exc}")

# JSON and JSON Schemas
schema_files=sorted((ROOT/"schemas").glob("*.schema.json"))
if len(schema_files)<20: err(f"expected >=20 schemas, found {len(schema_files)}")
for p in project_files("*.json"):
    try: obj=json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        err(f"invalid JSON {p.relative_to(ROOT)}: {exc}"); continue
    if p.name.endswith(".schema.json"):
        try: jsonschema.Draft202012Validator.check_schema(obj)
        except Exception as exc: err(f"invalid JSON Schema {p.relative_to(ROOT)}: {exc}")

# YAML
for p in project_files("*.yaml") + project_files("*.yml"):
    try: yaml.safe_load(p.read_text(encoding="utf-8"))
    except Exception as exc: err(f"invalid YAML {p.relative_to(ROOT)}: {exc}")

# Workflow registry
wf_path=ROOT/"config/workflow_registry.example.yaml"
if wf_path.exists():
    wf=yaml.safe_load(wf_path.read_text())
    for name,spec in wf.get("workflows",{}).items():
        unknown=set(spec.get("skills",[]))-ids
        if unknown: err(f"workflow {name} unknown skills {sorted(unknown)}")
    for a,bs in wf.get("hard_edges",{}).items():
        if a not in ids: err(f"hard edge unknown source {a}")
        for b in bs:
            if b not in ids: err(f"hard edge unknown target {b}")
    for a,b in wf.get("forbidden_edges",[]):
        if a not in ids or b not in ids: err(f"forbidden edge unknown {a}->{b}")

# Agents reference registered skills
for p in sorted((ROOT/"agents").glob("*.agent.md")):
    txt=p.read_text(encoding="utf-8")
    refs=set(re.findall(r"`([RD]\d{2})`",txt))
    unknown=refs-ids
    if unknown: err(f"agent {p.name} unknown skills {sorted(unknown)}")
if len(list((ROOT/"agents").glob("*.agent.md")))!=5: err("expected 5 agent specs")

# GitHub M0-M10
gh=(ROOT/"config/github_policy.example.yaml")
if gh.exists():
    data=yaml.safe_load(gh.read_text())
    target=data.get("target",{})
    if target.get("owner")!="hanklin91888" or target.get("repository")!="Desk-Code-Agent":
        err("GitHub target config incorrect")
    if set(data.get("milestones",{}))!={f"M{i}" for i in range(11)}:
        err("GitHub milestones must be M0-M10")
policy=(ROOT/"GITHUB_SYNC_POLICY.md")
if policy.exists():
    ptxt=policy.read_text()
    for i in range(11):
        if f"M{i}" not in ptxt: err(f"GitHub policy missing M{i}")
    if "does **not** create" not in ptxt and "does **not**" not in ptxt:
        warn("GitHub policy may not clearly distinguish design from remote action")

# Third party provenance
notices=(ROOT/"THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8") if (ROOT/"THIRD_PARTY_NOTICES.md").exists() else ""
for marker in ["mattpocock/skills","MIT","Animate UI"]:
    if marker not in notices: err(f"third party notices missing {marker}")
adapt=(ROOT/"skills/ADAPTATION_MATRIX.md").read_text(encoding="utf-8") if (ROOT/"skills/ADAPTATION_MATRIX.md").exists() else ""
for marker in ["principle extraction","D06","R17","R22"]:
    if marker not in adapt: err(f"adaptation matrix missing {marker}")

# UI/prototype
for rel in ["ui/event-animation-map.yaml","ui/design-tokens.example.json","ui/PROTOTYPE_PLAN.md"]:
    if not (ROOT/rel).exists(): err(f"missing UI artifact {rel}")
proto=ROOT/"prototypes/desk-code-agent-motion-prototype.html"
if proto.exists():
    ptxt=proto.read_text(encoding="utf-8")
    for marker in ["Run demo","Reduced motion","Agent Flow","Verification"]:
        if marker not in ptxt: err(f"prototype missing {marker}")
    if "http://" in ptxt or "https://" in ptxt: warn("prototype contains external URL; verify offline requirement")

# stale v1 runtime IDs allowed only in migration/changelog
v1_pattern=re.compile(r"\bS(?:0[1-9]|1[0-9]|2[0-2])\b")
for p in text_files:
    rel=p.relative_to(ROOT).as_posix()
    if rel in {"docs/20_V1_TO_V2_MIGRATION.md","DESIGN_CHANGELOG_V2.md"}: continue
    txt=p.read_text(encoding="utf-8")
    if v1_pattern.search(txt): err(f"stale v1 Skill ID in {rel}")

# Summary
print("Desk Code Agent v2 design validation")
print(f"- files: {len(project_files())}")
print(f"- skills: {len(skill_files)} (development={len(dev)}, runtime={len(runtime)})")
print(f"- schemas: {len(schema_files)}")
print(f"- agents: {len(list((ROOT/'agents').glob('*.agent.md')))}")
print(f"- warnings: {len(warnings)}")
for w in warnings: print(f"WARNING: {w}")
if errors:
    print(f"- errors: {len(errors)}")
    for e in errors: print(f"ERROR: {e}")
    raise SystemExit(1)
print("- errors: 0")
print("DESIGN PACK VALIDATION: PASS")
