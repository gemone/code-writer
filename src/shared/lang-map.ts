/** Maps file extensions to language identifiers. */
export const EXT_TO_LANG: Record<string, string> = {
  // TypeScript
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  // JavaScript
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  // Python
  '.py': 'python', '.pyi': 'python', '.pyw': 'python',
  // Systems
  '.rs': 'rust', '.go': 'go', '.zig': 'zig', '.zon': 'zig', '.c': 'c', '.cpp': 'cpp',
  '.h': 'c', '.hpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  // JVM
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala',
  // Scripting
  '.rb': 'ruby', '.sh': 'bash', '.bash': 'bash',
  // Swift
  '.swift': 'swift',
};
