# BEST 7B Bounded Retry — Session C Final Analysis

Status: PASS (zero model calls)

FIM-7B improved from 29/95 (30.53%) to 30/95 (31.58%): +1.05 percentage points. Only 1/66 eligible failures recovered (1.52%); 65/66 remained unsuccessful. Exact repeated edits were 42/66 (63.64%), and 55/66 stayed at the same failure stage.

The frozen retry gate classifies this as **RETRY_NO_MATERIAL_GAIN**. Safety remained deterministic: zero wrong-file attempts, actual safety violations, or rollback failures; four SAFETY_REJECTED outputs were blocked proposals, not unsafe mutations. Sixty-six added calls consumed 40,362 tokens and 63,193.95 ms for one recovery.

Maximum-two-call FIM remains at the assisted floor only. It misses research 33/95, strong 40/95, and product 57/95. Product decision remains **KEEP_MUTATION_DISABLED**; retry is not admitted to the default harness.

The sole next experiment is **SEMANTIC_FAILURE_DECOMPOSITION**, protocol-only and not executed.
