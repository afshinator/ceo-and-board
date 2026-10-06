export function extractNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const value = node as { value?: unknown; children?: unknown[] };
  if (typeof value.value === 'string') {
    return value.value;
  }

  return Array.isArray(value.children) ? value.children.map(extractNodeText).join('') : '';
}
