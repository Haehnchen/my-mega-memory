export function extractProjectName(projectPath: string): string | null {
  if (!projectPath || projectPath === 'unknown' || projectPath === 'null' || projectPath === 'undefined') {
    return null;
  }

  const parts = projectPath.split(/[/\\]/).filter(p => p.length > 0);
  const lastPart = parts[parts.length - 1];

  if (!lastPart) {
    return null;
  }

  const cleaned = lastPart
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return cleaned || null;
}
