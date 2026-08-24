/**
 * Workspace talent tests over an in-memory fake of the RNFS surface.
 * The fake is built inside the jest.mock factory (hoisting rules forbid
 * referencing outer variables); tests reach its state via __workspace.
 */
jest.mock('@dr.pogodin/react-native-fs', () => {
  const ROOT = '/data/user/0/com.pocketpalai/files';
  const WORKSPACE = `${ROOT}/workspace`;
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  dirs.add(WORKSPACE);

  const parentOf = (p: string) => p.slice(0, p.lastIndexOf('/'));

  return {
    DocumentDirectoryPath: ROOT,

    exists: async (p: string) => files.has(p) || dirs.has(p),

    mkdir: async (p: string, intermediates?: boolean) => {
      if (files.has(p)) {
        throw new Error(`ENOTDIR: not a directory, ${p}`);
      }
      if (dirs.has(p)) {
        return;
      }
      if (!intermediates && !dirs.has(parentOf(p))) {
        throw new Error(`ENOENT: no such directory, ${parentOf(p)}`);
      }
      // mkdir -p: create every missing ancestor.
      let cur = '';
      for (const seg of p.split('/').filter(Boolean)) {
        cur = `${cur}/${seg}`;
        if (!files.has(cur)) {
          dirs.add(cur);
        }
      }
    },

    stat: async (p: string) => {
      const isFile = files.has(p);
      const isDir = dirs.has(p);
      if (!isFile && !isDir) {
        throw new Error(`ENOENT: no such file or directory, ${p}`);
      }
      return {
        isFile: () => isFile,
        isDirectory: () => isDir,
        size: isFile ? files.get(p)!.length : 0,
        mtime: new Date(0),
      };
    },

    readFile: async (p: string) => {
      if (!files.has(p)) {
        throw new Error(`ENOENT: no such file, ${p}`);
      }
      return files.get(p)!;
    },

    writeFile: async (p: string, content: string) => {
      if (dirs.has(p)) {
        throw new Error(`EISDIR: illegal operation on a directory, ${p}`);
      }
      if (!dirs.has(parentOf(p))) {
        throw new Error(`ENOENT: no such directory, ${parentOf(p)}`);
      }
      files.set(p, content);
    },

    appendFile: async (p: string, content: string) => {
      if (dirs.has(p)) {
        throw new Error(`EISDIR: illegal operation on a directory, ${p}`);
      }
      if (!dirs.has(parentOf(p))) {
        throw new Error(`ENOENT: no such directory, ${parentOf(p)}`);
      }
      files.set(p, (files.get(p) ?? '') + content);
    },

    readDir: async (p: string) => {
      if (!dirs.has(p)) {
        throw new Error(`ENOENT: no such directory, ${p}`);
      }
      const entries: Array<{
        name: string;
        path: string;
        size: number;
        isFile: () => boolean;
        isDirectory: () => boolean;
      }> = [];
      for (const f of files.keys()) {
        if (parentOf(f) === p) {
          entries.push({
            name: f.slice(f.lastIndexOf('/') + 1),
            path: f,
            size: files.get(f)!.length,
            isFile: () => true,
            isDirectory: () => false,
          });
        }
      }
      for (const d of dirs) {
        if (parentOf(d) === p && !entries.some(e => e.path === d)) {
          entries.push({
            name: d.slice(d.lastIndexOf('/') + 1),
            path: d,
            size: 0,
            isFile: () => false,
            isDirectory: () => true,
          });
        }
      }
      return entries;
    },

    __workspace: {
      reset() {
        files.clear();
        dirs.clear();
        dirs.add(WORKSPACE);
      },
      setFile(rel: string, content: string) {
        let dir = WORKSPACE;
        for (const seg of rel.split('/').slice(0, -1)) {
          dir = `${dir}/${seg}`;
          dirs.add(dir);
        }
        files.set(`${WORKSPACE}/${rel}`, content);
      },
    },
  };
});

import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  ListFilesEngine,
  ReadFileEngine,
  WriteFileEngine,
  GrepFilesEngine,
  deriveToolSchemas,
} from '../index';
import {resolveWorkspacePath, workspaceRoot} from '../workspaceFs';

const ws = (RNFS as any).__workspace;

