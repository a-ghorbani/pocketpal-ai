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

  it.each(['translate(1 2) rotate(3)', 'matrix(1 0 0 1 0 0)', 'rotate(3)'])(
    'rejects transform %s naming it',
    transform => {
      expect(() =>
        parseSvg(canvas(`<g transform="${transform}">${SQUARE}</g>`)),
      ).toThrow(transform);
    },
  );

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

  it('refuses a preview directory inside the repo', () => {
    writeSources();
    expect(() =>
      generate({root, previewDir: path.join(root, 'previews')}),
    ).toThrow('outside the repo');
  });

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
