const {execFileSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GENERATOR_PATH = path.join(__dirname, '..', 'generate-app-icons.js');
const {
  APPICONSET,
  ANDROID_RES,
  SOURCE_DIR,
  SOURCE_FILES,
  generate,
  opaqueRgbPng,
  parseSvg,
  toVectorDrawable,
  buildTextOutputs,
} = require(GENERATOR_PATH);

const canvas = body =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-28 -28 168 168">${body}</svg>`;

const SQUARE = '<path id="square" d="M0 0H9V9Z" fill="#000000"/>';

const vd = body => toVectorDrawable(parseSvg(canvas(body)));

describe('parseSvg', () => {
  it.each([
    ['<rect width="1" height="1"/>', '<rect>'],
    [
      '<path d="M0 0H9" fill="none" stroke="#000000" stroke-width="1" stroke-dasharray="2"/>',
      'stroke-dasharray',
    ],
    [
      '<defs><linearGradient id="a"/></defs><path d="M0 0H9V9Z" fill="#000000"/>',
      '<linearGradient>',
    ],
    ['<use href="#a"/>', '<use>'],
    ['<g opacity="0.5">' + SQUARE + '</g>', 'opacity'],
    ['<path d="M0 0H9V9Z" fill="url(#g)"/>', 'fill="url(#g)"'],
    ['<path d="M0 0H9V9Z"/>', 'explicit fill'],
  ])('rejects %s naming %s', (body, name) => {
    expect(() => parseSvg(canvas(body))).toThrow(name);
  });

  it('rejects a viewBox other than the canvas', () => {
    expect(() =>
      parseSvg(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112">${SQUARE}</svg>`,
      ),
    ).toThrow('viewBox');
  });

  it('rejects stray text and unclosed elements', () => {
    expect(() => parseSvg(canvas(`hello${SQUARE}`))).toThrow('hello');
    expect(() => parseSvg(canvas(`<g>${SQUARE}`))).toThrow();
  });
});

describe('toVectorDrawable', () => {
  it('maps the canvas onto a 108dp viewport shifted by the bleed', () => {
    const xml = vd(SQUARE);
    expect(xml).toContain('android:width="108dp"');
    expect(xml).toContain('android:viewportWidth="168"');
    expect(xml).toMatch(
      /<group\n\s+android:translateX="28"\n\s+android:translateY="28">/,
    );
  });

  it('maps path attributes by name and passes path data through', () => {
    const xml = vd(
      '<path id="p" d="M1 2C3 4 5 6 7 8Z" fill="#abcdef" fill-opacity="0.4" fill-rule="evenodd"/>' +
        '<path id="s" d="M0 0L9 9" fill="none" stroke="#343434" stroke-width="5.7931" stroke-linecap="round"/>',
    );
    expect(xml).toContain('android:name="p"');
    expect(xml).toContain('android:fillColor="#ABCDEF"');
    expect(xml).toContain('android:fillAlpha="0.4"');
    expect(xml).toContain('android:fillType="evenOdd"');
    expect(xml).toContain('android:pathData="M1 2C3 4 5 6 7 8Z"');
    expect(xml).toContain('android:strokeColor="#343434"');
    expect(xml).toContain('android:strokeWidth="5.7931"');
    expect(xml).toContain('android:strokeLineCap="round"');
    expect(xml.match(/fillColor/g)).toHaveLength(1);
  });

  it.each([
    [
      'rotate(-30 10 20)',
      ['android:rotation="-30"', 'android:pivotX="10"', 'android:pivotY="20"'],
    ],
    [
      'translate(1.5 -2)',
      ['android:translateX="1.5"', 'android:translateY="-2"'],
    ],
    ['scale(2)', ['android:scaleX="2"', 'android:scaleY="2"']],
  ])('maps transform %s onto one group', (transform, expected) => {
    const xml = vd(`<g id="t" transform="${transform}">${SQUARE}</g>`);
    const group = xml.slice(xml.indexOf('android:name="t"'));
    for (const attribute of expected) {
      expect(group).toContain(attribute);
    }
  });

  it.each([
    'translate(1 2) rotate(3)',
    'matrix(1 0 0 1 0 0)',
    'rotate(3)',
    'translate(1.2.3 4)',
    'scale(.)',
  ])('rejects transform %s naming it', transform => {
    expect(() =>
      parseSvg(canvas(`<g transform="${transform}">${SQUARE}</g>`)),
    ).toThrow(transform);
  });

  it('emits a referenced clipPath as the first child of its group', () => {
    const xml = vd(
      '<defs><clipPath id="c"><path d="M0 0H9V9Z"/></clipPath></defs>' +
        `<g id="clipped" clip-path="url(#c)">${SQUARE}</g>`,
    );
    expect(xml).toMatch(
      /android:name="clipped">\n\s+<clip-path\n\s+android:pathData="M0 0H9V9Z" \/>\n\s+<path/,
    );
  });

  it.each([
    [
      'an unreferenced clipPath',
      '<defs><clipPath id="c"><path d="M0 0H9V9Z"/></clipPath></defs>' + SQUARE,
      'never referenced',
    ],
    [
      'an inline clipPath',
      '<clipPath id="c"><path d="M0 0H9V9Z"/></clipPath>' +
        `<g clip-path="url(#c)">${SQUARE}</g>`,
      'must sit in <defs>',
    ],
    [
      'an unknown reference',
      `<g clip-path="url(#missing)">${SQUARE}</g>`,
      '#missing',
    ],
    [
      'a clip-path on a path',
      '<defs><clipPath id="c"><path d="M0 0H9V9Z"/></clipPath></defs>' +
        '<path d="M0 0H9V9Z" fill="#000000" clip-path="url(#c)"/>',
      'clip-path on <path>',
    ],
    [
      'a multi-child clipPath',
      '<defs><clipPath id="c"><path d="M0 0H9V9Z"/><path d="M0 0H1V1Z"/></clipPath></defs>' +
        `<g clip-path="url(#c)">${SQUARE}</g>`,
      'exactly one <path>',
    ],
  ])('rejects %s', (_, body, message) => {
    expect(() => parseSvg(canvas(body))).toThrow(message);
  });
});

describe('buildTextOutputs', () => {
  const sources = {
    foregroundLight: canvas(SQUARE),
    monochrome: canvas(
      '<path id="m" d="M0 0H9V9Z" fill="#FFFFFF" fill-rule="evenodd"/>',
    ),
  };

  it('writes the adaptive icon for both launcher names', () => {
    const outputs = buildTextOutputs(sources);
    const adaptive =
      outputs['android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'];
    expect(adaptive).toContain('@color/ic_launcher_background');
    expect(adaptive).toContain('@drawable/ic_launcher_foreground');
    expect(adaptive).toContain('@drawable/ic_launcher_monochrome');
    expect(
      outputs[
        'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'
      ],
    ).toBe(adaptive);
    expect(
      outputs['android/app/src/main/res/values/ic_launcher_background.xml'],
    ).toContain('<color name="ic_launcher_background">#FFFFFF</color>');
  });

  it('writes Contents.json in Xcode single-size form', () => {
    const contents =
      buildTextOutputs(sources)[
        'ios/PocketPal/Images.xcassets/AppIcon.appiconset/Contents.json'
      ];
    expect(contents.endsWith('}\n')).toBe(true);
    expect(contents).toContain('"filename" : "AppIcon.png"');
    expect(contents).not.toMatch(/":/);
    const {images, info} = JSON.parse(contents);
    expect(info).toEqual({author: 'xcode', version: 1});
    expect(images.map(image => image.filename)).toEqual([
      'AppIcon.png',
      'AppIcon-dark.png',
      'AppIcon-tinted.png',
    ]);
    expect(images.map(image => image.appearances?.[0].value)).toEqual([
      undefined,
      'dark',
      'tinted',
    ]);
    for (const image of images) {
      expect(image).toMatchObject({
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      });
      expect(Object.keys(image)).toEqual([...Object.keys(image)].sort());
    }
  });
});

function pngHeader(buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

describe('generate', () => {
  let root;

  const writeSources = overrides => {
    const files = {
      foregroundLight: canvas(SQUARE),
      foregroundDark: canvas(SQUARE),
      monochrome: canvas(
        '<path id="m" d="M0 0H9V9Z" fill="#FFFFFF" fill-rule="evenodd"/>',
      ),
      ...overrides,
    };
    for (const [key, text] of Object.entries(files)) {
      const target = path.join(root, SOURCE_DIR, SOURCE_FILES[key]);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, text);
    }
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-'));
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('writes nothing when a source carries an unsupported element', () => {
    writeSources({monochrome: canvas('<rect width="1" height="1"/>')});
    expect(() => generate({root})).toThrow('<rect>');
    expect(fs.existsSync(path.join(root, 'android'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'ios'))).toBe(false);
  });

  it('exits non-zero from the command line, naming the element', () => {
    writeSources({foregroundLight: canvas('<rect width="1" height="1"/>')});
    const script = path.join(root, 'scripts', 'generate-app-icons.js');
    fs.copyFileSync(GENERATOR_PATH, script);
    let failure;
    try {
      execFileSync('node', [script], {stdio: 'pipe'});
    } catch (error) {
      failure = error;
    }
    expect(failure.status).not.toBe(0);
    expect(failure.stderr.toString()).toContain('<rect>');
  });

  it.each(['previews', '..previews'])(
    'refuses the preview directory %s inside the repo',
    name => {
      writeSources();
      expect(() => generate({root, previewDir: path.join(root, name)})).toThrow(
        'outside the repo',
      );
    },
  );

  it('writes opaque iOS icons, exact legacy sizes and drops stale icons', () => {
    writeSources();
    const stale = path.join(root, APPICONSET, 'iPhone_App_60_2x.png');
    fs.mkdirSync(path.dirname(stale), {recursive: true});
    fs.writeFileSync(stale, 'stale');

    generate({root});

    expect(fs.readdirSync(path.join(root, APPICONSET)).sort()).toEqual([
      'AppIcon-dark.png',
      'AppIcon-tinted.png',
      'AppIcon.png',
      'Contents.json',
    ]);
    for (const name of [
      'AppIcon.png',
      'AppIcon-dark.png',
      'AppIcon-tinted.png',
    ]) {
      expect(
        pngHeader(fs.readFileSync(path.join(root, APPICONSET, name))),
      ).toEqual({width: 1024, height: 1024, colorType: 2});
    }
    const sizes = {mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192};
    for (const [density, size] of Object.entries(sizes)) {
      for (const name of ['ic_launcher', 'ic_launcher_round']) {
        const file = path.join(
          root,
          ANDROID_RES,
          `mipmap-${density}`,
          `${name}.png`,
        );
        expect(pngHeader(fs.readFileSync(file))).toMatchObject({
          width: size,
          height: size,
        });
      }
    }
  });
});

describe('opaqueRgbPng', () => {
  it('refuses a transparent pixel', () => {
    expect(() =>
      opaqueRgbPng(
        {width: 1, height: 1, pixels: Buffer.from([0, 0, 0, 0])},
        'x.png',
      ),
    ).toThrow('non-opaque pixel');
  });
});

describe('buildTextOutputs without the rasterizer', () => {
  afterEach(() => {
    jest.dontMock('@resvg/resvg-js');
  });

  it('never loads @resvg/resvg-js', () => {
    jest.doMock('@resvg/resvg-js', () => {
      throw new Error('resvg loaded');
    });
    jest.isolateModules(() => {
      const isolated = require(GENERATOR_PATH);
      expect(() =>
        isolated.buildTextOutputs({
          foregroundLight: canvas(SQUARE),
          monochrome: canvas(SQUARE),
        }),
      ).not.toThrow();
    });
  });
});

const SAFE_CENTER = 56;
const SAFE_RADIUS = 51.33;
const ARGUMENT_COUNTS = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

function pathExtremes(d) {
  const tokens = d.match(/[MLHVCSQTAZ]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi);
  const extremes = [];
  let current = [0, 0];
  let start = [0, 0];
  let lastControl = null;
  let command = null;
  let i = 0;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) {
      command = tokens[i++];
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const args = tokens.slice(i, i + ARGUMENT_COUNTS[upper]).map(Number);
    i += ARGUMENT_COUNTS[upper];
    const point = (x, y) =>
      relative ? [current[0] + x, current[1] + y] : [x, y];
    const reflected = lastControl
      ? [2 * current[0] - lastControl[0], 2 * current[1] - lastControl[1]]
      : current;
    let end;
    let controls = [];
    let radius = 0;
    switch (upper) {
      case 'M':
      case 'L':
      case 'T':
        end = point(args[0], args[1]);
        controls = upper === 'T' ? [reflected] : [];
        break;
      case 'H':
        end = [relative ? current[0] + args[0] : args[0], current[1]];
        break;
      case 'V':
        end = [current[0], relative ? current[1] + args[0] : args[0]];
        break;
      case 'C':
        controls = [point(args[0], args[1]), point(args[2], args[3])];
        end = point(args[4], args[5]);
        break;
      case 'S':
        controls = [reflected, point(args[0], args[1])];
        end = point(args[2], args[3]);
        break;
      case 'Q':
        controls = [point(args[0], args[1])];
        end = point(args[2], args[3]);
        break;
      case 'A':
        radius = Math.max(Math.abs(args[0]), Math.abs(args[1]));
        end = point(args[5], args[6]);
        break;
      case 'Z':
        end = start;
        break;
    }
    lastControl = 'CSQT'.includes(upper) ? controls[controls.length - 1] : null;
    for (const control of controls) {
      extremes.push({point: control, radius: 0});
    }
    extremes.push({point: end, radius});
    if (upper === 'M') {
      start = end;
      command = relative ? 'l' : 'L';
    }
    current = end;
  }
  return extremes;
}

function applyTransform(transform, [x, y], radius) {
  const [a, b, c] = transform.values;
  if (transform.kind === 'translate') {
    return [[x + a, y + b], radius];
  }
  if (transform.kind === 'scale') {
    return [[x * a, y * a], radius * Math.abs(a)];
  }
  const angle = (a * Math.PI) / 180;
  const [dx, dy] = [x - b, y - c];
  return [
    [
      b + dx * Math.cos(angle) - dy * Math.sin(angle),
      c + dx * Math.sin(angle) + dy * Math.cos(angle),
    ],
    radius,
  ];
}

function palPointsOutsideSafeCircle(text) {
  const outside = [];
  const visit = (node, transforms, inPal) => {
    if (node.type === 'path') {
      if (!inPal) {
        return;
      }
      for (const extreme of pathExtremes(node.attrs.d)) {
        let {point, radius} = extreme;
        for (const transform of [...transforms].reverse()) {
          [point, radius] = applyTransform(transform, point, radius);
        }
        const distance =
          Math.hypot(point[0] - SAFE_CENTER, point[1] - SAFE_CENTER) + radius;
        if (distance > SAFE_RADIUS) {
          outside.push({id: node.attrs.id, point, distance});
        }
      }
      return;
    }
    const nested = node.transform
      ? [...transforms, node.transform]
      : transforms;
    for (const child of node.children) {
      visit(child, nested, inPal || node.id === 'pal');
    }
  };
  const tree = parseSvg(text);
  let palGroups = 0;
  const countPal = nodes => {
    for (const node of nodes) {
      if (node.type === 'group') {
        palGroups += node.id === 'pal' ? 1 : 0;
        countPal(node.children);
      }
    }
  };
  countPal(tree.children);
  expect(palGroups).toBe(1);
  for (const node of tree.children) {
    visit(node, [], false);
  }
  return outside;
}

const outsideIds = text => [
  ...new Set(palPointsOutsideSafeCircle(text).map(({id}) => id)),
];

describe('committed sources', () => {
  const readSource = key =>
    fs.readFileSync(
      path.join(__dirname, '..', '..', SOURCE_DIR, SOURCE_FILES[key]),
      'utf-8',
    );

  it.each(Object.keys(SOURCE_FILES))(
    'keeps the pal of %s inside the safe circle',
    key => {
      expect(palPointsOutsideSafeCircle(readSource(key))).toEqual([]);
    },
  );

  it('names the pal path that leaves the safe circle', () => {
    const moved = readSource('foregroundLight').replace(
      'M85.7529 46.8772',
      'M115.7529 46.8772',
    );
    expect(outsideIds(moved)).toEqual(['band']);
  });

  it('applies group transforms before measuring', () => {
    const shifted = canvas(
      '<g id="pal"><g transform="translate(60 0)"><path id="nudged" d="M56 56H60" fill="#000000"/></g></g>',
    );
    expect(outsideIds(shifted)).toEqual(['nudged']);
  });
});

describe('committed outputs', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const sources = Object.fromEntries(
    Object.entries(SOURCE_FILES).map(([key, file]) => [
      key,
      fs.readFileSync(path.join(repoRoot, SOURCE_DIR, file), 'utf-8'),
    ]),
  );
  const textOutputs = buildTextOutputs(sources);

  it.each(Object.keys(textOutputs))('%s matches its sources', relative => {
    expect(fs.readFileSync(path.join(repoRoot, relative), 'utf-8')).toBe(
      textOutputs[relative],
    );
  });

  it('cuts the face out of the monochrome layer and clips it at the pocket', () => {
    const monochrome =
      textOutputs[`${ANDROID_RES}/drawable/ic_launcher_monochrome.xml`];
    expect(monochrome).toContain('android:fillType="evenOdd"');
    expect(monochrome).toContain('<clip-path');
  });

  it('ships exactly three opaque 1024 iOS icons', () => {
    const dir = path.join(repoRoot, APPICONSET);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'AppIcon-dark.png',
      'AppIcon-tinted.png',
      'AppIcon.png',
      'Contents.json',
    ]);
    for (const name of [
      'AppIcon.png',
      'AppIcon-dark.png',
      'AppIcon-tinted.png',
    ]) {
      expect(pngHeader(fs.readFileSync(path.join(dir, name)))).toEqual({
        width: 1024,
        height: 1024,
        colorType: 2,
      });
    }
  });

  it.each([
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ])('ships %s legacy icons at %ipx', (density, size) => {
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      const file = path.join(
        repoRoot,
        ANDROID_RES,
        `mipmap-${density}`,
        `${name}.png`,
      );
      expect(pngHeader(fs.readFileSync(file))).toMatchObject({
        width: size,
        height: size,
      });
    }
  });
});