describe('resolveWorkspacePath jail', () => {
  it('resolves relative paths under the workspace root', () => {
    const r = resolveWorkspacePath('notes/todo.md');
    expect(r).toEqual({
      ok: true,
      abs: `${workspaceRoot()}/notes/todo.md`,
      rel: 'notes/todo.md',
    });
  });

  it('normalizes dots, duplicate slashes, and empty input to the root', () => {
    expect(resolveWorkspacePath('./a//b/./c.txt')).toMatchObject({
      rel: 'a/b/c.txt',
    });
    expect(resolveWorkspacePath('')).toMatchObject({
      rel: '',
      abs: workspaceRoot(),
    });
    expect(resolveWorkspacePath('/')).toMatchObject({rel: ''});
  });

  it('accepts an absolute path that is the workspace root itself', () => {
    expect(resolveWorkspacePath(workspaceRoot())).toMatchObject({rel: ''});
    expect(resolveWorkspacePath(`${workspaceRoot()}/a.md`)).toMatchObject({
      rel: 'a.md',
    });
  });

  it('rejects parent escapes', () => {
    expect(resolveWorkspacePath('../secret')).toMatchObject({ok: false});
    expect(resolveWorkspacePath('a/../../secret')).toMatchObject({ok: false});
    expect(resolveWorkspacePath('..\\..\\secret')).toMatchObject({ok: false});
  });

  it('rejects absolute paths outside the workspace and other tricks', () => {
    expect(resolveWorkspacePath('/etc/passwd')).toMatchObject({ok: false});
    expect(resolveWorkspacePath('/data/user/0/other/files/x')).toMatchObject({
      ok: false,
    });
    expect(resolveWorkspacePath('C:/winnt')).toMatchObject({ok: false});
    expect(resolveWorkspacePath('a\0b')).toMatchObject({ok: false});
    expect(resolveWorkspacePath(42)).toMatchObject({ok: false});
  });
});

describe('write_file', () => {
  const engine = new WriteFileEngine();

  beforeEach(() => ws.reset());

  it('creates nested directories and reports the write', async () => {
    const r = await engine.execute({
      path: 'projects/ideas.md',
      content: 'hello\nworld',
    });
    expect(r.type).toBe('text');
    expect(r.type === 'text' && r.summary).toContain(
      'wrote 11 chars to projects/ideas.md',
    );
    const r2 = await engine.execute({
      path: 'projects/ideas.md',
      content: '!',
      append: true,
    });
    expect(r2.type === 'text' && r2.summary).toContain('appended 1 chars');
    const read = await new ReadFileEngine().execute({
      path: 'projects/ideas.md',
    });
    expect(read.type === 'text' && read.summary).toContain('hello\nworld!');
  });

  it('rejects escapes and non-string content', async () => {
    expect((await engine.execute({path: '../x', content: 'a'})).type).toBe(
      'error',
    );
    expect((await engine.execute({path: 'a.md', content: 5})).type).toBe(
      'error',
    );
    expect((await engine.execute({path: '', content: 'a'})).type).toBe('error');
    expect(
      (
        await engine.execute({
          path: 'a.md',
          content: 'x'.repeat(256 * 1024 + 1),
        })
      ).type,
    ).toBe('error');
  });
});

describe('read_file', () => {
  const engine = new ReadFileEngine();

  beforeEach(() => ws.reset());

  it('returns a line-range header with the body', async () => {
    ws.setFile('a.txt', 'one\ntwo\nthree');
    const r = await engine.execute({path: 'a.txt'});
    expect(r.type).toBe('text');
    expect(r.type === 'text' && r.summary).toContain('a.txt (lines 1-3 of 3):');
    expect(r.type === 'text' && r.summary).toContain('one\ntwo\nthree');
  });

  it('pages by offset/limit and reports remaining lines', async () => {
    ws.setFile('b.txt', ['l1', 'l2', 'l3', 'l4', 'l5'].join('\n'));
    const r = await engine.execute({path: 'b.txt', offset: 2, limit: 2});
    expect(r.type === 'text' && r.summary).toContain(
      'lines 2-3 of 5, 2 more below',
    );
    expect(r.type === 'text' && r.summary).toContain('l2\nl3');
    expect(r.type === 'text' && r.summary).not.toContain('l4');
  });

  it('errors on missing files, root reads, and binary content', async () => {
    ws.setFile('bin.dat', 'a\0b');
    expect((await engine.execute({path: 'nope.txt'})).type).toBe('error');
    expect((await engine.execute({path: ''})).type).toBe('error');
    expect((await engine.execute({path: 'bin.dat'})).type).toBe('error');
  });
});

