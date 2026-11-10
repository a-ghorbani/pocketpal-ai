import * as fs from 'fs';
import * as path from 'path';

const OPENCL_DIR = path.join(
  __dirname,
  '..',
  '..',
  'node_modules',
  'llama.rn',
  'vendor',
  'llama.cpp',
  'ggml',
  'src',
  'ggml-opencl',
);
const INTEGER_DOT_GATE = 'backend_ctx->has_integer_dot';
const INTEGER_DOT_BUILTIN = /\bdot(?:_acc_sat)?_4x8packed_\w+\s*\(/;
const FUNCTION_HEAD =
  /^(?!(?:if|for|while|switch|else)\b)[\w:<>*&\s]+\b\w+\s*\([^()]*\)\s*(?:const\s*)?$/;

function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (src[i] === '"' || src[i] === "'") {
      const quote = src[i];
      out += quote;
      i++;
      while (i < src.length && src[i] !== quote && src[i] !== '\n') {
        out += src[i] === '\\' ? '  ' : ' ';
        i += src[i] === '\\' ? 2 : 1;
      }
      if (i < src.length) {
        out += src[i];
        i++;
      }
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

function topLevelSplit(expr: string, op: '&&' | '||'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') {
      depth++;
    } else if (expr[i] === ')') {
      depth--;
    } else if (depth === 0 && expr.startsWith(op, i)) {
      parts.push(expr.slice(start, i).trim());
      start = i + op.length;
      i++;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
}

function unwrap(expr: string): string {
  let e = expr.trim();
  while (e.startsWith('(') && e.endsWith(')')) {
    let depth = 0;
    let wrapsAll = true;
    for (let i = 0; i < e.length - 1; i++) {
      depth += e[i] === '(' ? 1 : e[i] === ')' ? -1 : 0;
      if (depth === 0) {
        wrapsAll = false;
        break;
      }
    }
    if (!wrapsAll) {
      break;
    }
    e = e.slice(1, -1).trim();
  }
  return e;
}

/**
 * Whether the program source calls an integer-dot builtin outside an
 * `#if`/`#ifdef` on `cl_khr_integer_dot_product` (or a macro defined only
 * under it, like flash-attention's FA_HAVE_INT_DOT).
 */
function usesIntegerDotUnguarded(clSource: string): boolean {
  const guardMacros = new Set(['cl_khr_integer_dot_product']);
  const frames: boolean[] = [];
  const requiresGuard = (expr: string) => {
    const e = unwrap(expr);
    if (topLevelSplit(e, '||').length > 1) {
      return false;
    }
    return topLevelSplit(e, '&&').some(part => {
      const m = unwrap(part).match(
        /^(?:defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)|(\w+))$/,
      );
      return !!m && guardMacros.has(m[1] ?? m[2] ?? m[3]);
    });
  };
  for (const raw of stripComments(clSource).split('\n')) {
    const line = raw.trim();
    const directive = line.match(/^#\s*(\w+)\s*(.*)$/);
    if (directive) {
      const [, name, rest] = directive;
      if (name === 'ifdef') {
        frames.push(guardMacros.has(rest.trim()));
        continue;
      }
      if (name === 'ifndef') {
        frames.push(false);
        continue;
      }
      if (name === 'if') {
        frames.push(requiresGuard(rest));
        continue;
      }
      if (name === 'elif' || name === 'else') {
        frames[frames.length - 1] = false;
        continue;
      }
      if (name === 'endif') {
        frames.pop();
        continue;
      }
      if (name === 'define' && frames.some(Boolean)) {
        guardMacros.add(rest.trim().split(/[\s(]/)[0]);
      }
    }
    if (INTEGER_DOT_BUILTIN.test(line) && !frames.some(Boolean)) {
      return true;
    }
  }
  return false;
}

interface Opener {
  head: string;
  bodyStart: number;
}

function openersAt(code: string, offset: number): Opener[] {
  const stack: Opener[] = [];
  let headStart = 0;
  for (let i = 0; i < offset; i++) {
    const c = code[i];
    if (c === '{') {
      stack.push({
        head: code.slice(headStart, i).replace(/\s+/g, ' ').trim(),
        bodyStart: i + 1,
      });
      headStart = i + 1;
    } else if (c === '}') {
      stack.pop();
      headStart = i + 1;
    } else if (c === ';') {
      headStart = i + 1;
    }
  }
  return stack;
}

function bodyOf(code: string, bodyStart: number): string {
  let depth = 1;
  for (let i = bodyStart; i < code.length; i++) {
    depth += code[i] === '{' ? 1 : code[i] === '}' ? -1 : 0;
    if (depth === 0) {
      return code.slice(bodyStart, i);
    }
  }
  return code.slice(bodyStart);
}

function isGateCondition(cond: string): boolean {
  const e = unwrap(cond);
  return (
    topLevelSplit(e, '||').length === 1 &&
    topLevelSplit(e, '&&').some(part => unwrap(part) === INTEGER_DOT_GATE)
  );
}

function predicateRequiresGate(code: string, name: string): boolean {
  const def = new RegExp(`\\bstatic\\s+bool\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = def.exec(code);
  if (!m) {
    return false;
  }
  const body = bodyOf(code, m.index + m[0].length);
  const refusal = new RegExp(
    `if\\s*\\(\\s*!\\s*${INTEGER_DOT_GATE.replace(/[->]/g, '\\$&')}\\s*\\)\\s*\\{?\\s*return\\s+false\\s*;`,
  );
  const refused = body.search(refusal);
  const firstTrue = body.search(/return\s+true\s*;/);
  return refused !== -1 && (firstTrue === -1 || refused < firstTrue);
}

function returnsUnlessIntegerDot(code: string, fn: Opener): boolean {
  const body = bodyOf(code, fn.bodyStart);
  const first = body.match(/^\s*if\s*\(([\s\S]*?)\)\s*\{?\s*return\s*;/);
  if (!first) {
    return false;
  }
  return topLevelSplit(unwrap(first[1]), '||').some(part => {
    const p = unwrap(part);
    if (p === `!${INTEGER_DOT_GATE}` || p === `! ${INTEGER_DOT_GATE}`) {
      return true;
    }
    const call = p.match(/^!\s*(\w+)\s*\(\s*backend_ctx\s*\)$/);
    return !!call && predicateRequiresGate(code, call[1]);
  });
}

/**
 * Programs whose load site in ggml-opencl.cpp can run on a device without
 * cl_khr_integer_dot_product. A failed build there is fatal (`exit(1)`).
 */
function ungatedIntegerDotLoads(
  cppSource: string,
  programs: string[],
): string[] {
  const code = stripComments(cppSource);
  return programs.filter(program => {
    const sites = [
      ...cppSource.matchAll(
        new RegExp(`#include\\s+"${program.replace('.', '\\.')}\\.h"`, 'g'),
      ),
    ].map(match => match.index ?? 0);
    return sites.some(site => {
      const openers = openersAt(code, site);
      const gatedBlock = openers.some(o => {
        const m = o.head.match(/^(?:else\s+)?if\s*\(([\s\S]*)\)$/);
        return !!m && isGateCondition(m[1]);
      });
      const fn = openers.find(o => FUNCTION_HEAD.test(o.head));
      return !gatedBlock && !(fn && returnsUnlessIntegerDot(code, fn));
    });
  });
}

function loadSiteCount(cppSource: string, program: string): number {
  return cppSource.split(`#include "${program}.h"`).length - 1;
}

const kernelsDir = path.join(OPENCL_DIR, 'kernels');
const installedPrograms = fs
  .readdirSync(kernelsDir)
  .filter(name => name.endsWith('.cl'))
  .filter(name =>
    usesIntegerDotUnguarded(
      fs.readFileSync(path.join(kernelsDir, name), 'utf-8'),
    ),
  )
  .sort();
const installedCpp = fs.readFileSync(
  path.join(OPENCL_DIR, 'ggml-opencl.cpp'),
  'utf-8',
);

describe('the parse itself', () => {
  it('finds integer-dot programs in the installed llama.rn', () => {
    expect(installedPrograms).toContain('gemm_noshuffle_q2_k_q8_1_dp4a.cl');
  });

  it('finds a load site for every integer-dot program', () => {
    expect(
      installedPrograms.filter(p => loadSiteCount(installedCpp, p) === 0),
    ).toEqual([]);
  });

  it('balances the braces of ggml-opencl.cpp', () => {
    const code = stripComments(installedCpp);
    expect(openersAt(code, code.length)).toEqual([]);
  });

  it('treats an #ifdef-guarded builtin call as guarded', () => {
    expect(installedPrograms).not.toContain('flash_attn_f32_q4_0.cl');
    expect(installedPrograms).not.toContain('flash_attn_f32_q8_0.cl');
  });
});

describe('installed llama.rn ggml-opencl', () => {
  it('loads every integer-dot program only when the device has integer dot', () => {
    expect(ungatedIntegerDotLoads(installedCpp, installedPrograms)).toEqual([]);
  });
});

const DOT_CALL = 'r = dot_acc_sat_4x8packed_ss_int(a, b, r);';

describe('usesIntegerDotUnguarded', () => {
  it.each([
    ['a bare call', DOT_CALL],
    [
      'a call after a pragma-only #ifdef',
      `#ifdef cl_khr_integer_dot_product\n#pragma OPENCL EXTENSION cl_khr_integer_dot_product : enable\n#endif\n${DOT_CALL}`,
    ],
    [
      'a call in the #else branch',
      `#ifdef cl_khr_integer_dot_product\nr = 0;\n#else\n${DOT_CALL}\n#endif`,
    ],
    [
      'a call under an #if with ||',
      `#if defined(cl_khr_integer_dot_product) || defined(FOO)\n${DOT_CALL}\n#endif`,
    ],
    [
      'a call under #ifndef',
      `#ifndef cl_khr_integer_dot_product\n${DOT_CALL}\n#endif`,
    ],
    ['the unsigned builtin', 'r = dot_acc_sat_4x8packed_uu_uint(a, b, r);'],
  ])('flags %s', (_name, src) => {
    expect(usesIntegerDotUnguarded(src)).toBe(true);
  });

  it.each([
    ['no builtin', 'r = a * b;'],
    ['a builtin named only in a comment', `// ${DOT_CALL}\n/* ${DOT_CALL} */`],
    [
      'a call under #ifdef',
      `#ifdef cl_khr_integer_dot_product\n${DOT_CALL}\n#endif`,
    ],
    [
      'a call under #if defined(...) && ...',
      `#if defined(cl_khr_integer_dot_product) && defined(FOO)\n${DOT_CALL}\n#endif`,
    ],
    [
      'a call under a macro defined only with integer dot',
      `#ifdef cl_khr_integer_dot_product\n#define HAVE_DOT 1\n#endif\n#ifdef HAVE_DOT\n${DOT_CALL}\n#else\nr = 0;\n#endif`,
    ],
  ])('passes %s', (_name, src) => {
    expect(usesIntegerDotUnguarded(src)).toBe(false);
  });
});

const load = (program: string, opener: string) => `
static void load_cl_kernels(ggml_backend_opencl_context *backend_ctx) {
    // ${program}
    ${opener}
#ifdef GGML_OPENCL_EMBED_KERNELS
        const std::string kernel_src {
            #include "${program}.h"
        };
#else
        const std::string kernel_src = read_file("${program}");
#endif
        GGML_LOG_CONT(".");
    }
}
`;

describe('ungatedIntegerDotLoads', () => {
  const P = 'gemm_x_dp4a.cl';

  it.each([
    ['a bare block', load(P, '{')],
    [
      'a block gated on something else',
      load(P, 'if (backend_ctx->has_subgroup_shuffle) {'),
    ],
    [
      'a block gated with ||',
      load(P, 'if (backend_ctx->has_integer_dot || force) {'),
    ],
    [
      'a block gated with && then ||',
      load(P, 'if (backend_ctx->has_integer_dot && fast || force) {'),
    ],
    [
      'a block gated on the negation',
      load(P, 'if (!backend_ctx->has_integer_dot) {'),
    ],
    [
      'a function whose early return does not require integer dot',
      `static void load_x(ggml_backend_opencl_context * backend_ctx) {
    if (backend_ctx->gpu_family != GPU_FAMILY::ADRENO) {
        return;
    }
    {
        const std::string kernel_src {
            #include "${P}.h"
        };
    }
}`,
    ],
    [
      'a predicate that can say yes before checking integer dot',
      `static bool x_enabled(const ggml_backend_opencl_context * backend_ctx) {
    if (getenv("X")) {
        return true;
    }
    if (!backend_ctx->has_integer_dot) {
        return false;
    }
    return true;
}
static void load_x(ggml_backend_opencl_context * backend_ctx) {
    if (!x_enabled(backend_ctx)) {
        return;
    }
    {
        const std::string kernel_src {
            #include "${P}.h"
        };
    }
}`,
    ],
  ])('flags %s', (_name, cpp) => {
    expect(ungatedIntegerDotLoads(cpp, [P])).toEqual([P]);
  });

  it.each([
    [
      'a block gated on has_integer_dot',
      load(P, 'if (backend_ctx->has_integer_dot) {'),
    ],
    [
      'a gated block after a long line comment',
      `// ${'x'.repeat(400)}\n${load(P, 'if (backend_ctx->has_integer_dot) {')}`,
    ],
    [
      'a block gated on has_integer_dot && more',
      load(
        P,
        'if (backend_ctx->has_integer_dot && backend_ctx->gpu_family == GPU_FAMILY::ADRENO) {',
      ),
    ],
    [
      'a bare block nested in a gated block',
      load(P, 'if (backend_ctx->has_integer_dot) {\n    {').replace(
        /\n}\n$/,
        '\n}\n}\n',
      ),
    ],
    [
      'a function that returns early through a predicate requiring integer dot',
      `static bool x_enabled(const ggml_backend_opencl_context * backend_ctx) {
    static const char * const env = getenv("X");
    if (env && *env && atoi(env) == 0) {
        return false;
    }
    if (!backend_ctx->has_integer_dot) {
        return false;
    }
    return true;
}
static void load_x(ggml_backend_opencl_context * backend_ctx) {
    if (backend_ctx->gpu_family != GPU_FAMILY::ADRENO || !x_enabled(backend_ctx)) {
        return;
    }
    {
        const std::string kernel_src {
            #include "${P}.h"
        };
    }
}`,
    ],
  ])('passes %s', (_name, cpp) => {
    expect(ungatedIntegerDotLoads(cpp, [P])).toEqual([]);
  });

  it('names only the ungated program among gated siblings', () => {
    const cpp =
      load('a_dp4a.cl', 'if (backend_ctx->has_integer_dot) {') +
      load('b_dp4a.cl', '{');
    expect(ungatedIntegerDotLoads(cpp, ['a_dp4a.cl', 'b_dp4a.cl'])).toEqual([
      'b_dp4a.cl',
    ]);
  });
});