describe('parseSvg rejects malformed input', () => {
  const CLIP = '<path d="M0 0H9V9Z"/>';
  it.each([
    ['a mismatched closing tag', `<g>${SQUARE}</defs>`, 'closes <g>'],
    [
      'a repeated attribute',
      '<path d="M0 0H9V9Z" fill="#000000" fill="#FFFFFF"/>',
      'repeats fill',
    ],
    [
      'a clip-path that is not a url',
      `<g clip-path="none">${SQUARE}</g>`,
      'clip-path "none"',
    ],
    ['a path without d', '<path fill="#000000"/>', 'without d'],
    [
      'a path with children',
      `<path id="p" d="M0 0H9V9Z" fill="#000000">${SQUARE}</path>`,
      'p has children',
    ],
    [
      'a stroke without a stroke-width',
      '<path id="s" d="M0 0L9 9" fill="none" stroke="#000000"/>',
      's needs an explicit stroke-width',
    ],
    [
      'an unknown fill-rule',
      '<path d="M0 0H9V9Z" fill="#000000" fill-rule="inherit"/>',
      'fill-rule="inherit"',
    ],
    [
      'a clipPath without id',
      `<defs><clipPath>${CLIP}</clipPath></defs>${SQUARE}`,
      'without id',
    ],
    [
      'a clipPath defined twice',
      `<defs><clipPath id="c">${CLIP}</clipPath><clipPath id="c">${CLIP}</clipPath></defs>` +
        `<g clip-path="url(#c)">${SQUARE}</g>`,
      'defined twice',
    ],
    [
      'a clipPath path carrying more than d',
      '<defs><clipPath id="c"><path d="M0 0H9V9Z" fill="#000000"/></clipPath></defs>' +
        `<g clip-path="url(#c)">${SQUARE}</g>`,
      'may carry only d',
    ],
    [
      'a <defs> outside the root',
      `<g><defs><clipPath id="c">${CLIP}</clipPath></defs>${SQUARE}</g>`,
      '<defs> here',
    ],
  ])('rejects %s', (_, body, message) => {
    expect(() => parseSvg(canvas(body))).toThrow(message);
  });

  it('rejects a document that is not a single <svg>', () => {
    expect(() => parseSvg(canvas(SQUARE) + canvas(SQUARE))).toThrow(
      'single <svg>',
    );
  });
});

