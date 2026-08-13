# Source Baseline

## External engineering source

`mattpocock/skills` is used as a reference for composable engineering skills. Implementation must pin:

```yaml
repository: https://github.com/mattpocock/skills
commit: <PIN_AT_M0_IMPLEMENTATION>
license: MIT
reviewed_paths:
  - skills/engineering/grill-with-docs/SKILL.md
  - skills/engineering/to-spec/SKILL.md
  - skills/engineering/prototype/SKILL.md
  - skills/engineering/implement/SKILL.md
  - skills/engineering/tdd/SKILL.md
  - skills/engineering/diagnosing-bugs/SKILL.md
  - skills/engineering/code-review/SKILL.md
  - skills/engineering/codebase-design/SKILL.md
  - skills/productivity/writing-for-agents/SKILL.md
  - skills/productivity/writing-for-agents/SKILL-MECHANICS.md
```

## UI source

```yaml
documentation: https://animate-ui.com/docs/components
repository: https://github.com/imskyleen/animate-ui
commit: <PIN_AT_M1>
license: MIT
integration: copy-selected-components-into-internal-package
```

## Model/runtime source

```yaml
model: Qwen/Qwen3.5-4B
model_revision: <PIN_AT_M2>
runtime: vLLM
runtime_version: <PIN_AT_M2>
deployment: WSL2 loopback server on Windows
```

No unpinned external source is allowed in a reproducible benchmark or release.
