import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { unified } from 'unified';
import remarkParse from 'remark-parse';

export interface BriefSectionConfig {
  section: string;
  description?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface BriefDescriptor {
  name: string;
  path: string;
  supportingFiles: string[];
}

function extractHeadingText(node: any): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value ?? '';
  }

  if (Array.isArray(node.children)) {
    return node.children.map(extractHeadingText).join('');
  }

  return '';
}

function getMarkdownHeadings(markdown: string): string[] {
  const tree = unified().use(remarkParse).parse(markdown) as any;
  const headings: string[] = [];

  const walk = (node: any) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.type === 'heading') {
      const text = extractHeadingText(node).trim();
      if (text) {
        headings.push(text);
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  walk(tree);
  return headings;
}

export function validateBrief(
  markdown: string,
  requiredSections: BriefSectionConfig[],
): ValidationResult {
  const errors: string[] = [];
  const headings = getMarkdownHeadings(markdown);

  for (const section of requiredSections) {
    const headingNames = headings.map((heading) => heading.trim());
    const exists = headingNames.some(
      (heading) => heading.toLowerCase() === section.section.toLowerCase(),
    );

    if (!exists) {
      errors.push(`Missing required section: ${section.section}`);
    }
  }

  if (!markdown.trim()) {
    errors.push('Brief content is empty.');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export async function discoverBriefs(briefsDir: string): Promise<BriefDescriptor[]> {
  const entries = await readdir(briefsDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  const descriptors: BriefDescriptor[] = [];

  for (const dirent of directories) {
    const briefPath = join(briefsDir, dirent.name, 'brief.md');
    try {
      await readFile(briefPath, 'utf8');
    } catch {
      continue;
    }

    const supportFiles = await readdir(join(briefsDir, dirent.name));
    const supportingFiles = supportFiles.filter((file) => file !== 'brief.md');

    descriptors.push({
      name: dirent.name,
      path: briefPath,
      supportingFiles: supportingFiles,
    });
  }

  return descriptors;
}