describe('safe-circle scan', () => {
  it.each([
    [
      'an arc whose radius reaches outside',
      '<path id="arc" d="M56 56A60 60 0 0 1 60 56" fill="#000000"/>',
    ],
    [
      'a relative segment ending outside',
      '<path id="relative" d="M56 56l0 52" fill="#000000"/>',
    ],
    [
      'a curve whose control point is outside',
      '<path id="curve" d="M50 56C50 120 60 120 60 56Z" fill="#000000"/>',
    ],
    [
      'a scale group moving the path outside',
      '<g transform="scale(2)"><path id="scaled" d="M56 56H58" fill="#000000"/></g>',
    ],
    [
      'a rotate group moving the path outside',
      '<g transform="rotate(90 0 56)"><path id="rotated" d="M56 56H58" fill="#000000"/></g>',
    ],
  ])('flags %s', (_, body) => {
    const [id] = body.match(/id="([^"]+)"/).slice(1);
    expect(outsideIds(canvas(`<g id="pal">${body}</g>`))).toEqual([id]);
  });

  it('ignores clip geometry and paths outside the pal group', () => {
    const text = canvas(
      '<defs><clipPath id="c"><path d="M-28 -28H140V140Z"/></clipPath></defs>' +
        '<path id="rim" d="M-28 -28H140" fill="none" stroke="#000000" stroke-width="1"/>' +
        '<g clip-path="url(#c)"><g id="pal"><path id="inside" d="M50 50H60V60Z" fill="#000000"/></g></g>',
    );
    expect(outsideIds(text)).toEqual([]);
  });
});