describe('list_files', () => {
  const engine = new ListFilesEngine();

  beforeEach(() => ws.reset());

  it('lists directories first, then files, with sizes', async () => {
    ws.setFile('b.md', 'x'.repeat(2048));
    ws.setFile('z/a.txt', 'hi');
    const r = await engine.execute({});
    expect(r.type).toBe('text');
    const s = r.type === 'text' ? r.summary : '';
    expect(s).toContain('dir   z/');
    expect(s).toMatch(/file\s+2\.0 KB\s+b\.md/);
    expect(s).toMatch(/file\s+2 B\s+z\/a\.txt/);
    expect(s.indexOf('z/')).toBeLessThan(s.indexOf('b.md'));
  });

  it('reports an empty workspace helpfully', async () => {
    const r = await engine.execute({});
    expect(r.type === 'text' && r.summary).toContain('workspace is empty');
  });

  it('honors a subdirectory path and non-recursive mode', async () => {
    ws.setFile('d/inner.txt', 'x');
    ws.setFile('d/sub/deep.txt', 'y');
    const rr = await engine.execute({path: 'd', recursive: false});
    const s = rr.type === 'text' ? rr.summary : '';
    expect(s).toContain('d/inner.txt');
    expect(s).not.toContain('deep.txt');
  });

  it('rejects escapes', async () => {
    expect((await engine.execute({path: '..'})).type).toBe('error');
  });
});

describe('grep_files', () => {
  const engine = new GrepFilesEngine();

  beforeEach(() => ws.reset());

  it('returns file:line matches across files', async () => {
    ws.setFile('one.md', 'alpha\nbeta ALPHA\ngamma');
    ws.setFile('two/two.md', 'nothing\nalpha here');
    const r = await engine.execute({pattern: 'alpha'});
    expect(r.type).toBe('text');
    const s = r.type === 'text' ? r.summary : '';
    expect(s).toContain('one.md:1: alpha');
    expect(s).toContain('two/two.md:2: alpha here');
    expect(s).not.toContain('beta ALPHA');
  });

  it('supports case-insensitive matching and globs', async () => {
    ws.setFile('one.md', 'ALPHA');
    ws.setFile('one.txt', 'ALPHA');
    const ci = await engine.execute({pattern: 'alpha', case_insensitive: true});
    expect(ci.type === 'text' && ci.summary).toContain('one.md:1: ALPHA');
    const globbed = await engine.execute({pattern: 'ALPHA', glob: '*.txt'});
    const s = globbed.type === 'text' ? globbed.summary : '';
    expect(s).toContain('one.txt:1: ALPHA');
    expect(s).not.toContain('one.md');
  });

  it('falls back to literal search on invalid regex', async () => {
    ws.setFile('r.txt', 'a (bad pattern here\nnope');
    const r = await engine.execute({pattern: '(bad'});
    expect(r.type).toBe('text');
    expect(r.type === 'text' && r.summary).toContain('literal text');
    expect(r.type === 'text' && r.summary).toContain(
      'r.txt:1: a (bad pattern here',
    );
  });

  it('skips binary files and reports no matches cleanly', async () => {
    ws.setFile('b.bin', 'a\0b');
    ws.setFile('c.txt', 'nothing relevant');
    const r = await engine.execute({pattern: 'needle'});
    expect(r.type === 'text' && r.summary).toContain('no matches');
  });

  it('requires a pattern and rejects escapes', async () => {
    expect((await engine.execute({})).type).toBe('error');
    expect((await engine.execute({pattern: 'x', path: '..'})).type).toBe(
      'error',
    );
  });
});

describe('workspace talent registration', () => {
  it('is derivable via pact talent names', () => {
    const tools = deriveToolSchemas([
      'list_files',
      'read_file',
      'write_file',
      'grep_files',
    ]);
    expect(tools.map(t => t.function.name).sort()).toEqual([
      'grep_files',
      'list_files',
      'read_file',
      'write_file',
    ]);
    for (const t of tools) {
      expect(t.function.parameters.type).toBe('object');
    }
  });
});
