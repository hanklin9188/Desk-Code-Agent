import {
  sanitizeUntrustedContent,
  type SanitizedContent
} from "../../tool-runtime/src/index";

const elevatedPolicyPattern = /bypass\s+(?:tests?|verification|approval)|\bsudo\b/i;

/**
 * Post-freeze security policy extension. The frozen V2/V3 tool runtime remains
 * byte-identical; new repository-content consumers use this stricter boundary.
 */
export function sanitizeRepositoryContent(content: string): SanitizedContent {
  const sanitized = sanitizeUntrustedContent(content);
  if (!elevatedPolicyPattern.test(content) || sanitized.flags.includes("policy_override_attempt")) return sanitized;
  return { ...sanitized, flags: [...sanitized.flags, "policy_override_attempt"] };
}