function drawnPathIds(nodes, inPal = false, out = {pal: [], rest: []}) {
  for (const node of nodes) {
    if (node.type === 'path') {
      (inPal ? out.pal : out.rest).push(node.attrs.id);
    } else {
      drawnPathIds(node.children, inPal || node.id === 'pal', out);
    }
  }
  return out;
}

describe('committed source structure', () => {
  const readSource = key =>
    fs.readFileSync(
      path.join(__dirname, '..', '..', SOURCE_DIR, SOURCE_FILES[key]),
      'utf-8',
    );
  const FOREGROUND_PAL = [
    'body',
    'band',
    'mouth',
    'eye-left',
    'eye-right',
    'highlight-1',
    'highlight-2',
  ];

  it.each([
    ['foregroundLight', FOREGROUND_PAL, ['rim', 'pocket', 'road']],
    ['foregroundDark', FOREGROUND_PAL, ['rim', 'pocket', 'road']],
    ['monochrome', ['silhouette'], ['pocket-edge']],
  ])(
    'puts the whole pal of %s in the pal group and only bleed shapes outside',
    (key, pal, rest) => {
      expect(drawnPathIds(parseSvg(readSource(key)).children)).toEqual({
        pal,
        rest,
      });
    },
  );

  it('clips the monochrome pal on a wrapper group, never inside it', () => {
    const {children} = parseSvg(readSource('monochrome'));
    const wrapper = children.find(node => node.clipId);
    expect(wrapper.clipId).toBe('pal-clip');
    expect(wrapper.children.map(node => node.id)).toEqual(['pal']);
    expect(wrapper.children[0].clipD).toBeUndefined();
  });

  it('draws the monochrome layer in opaque white only', () => {
    const text = readSource('monochrome');
    expect(text).not.toContain('fill-opacity');
    const paints = [...text.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(
      ([, value]) => value,
    );
    expect(new Set(paints)).toEqual(new Set(['#FFFFFF', 'none']));
    expect(text).toContain('fill-rule="evenodd"');
  });

  it('gives the dark foreground the light geometry with only the pal recoloured', () => {
    const light = readSource('foregroundLight');
    const dark = readSource('foregroundDark');
    expect(light).toContain('id="body" d="');
    expect(dark.replace('fill="#A86C34"', 'fill="#F5DBBC"')).toBe(light);
  });
});

describe('Android launcher resources', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const resRoot = path.join(repoRoot, ANDROID_RES);

  it('keeps the manifest on both mipmap names', () => {
    const manifest = fs.readFileSync(
      path.join(repoRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf-8',
    );
    expect(manifest).toContain('android:icon="@mipmap/ic_launcher"');
    expect(manifest).toContain('android:roundIcon="@mipmap/ic_launcher_round"');
  });

  it('resolves both names on anydpi-v26 and every legacy density, with no dark variant', () => {
    const found = [];
    for (const dir of fs.readdirSync(resRoot)) {
      for (const file of fs.readdirSync(path.join(resRoot, dir))) {
        if (file.startsWith('ic_launcher')) {
          found.push(`${dir}/${file}`);
        }
      }
    }
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    expect(found.sort()).toEqual(
      [
        'drawable/ic_launcher_foreground.xml',
        'drawable/ic_launcher_monochrome.xml',
        'mipmap-anydpi-v26/ic_launcher.xml',
        'mipmap-anydpi-v26/ic_launcher_round.xml',
        'values/ic_launcher_background.xml',
        ...densities.flatMap(density => [
          `mipmap-${density}/ic_launcher.png`,
          `mipmap-${density}/ic_launcher_round.png`,
        ]),
      ].sort(),
    );
  });

  it('leaves flavour source sets without a launcher icon override', () => {
    const flavours = fs
      .readdirSync(path.join(repoRoot, 'android/app/src'))
      .filter(name => name !== 'main');
    for (const flavour of flavours) {
      const res = path.join(repoRoot, 'android/app/src', flavour, 'res');
      const icons = fs.existsSync(res)
        ? fs
            .readdirSync(res, {recursive: true})
            .filter(file => path.basename(file).startsWith('ic_launcher'))
        : [];
      expect({flavour, icons}).toEqual({flavour, icons: []});
    }
  });
});

const PAETH = (a, b, c) => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function decodePng(buffer) {
  const chunks = [];
  const idat = [];
  for (let at = 8; at < buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.subarray(at + 4, at + 8).toString('ascii');
    chunks.push(type);
    if (type === 'IDAT') {
      idat.push(buffer.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }
  const {width, height, colorType} = pngHeader(buffer);
  expect(buffer[24]).toBe(8);
  const channels = {2: 3, 6: 4}[colorType];
  const raw = require('zlib').inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft =
        y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [
        0,
        left,
        up,
        Math.floor((left + up) / 2),
        PAETH(left, up, upLeft),
      ][filter];
      pixels[y * stride + x] = (value + predictor) % 256;
    }
  }
  const at = (u, v) => {
    const x = Math.floor((u * width) / 112);
    const y = Math.floor((v * height) / 112);
    const from = y * stride + x * channels;
    const [r, g, b, a = 255] = pixels.subarray(from, from + channels);
    const hex = [r, g, b]
      .map(c => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return {color: `#${hex}`, alpha: a};
  };
  return {chunks, colorType, at};
}

describe('committed PNG content', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const png = relative =>
    decodePng(fs.readFileSync(path.join(repoRoot, relative)));
  const BACKDROP = [1, 1];
  const PAL_BODY = [49, 33];
  const RIGHT_EYE = [66, 46.5];
  const POCKET = [88, 92];

  it.each([
    ['AppIcon.png', '#FFFFFF', '#F5DBBC', '#000000'],
    ['AppIcon-dark.png', '#181715', '#A86C34', '#000000'],
    ['AppIcon-tinted.png', '#000000', '#FFFFFF', '#000000'],
  ])(
    '%s paints backdrop %s, pal %s and eye %s with no transparency chunk',
    (name, backdrop, pal, eye) => {
      const icon = png(`${APPICONSET}/${name}`);
      expect(icon.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
      expect(icon.at(...BACKDROP)).toEqual({color: backdrop, alpha: 255});
      expect(icon.at(...PAL_BODY)).toEqual({color: pal, alpha: 255});
      expect(icon.at(...RIGHT_EYE)).toEqual({color: eye, alpha: 255});
    },
  );

  it.each(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'])(
    'masks the %s legacy icons as a rounded square and a circle over the iOS composition',
    density => {
      const square = png(`${ANDROID_RES}/mipmap-${density}/ic_launcher.png`);
      const round = png(
        `${ANDROID_RES}/mipmap-${density}/ic_launcher_round.png`,
      );
      const ios = png(`${APPICONSET}/AppIcon.png`);
      for (const icon of [square, round]) {
        expect(icon.colorType).toBe(6);
        expect(icon.at(0, 0).alpha).toBe(0);
        for (const point of [PAL_BODY, POCKET]) {
          expect(icon.at(...point)).toEqual(ios.at(...point));
        }
      }
      expect(square.at(14, 14)).toEqual({color: '#FFFFFF', alpha: 255});
      expect(round.at(14, 14).alpha).toBe(0);
    },
  );
});

describe('generate from the committed sources', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  let root;
  let previewDir;
  let firstRun;

  const listFiles = dir =>
    fs
      .readdirSync(dir, {recursive: true})
      .filter(file => fs.statSync(path.join(dir, file)).isFile())
      .map(file => file.split(path.sep).join('/'))
      .sort();
  const readAll = dir =>
    Object.fromEntries(
      listFiles(dir).map(file => [file, fs.readFileSync(path.join(dir, file))]),
    );

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-real-'));
    previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-preview-'));
    for (const file of Object.values(SOURCE_FILES)) {
      const target = path.join(root, SOURCE_DIR, file);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.copyFileSync(path.join(repoRoot, SOURCE_DIR, file), target);
    }
    generate({root, previewDir});
    firstRun = readAll(root);
  });

  afterAll(() => {
    fs.rmSync(root, {recursive: true, force: true});
    fs.rmSync(previewDir, {recursive: true, force: true});
  });

  it('writes the committed output set and nothing else', () => {
    const outputs = Object.keys(firstRun).filter(
      file => !file.startsWith(`${SOURCE_DIR}/`),
    );
    const committed = [
      ...listFiles(path.join(repoRoot, APPICONSET)).map(
        file => `${APPICONSET}/${file}`,
      ),
      ...fs
        .readdirSync(path.join(repoRoot, ANDROID_RES), {recursive: true})
        .filter(file => path.basename(file).startsWith('ic_launcher'))
        .map(file => `${ANDROID_RES}/${file.split(path.sep).join('/')}`),
    ].sort();
    expect(outputs).toEqual(committed);
  });

  it('writes byte-identical outputs on a second run', () => {
    generate({root});
    expect(readAll(root)).toEqual(firstRun);
  });

  it('writes previews only to the preview directory', () => {
    expect(listFiles(previewDir)).toEqual([
      'android-monochrome-themed-1024.png',
      'android-monochrome-themed-144.png',
      'canvas-foreground-dark.png',
      'canvas-foreground-light.png',
      'canvas-monochrome.png',
      'ios-tinted-1024.png',
      'ios-tinted-180.png',
    ]);
    expect(Object.keys(firstRun).some(file => file.includes('canvas-'))).toBe(
      false,
    );
  });
});

