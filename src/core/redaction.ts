const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:sk|gho|ghp|github_pat)_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]"],
  [/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/gi, "$1[REDACTED]"],
  [/((?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]"],
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}
