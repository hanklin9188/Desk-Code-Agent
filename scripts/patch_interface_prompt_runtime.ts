export const PATCH_INTERFACE_PROMPT_PLACEHOLDER_COUNTS = Object.freeze({
  behavioral_requirement: 1,
  exact_relevant_file: 2,
  exact_relevant_symbol: 1,
  start_line: 1,
  end_line: 1,
  root_cause: 1,
  source: 1,
  visible_test_path: 1,
  visible_test: 1,
  visible_preflight_status: 1,
  hidden_preflight_status: 1
} as const);

export type PatchInterfacePromptReplacements = Record<keyof typeof PATCH_INTERFACE_PROMPT_PLACEHOLDER_COUNTS, string>;

const placeholderNames = Object.keys(PATCH_INTERFACE_PROMPT_PLACEHOLDER_COUNTS) as Array<keyof PatchInterfacePromptReplacements>;
const expectedTemplateTokens = placeholderNames
  .flatMap((name) => Array.from({ length: PATCH_INTERFACE_PROMPT_PLACEHOLDER_COUNTS[name] }, () => `{${name}}`))
  .sort();

function assertExactTemplateContract(template: string, taskId: string): void {
  const templateTokens = template.match(/\{[^{}\r\n]*\}/g) ?? [];
  const textOutsideTokens = template.replace(/\{[^{}\r\n]*\}/g, "");
  if (/[{}]/.test(textOutsideTokens)) throw new Error(`Prompt template has malformed brace syntax for ${taskId}`);

  for (const token of templateTokens) {
    const match = /^\{([a-z0-9_]+)\}$/.exec(token);
    if (!match || !Object.hasOwn(PATCH_INTERFACE_PROMPT_PLACEHOLDER_COUNTS, match[1])) {
      throw new Error(`Prompt template has an unapproved placeholder for ${taskId}: ${token}`);
    }
  }
  const sortedTokens = [...templateTokens].sort();
  if (sortedTokens.length !== expectedTemplateTokens.length || sortedTokens.some((token, index) => token !== expectedTemplateTokens[index])) {
    throw new Error(`Prompt template placeholder counts differ for ${taskId}`);
  }
}

function assertExactReplacementContract(replacements: PatchInterfacePromptReplacements, taskId: string): void {
  const actualNames = Object.keys(replacements).sort();
  const expectedNames = [...placeholderNames].sort();
  if (actualNames.length !== expectedNames.length || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error(`Prompt replacements have missing or extra fields for ${taskId}`);
  }
  for (const name of placeholderNames) {
    if (typeof replacements[name] !== "string") throw new Error(`Prompt replacement is not a string for ${taskId}: ${name}`);
  }
}

export function renderPatchInterfacePrompt(
  template: string,
  replacements: PatchInterfacePromptReplacements,
  options: { taskId: string; blockedExactValues: string[] }
): string {
  assertExactTemplateContract(template, options.taskId);
  assertExactReplacementContract(replacements, options.taskId);
  const prompt = template.replace(/\{([a-z0-9_]+)\}/g, (_token, name: string) => replacements[name as keyof PatchInterfacePromptReplacements]);
  for (const blocked of options.blockedExactValues) if (blocked && prompt.includes(blocked)) throw new Error(`Model prompt leaks hidden oracle or reference source for ${options.taskId}`);
  return prompt;
}