describe('command line', () => {
  let root;

  const run = args => {
    try {
      const stdout = execFileSync(
        'node',
        [path.join(root, 'scripts', 'generate-app-icons.js'), ...args],
        {
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_PATH: path.join(__dirname, '..', '..', 'node_modules'),
          },
        },
      );
      return {status: 0, stdout: stdout.toString()};
    } catch (error) {
      return {status: error.status, stderr: error.stderr.toString()};
    }
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-cli-'));
    const sources = {
      foregroundLight: canvas(SQUARE),
      foregroundDark: canvas(SQUARE),
      monochrome: canvas(SQUARE),
    };
    for (const [key, text] of Object.entries(sources)) {
      const target = path.join(root, SOURCE_DIR, SOURCE_FILES[key]);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, text);
    }
    fs.copyFileSync(
      GENERATOR_PATH,
      path.join(root, 'scripts', 'generate-app-icons.js'),
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('reports what it wrote and exits zero', () => {
    expect(run([])).toEqual({
      status: 0,
      stdout: 'wrote 19 outputs, 0 previews\n',
    });
  });

  it.each([[['--bogus']], [['--preview']]])('exits non-zero on %j', args => {
    const result = run(args);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unexpected argument');
    expect(fs.existsSync(path.join(root, 'android'))).toBe(false);
  });
});

describe('generate on failure', () => {
  let root;

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('leaves existing outputs and stale icons untouched', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-icons-keep-'));
    const sources = {
      foregroundLight: canvas(SQUARE),
      foregroundDark: canvas('<rect width="1" height="1"/>'),
      monochrome: canvas(SQUARE),
    };
    for (const [key, text] of Object.entries(sources)) {
      const target = path.join(root, SOURCE_DIR, SOURCE_FILES[key]);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, text);
    }
    const existing = {
      [`${APPICONSET}/iPhone_App_60_2x.png`]: 'stale',
      [`${ANDROID_RES}/drawable/ic_launcher_foreground.xml`]: 'previous',
    };
    for (const [relative, content] of Object.entries(existing)) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
      fs.writeFileSync(path.join(root, relative), content);
    }

    expect(() => generate({root})).toThrow('<rect>');

    for (const [relative, content] of Object.entries(existing)) {
      expect(fs.readFileSync(path.join(root, relative), 'utf-8')).toBe(content);
    }
    expect(fs.readdirSync(path.join(root, APPICONSET))).toEqual([
      'iPhone_App_60_2x.png',
    ]);
  });
});
