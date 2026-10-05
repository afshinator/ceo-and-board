import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const HARNESS_OWNED_ROOT_ENTRIES = new Set([
  'conversation.jsonl',
  'tool-use.jsonl',
  'session.json',
  'pi-sessions',
  'snapshot',
]);

export type ArtifactSnapshot = Map<string, string>;

async function listRegularFiles(root: string, directory = root): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    const pathFromRoot = relative(root, absolutePath);
    if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || resolve(root, pathFromRoot) !== absolutePath) {
      continue;
    }
    if (directory === root && HARNESS_OWNED_ROOT_ENTRIES.has(entry.name)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...await listRegularFiles(root, absolutePath));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function copySharedFiles(sourceRoot: string, destinationRoot: string): Promise<void> {
  for (const sourcePath of await listRegularFiles(sourceRoot)) {
    const relativePath = relative(sourceRoot, sourcePath);
    const destinationPath = join(destinationRoot, relativePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

export async function prepareMemberWorkspace(runPath: string, sessionPath: string): Promise<string> {
  const workspacePath = join(sessionPath, 'workspace');
  await mkdir(workspacePath, { recursive: true });
  await copySharedFiles(runPath, workspacePath);
  return workspacePath;
}

export async function snapshotMemberWorkspace(workspacePath: string): Promise<ArtifactSnapshot> {
  const snapshot: ArtifactSnapshot = new Map();
  for (const filePath of await listRegularFiles(workspacePath)) {
    const relativePath = relative(workspacePath, filePath);
    const content = await readFile(filePath);
    snapshot.set(relativePath, createHash('sha256').update(content).digest('hex'));
  }
  return snapshot;
}

export async function promoteMemberWorkspaceChanges(
  runPath: string,
  workspacePath: string,
  before: ArtifactSnapshot,
): Promise<string[]> {
  const promoted: string[] = [];
  for (const sourcePath of await listRegularFiles(workspacePath)) {
    const relativePath = relative(workspacePath, sourcePath);
    if (!relativePath || HARNESS_OWNED_ROOT_ENTRIES.has(relativePath.split(sep)[0] ?? '')) {
      continue;
    }
    const content = await readFile(sourcePath);
    const contentHash = createHash('sha256').update(content).digest('hex');
    if (before.get(relativePath) === contentHash) {
      continue;
    }

    const destinationPath = join(runPath, relativePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    try {
      await copyFile(sourcePath, destinationPath, 1);
      promoted.push(relativePath);
    } catch (error: any) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  return promoted;
}

export async function listSharedArtifacts(runPath: string): Promise<string[]> {
  const files = await listRegularFiles(runPath);
  return files.map((filePath) => relative(runPath, filePath)).sort();
}
