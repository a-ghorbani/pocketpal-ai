#!/usr/bin/env node
/**
 * Writes every launcher icon output (Android adaptive + legacy, iOS AppIcon)
 * from the SVG sources in scripts/app-icon/.
 *
 * Usage: node scripts/generate-app-icons.js [--preview <dir outside the repo>]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = 'scripts/app-icon';
const SOURCE_FILES = {
  foregroundLight: 'foreground-light.svg',
  foregroundDark: 'foreground-dark.svg',
  monochrome: 'monochrome.svg',
};

const CANVAS_VIEWBOX = '-28 -28 168 168';
const CANVAS_OFFSET = 28;
const CANVAS_SIZE = 168;

const BACKGROUND_LIGHT = '#FFFFFF';
const BACKGROUND_DARK = '#181715';
const TINT_BACKGROUND = '#000000';
const TINT_FOREGROUND = '#FFFFFF';

const VIEWPORT_VIEWBOX = '0 0 112 112';
const SAFE_RADIUS = 51.3333;
const ROUNDED_MASK = '<rect width="112" height="112" rx="25.7471"/>';
const CIRCLE_MASK = '<circle cx="56" cy="56" r="56"/>';
const IOS_SIZE = 1024;
const LEGACY_SIZES = {mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192};

const ANDROID_RES = 'android/app/src/main/res';
const APPICONSET = 'ios/PocketPal/Images.xcassets/AppIcon.appiconset';

const IOS_ICONS = [
  {filename: 'AppIcon.png'},
  {filename: 'AppIcon-dark.png', appearance: 'dark'},
  {filename: 'AppIcon-tinted.png', appearance: 'tinted'},
];

const ALLOWED_ATTRIBUTES = {
  svg: ['xmlns', 'viewBox'],
  g: ['id', 'transform', 'clip-path'],
  path: [
    'id',
    'd',
    'fill',
    'fill-opacity',
    'fill-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
  ],
  defs: [],
  clipPath: ['id'],
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const NUMBER_BODY = '-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e-?\\d+)?';
const NUMBER = new RegExp(`^${NUMBER_BODY}$`);
const NUMBER_CAPTURE = `(${NUMBER_BODY})`;
const TRANSFORMS = [
  {
    kind: 'translate',
    pattern: new RegExp(
      `^translate\\(${NUMBER_CAPTURE}[ ,]+${NUMBER_CAPTURE}\\)$`,
    ),
  },
  {
    kind: 'rotate',
    pattern: new RegExp(
      `^rotate\\(${NUMBER_CAPTURE}[ ,]+${NUMBER_CAPTURE}[ ,]+${NUMBER_CAPTURE}\\)$`,
    ),
  },
  {kind: 'scale', pattern: new RegExp(`^scale\\(${NUMBER_CAPTURE}\\)$`)},
];

const PATH_ARGUMENTS = {
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
const PATH_SEGMENT = /([A-DF-Za-df-z])([^A-DF-Za-df-z]*)/y;
const ARC_FLAGS = [3, 4];

function fail(message) {
  throw new Error(`generate-app-icons: ${message}`);
}

function tokenize(text) {
  const root = {name: '#document', attrs: {}, children: []};
  const stack = [root];
  const token =
    /\s+|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/y;
  while (token.lastIndex < text.length) {
    const at = token.lastIndex;
    const match = token.exec(text);
    if (!match) {
      fail(`cannot parse "${text.slice(at, at + 40)}"`);
    }
    const [, closeName, openName, rawAttrs, selfClosing] = match;
    if (closeName) {
      const open = stack.pop();
      if (open.name !== closeName) {
        fail(`</${closeName}> closes <${open.name}>`);
      }
    } else if (openName) {
      const attrs = {};
      for (const [, key, value] of rawAttrs.matchAll(
        /([\w:-]+)\s*=\s*"([^"]*)"/g,
      )) {
        if (key in attrs) {
          fail(`<${openName}> repeats ${key}`);
        }
        attrs[key] = value;
      }
      const node = {name: openName, attrs, children: []};
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    }
  }
  if (stack.length !== 1) {
    fail(`<${stack[stack.length - 1].name}> is never closed`);
  }
  return root;
}

function parseTransform(value) {
  for (const {kind, pattern} of TRANSFORMS) {
    const match = value.trim().match(pattern);
    if (match) {
      return {kind, values: match.slice(1).map(Number)};
    }
  }
  fail(`unsupported transform "${value}"`);
}

function clipReference(value) {
  const match = value.match(/^url\(#([\w-]+)\)$/);
  if (!match) {
    fail(`unsupported clip-path "${value}"`);
  }
  return match[1];
}

function checkAttributes(node) {
  const allowed = ALLOWED_ATTRIBUTES[node.name];
  if (!allowed) {
    fail(`unsupported element <${node.name}>`);
  }
  for (const [key, value] of Object.entries(node.attrs)) {
    if (!allowed.includes(key)) {
      fail(`unsupported attribute ${key} on <${node.name}>`);
    }
    const bad =
      ((key === 'fill' || key === 'stroke') &&
        !HEX_COLOR.test(value) &&
        !(key === 'fill' && value === 'none')) ||
      ((key === 'fill-opacity' || key === 'stroke-width') &&
        !NUMBER.test(value)) ||
      (key === 'fill-rule' && !['nonzero', 'evenodd'].includes(value)) ||
      (key === 'stroke-linecap' &&
        !['butt', 'round', 'square'].includes(value));
    if (bad) {
      fail(`unsupported ${key}="${value}" on <${node.name}>`);
    }
  }
}

function checkPathData(d, label) {
  const text = d.trim();
  if (!/^[Mm]/.test(text)) {
    fail(`${label} has path data not starting with a moveto`);
  }
  PATH_SEGMENT.lastIndex = 0;
  while (PATH_SEGMENT.lastIndex < text.length) {
    const [segment, letter, body] = PATH_SEGMENT.exec(text);
    const command = letter.toUpperCase();
    const count = PATH_ARGUMENTS[command];
    const args = body.trim() ? body.trim().split(/\s*,\s*|\s+/) : [];
    const valid =
      count !== undefined &&
      (count ? args.length > 0 && args.length % count === 0 : !args.length) &&
      args.every(
        (arg, i) =>
          NUMBER.test(arg) &&
          (command !== 'A' ||
            !ARC_FLAGS.includes(i % count) ||
            /^[01]$/.test(arg)),
      );
    if (!valid) {
      fail(`${label} has unsupported path data "${segment.trim()}"`);
    }
  }
}

function checkDrawnPath(node) {
  if (!node.attrs.d) {
    fail('<path> without d');
  }
  const label = node.attrs.id || node.attrs.d.slice(0, 20);
  checkPathData(node.attrs.d, `path ${label}`);
  if (node.children.length) {
    fail(`<path> ${label} has children`);
  }
  if (!('fill' in node.attrs)) {
    fail(`path ${label} needs an explicit fill`);
  }
  if ('stroke' in node.attrs && !('stroke-width' in node.attrs)) {
    fail(`path ${label} needs an explicit stroke-width`);
  }
}

function readClipPaths(defs, clipPaths) {
  for (const clip of defs.children) {
    if (clip.name !== 'clipPath') {
      fail(`unsupported <${clip.name}> in <defs>`);
    }
    checkAttributes(clip);
    const {id} = clip.attrs;
    if (!id) {
      fail('<clipPath> without id');
    }
    if (clipPaths.has(id)) {
      fail(`clipPath ${id} is defined twice`);
    }
    const [shape, ...rest] = clip.children;
    if (!shape || rest.length || shape.name !== 'path') {
      fail(`clipPath ${id} must hold exactly one <path>`);
    }
    const keys = Object.keys(shape.attrs);
    if (keys.length !== 1 || keys[0] !== 'd' || shape.children.length) {
      fail(`clipPath ${id} path may carry only d`);
    }
    checkPathData(shape.attrs.d, `clipPath ${id}`);
    clipPaths.set(id, {d: shape.attrs.d, used: false});
  }
}

function readNode(node, clipPaths) {
  checkAttributes(node);
  if (node.name === 'clipPath') {
    fail(`clipPath ${node.attrs.id || ''} must sit in <defs>`.trim());
  }
  if (node.name === 'path') {
    checkDrawnPath(node);
    return {type: 'path', attrs: node.attrs};
  }
  if (node.name !== 'g') {
    fail(`unsupported <${node.name}> here`);
  }
  const group = {type: 'group', id: node.attrs.id, children: []};
  if (node.attrs.transform) {
    group.transform = parseTransform(node.attrs.transform);
  }
  if (node.attrs['clip-path']) {
    group.clipId = clipReference(node.attrs['clip-path']);
  }
  group.children = node.children.map(child => readNode(child, clipPaths));
  return group;
}

function parseSvg(text) {
  const document = tokenize(text);
  const [svg, ...extra] = document.children;
  if (!svg || extra.length || svg.name !== 'svg') {
    fail('a source must be a single <svg> element');
  }
  checkAttributes(svg);
  if (svg.attrs.viewBox !== CANVAS_VIEWBOX) {
    fail(`viewBox must be "${CANVAS_VIEWBOX}"`);
  }
  const clipPaths = new Map();
  for (const child of svg.children) {
    if (child.name === 'defs') {
      checkAttributes(child);
      readClipPaths(child, clipPaths);
    }
  }
  const children = svg.children
    .filter(child => child.name !== 'defs')
    .map(child => readNode(child, clipPaths));

  const resolveClips = nodes => {
    for (const node of nodes) {
      if (node.type !== 'group') {
        continue;
      }
      if (node.clipId) {
        const clip = clipPaths.get(node.clipId);
        if (!clip) {
          fail(`clip-path references unknown #${node.clipId}`);
        }
        clip.used = true;
        node.clipD = clip.d;
      }
      resolveClips(node.children);
    }
  };
  resolveClips(children);
  for (const [id, clip] of clipPaths) {
    if (!clip.used) {
      fail(`clipPath ${id} is never referenced`);
    }
  }
  return {children, svg};
}

function xmlElement(depth, name, attrs, children) {
  const pad = '    '.repeat(depth);
  const lines = attrs.map(([key, value]) => `${pad}    ${key}="${value}"`);
  const head = lines.length
    ? `${pad}<${name}\n${lines.join('\n')}`
    : `${pad}<${name}`;
  if (!children.length) {
    return `${head} />`;
  }
  return `${head}>\n${children.join('\n')}\n${pad}</${name}>`;
}

function pathElement(attrs, depth) {
  const out = [];
  if (attrs.id) {
    out.push(['android:name', attrs.id]);
  }
  if (attrs.fill && attrs.fill !== 'none') {
    out.push(['android:fillColor', attrs.fill.toUpperCase()]);
  }
  if (attrs['fill-opacity'] !== undefined) {
    out.push(['android:fillAlpha', attrs['fill-opacity']]);
  }
  if (attrs['fill-rule'] === 'evenodd') {
    out.push(['android:fillType', 'evenOdd']);
  }
  if (attrs.stroke) {
    out.push(['android:strokeColor', attrs.stroke.toUpperCase()]);
    out.push(['android:strokeWidth', attrs['stroke-width']]);
  }
  if (attrs['stroke-linecap']) {
    out.push(['android:strokeLineCap', attrs['stroke-linecap']]);
  }
  out.push(['android:pathData', attrs.d]);
  return xmlElement(depth, 'path', out, []);
}

function groupTransformAttributes({kind, values}) {
  if (kind === 'translate') {
    return [
      ['android:translateX', String(values[0])],
      ['android:translateY', String(values[1])],
    ];
  }
  if (kind === 'rotate') {
    return [
      ['android:rotation', String(values[0])],
      ['android:pivotX', String(values[1])],
      ['android:pivotY', String(values[2])],
    ];
  }
  return [
    ['android:scaleX', String(values[0])],
    ['android:scaleY', String(values[0])],
  ];
}

function vectorNode(node, depth) {
  if (node.type === 'path') {
    return pathElement(node.attrs, depth);
  }
  const attrs = [];
  if (node.id) {
    attrs.push(['android:name', node.id]);
  }
  if (node.transform) {
    attrs.push(...groupTransformAttributes(node.transform));
  }
  const children = [];
  if (node.clipD) {
    children.push(
      xmlElement(
        depth + 1,
        'clip-path',
        [['android:pathData', node.clipD]],
        [],
      ),
    );
  }
  children.push(...node.children.map(child => vectorNode(child, depth + 1)));
  return xmlElement(depth, 'group', attrs, children);
}

function toVectorDrawable(tree) {
  const root = xmlElement(
    1,
    'group',
    [
      ['android:translateX', String(CANVAS_OFFSET)],
      ['android:translateY', String(CANVAS_OFFSET)],
    ],
    tree.children.map(child => vectorNode(child, 2)),
  );
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="108dp"',
    '    android:height="108dp"',
    `    android:viewportWidth="${CANVAS_SIZE}"`,
    `    android:viewportHeight="${CANVAS_SIZE}">`,
    root,
    '</vector>',
    '',
  ].join('\n');
}

const ADAPTIVE_ICON = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
  '    <background android:drawable="@color/ic_launcher_background" />',
  '    <foreground android:drawable="@drawable/ic_launcher_foreground" />',
  '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />',
  '</adaptive-icon>',
  '',
].join('\n');

function backgroundColorXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<resources>',
    `    <color name="ic_launcher_background">${BACKGROUND_LIGHT}</color>`,
    '</resources>',
    '',
  ].join('\n');
}

function appIconContents() {
  const images = IOS_ICONS.map(({filename, appearance}) => ({
    ...(appearance && {
      appearances: [{appearance: 'luminosity', value: appearance}],
    }),
    filename,
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  }));
  const json = JSON.stringify(
    {images, info: {author: 'xcode', version: 1}},
    null,
    2,
  );
  return `${json.replace(/^(\s*"[^"]+"):/gm, '$1 :')}\n`;
}

function buildTextOutputs(sources) {
  return {
    [`${ANDROID_RES}/drawable/ic_launcher_foreground.xml`]: toVectorDrawable(
      parseSvg(sources.foregroundLight),
    ),
    [`${ANDROID_RES}/drawable/ic_launcher_monochrome.xml`]: toVectorDrawable(
      parseSvg(sources.monochrome),
    ),
    [`${ANDROID_RES}/mipmap-anydpi-v26/ic_launcher.xml`]: ADAPTIVE_ICON,
    [`${ANDROID_RES}/mipmap-anydpi-v26/ic_launcher_round.xml`]: ADAPTIVE_ICON,
    [`${ANDROID_RES}/values/ic_launcher_background.xml`]: backgroundColorXml(),
    [`${APPICONSET}/Contents.json`]: appIconContents(),
  };
}

function markup(node, recolor) {
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => {
      const repaint =
        recolor && (key === 'fill' || key === 'stroke') && value !== 'none';
      return ` ${key}="${repaint ? recolor : value}"`;
    })
    .join('');
  const children = node.children.map(child => markup(child, recolor));
  return `<${node.name}${attrs}>${children.join('')}</${node.name}>`;
}

function composition(
  tree,
  {background, mask, recolor, viewBox = VIEWPORT_VIEWBOX, overlay = ''},
) {
  const art = tree.svg.children.map(child => markup(child, recolor)).join('');
  const backdrop = `<rect x="-28" y="-28" width="168" height="168" fill="${background}"/>`;
  const clip = mask
    ? `<defs><clipPath id="icon-mask">${mask}</clipPath></defs>`
    : '';
  const clipRef = mask ? ' clip-path="url(#icon-mask)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${clip}<g${clipRef}>${backdrop}${art}</g>${overlay}</svg>`;
}

function render(Resvg, svg, size) {
  return new Resvg(svg, {
    fitTo: {mode: 'width', value: size},
    font: {loadSystemFonts: false},
  }).render();
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

function opaqueRgbPng({width, height, pixels}, label) {
  const stride = width * 3 + 1;
  const rows = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      if (pixels[from + 3] !== 255) {
        fail(`${label} has a non-opaque pixel at ${x},${y}`);
      }
      pixels.copy(rows, y * stride + 1 + x * 3, from, from + 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows, {level: 9})),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function iosCompositions(trees) {
  return {
    'AppIcon.png': composition(trees.foregroundLight, {
      background: BACKGROUND_LIGHT,
    }),
    'AppIcon-dark.png': composition(trees.foregroundDark, {
      background: BACKGROUND_DARK,
    }),
    'AppIcon-tinted.png': composition(trees.monochrome, {
      background: TINT_BACKGROUND,
      recolor: TINT_FOREGROUND,
    }),
  };
}

function buildRasterOutputs(trees) {
  const {Resvg} = require('@resvg/resvg-js');
  const outputs = {};
  for (const [filename, svg] of Object.entries(iosCompositions(trees))) {
    const image = render(Resvg, svg, IOS_SIZE);
    outputs[`${APPICONSET}/${filename}`] = opaqueRgbPng(image, filename);
  }
  const legacy = {
    ic_launcher: ROUNDED_MASK,
    ic_launcher_round: CIRCLE_MASK,
  };
  for (const [density, size] of Object.entries(LEGACY_SIZES)) {
    for (const [name, mask] of Object.entries(legacy)) {
      const svg = composition(trees.foregroundLight, {
        background: BACKGROUND_LIGHT,
        mask,
      });
      outputs[`${ANDROID_RES}/mipmap-${density}/${name}.png`] = render(
        Resvg,
        svg,
        size,
      ).asPng();
    }
  }
  return outputs;
}

function buildPreviews(trees) {
  const {Resvg} = require('@resvg/resvg-js');
  const guides = `<g fill="none" stroke="#FF00FF" stroke-width="0.4"><rect width="112" height="112"/><circle cx="56" cy="56" r="${SAFE_RADIUS}"/></g>`;
  const fullCanvas = {viewBox: CANVAS_VIEWBOX, overlay: guides};
  const svgs = {
    'canvas-foreground-light.png': [
      composition(trees.foregroundLight, {
        ...fullCanvas,
        background: BACKGROUND_LIGHT,
      }),
      1024,
    ],
    'canvas-foreground-dark.png': [
      composition(trees.foregroundDark, {
        ...fullCanvas,
        background: BACKGROUND_DARK,
      }),
      1024,
    ],
    'canvas-monochrome.png': [
      composition(trees.monochrome, {
        ...fullCanvas,
        background: TINT_BACKGROUND,
        recolor: TINT_FOREGROUND,
      }),
      1024,
    ],
  };
  const themed = composition(trees.monochrome, {
    background: '#D6E3FF',
    recolor: '#1F3760',
    mask: CIRCLE_MASK,
  });
  const tinted = composition(trees.monochrome, {
    background: TINT_BACKGROUND,
    recolor: TINT_FOREGROUND,
    mask: ROUNDED_MASK,
  });
  for (const size of [1024, 144]) {
    svgs[`android-monochrome-themed-${size}.png`] = [themed, size];
  }
  for (const size of [1024, 180]) {
    svgs[`ios-tinted-${size}.png`] = [tinted, size];
  }
  return Object.fromEntries(
    Object.entries(svgs).map(([name, [svg, size]]) => [
      name,
      render(Resvg, svg, size).asPng(),
    ]),
  );
}

function readSources(root) {
  return Object.fromEntries(
    Object.entries(SOURCE_FILES).map(([key, file]) => [
      key,
      fs.readFileSync(path.join(root, SOURCE_DIR, file), 'utf-8'),
    ]),
  );
}

function assertOutsideRepo(root, dir) {
  const relative = path.relative(path.resolve(root), path.resolve(dir));
  const outside =
    relative === '..' ||
    relative.startsWith('..' + path.sep) ||
    path.isAbsolute(relative);
  if (!outside) {
    fail(`--preview must point outside the repo, got ${dir}`);
  }
}

function writeFiles(base, files) {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(base, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, content);
  }
}

function removeStaleAppIcons(root, outputs) {
  const dir = path.join(root, APPICONSET);
  for (const name of fs.readdirSync(dir)) {
    if (!(`${APPICONSET}/${name}` in outputs)) {
      fs.rmSync(path.join(dir, name));
    }
  }
}

function generate({root = REPO_ROOT, previewDir} = {}) {
  if (previewDir) {
    assertOutsideRepo(root, previewDir);
  }
  const sources = readSources(root);
  const trees = Object.fromEntries(
    Object.entries(sources).map(([key, text]) => [key, parseSvg(text)]),
  );
  const outputs = {...buildTextOutputs(sources), ...buildRasterOutputs(trees)};
  const previews = previewDir ? buildPreviews(trees) : {};
  writeFiles(root, outputs);
  removeStaleAppIcons(root, outputs);
  if (previewDir) {
    writeFiles(previewDir, previews);
  }
  return {outputs: Object.keys(outputs), previews: Object.keys(previews)};
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--preview' && argv[i + 1] && !args.previewDir) {
      args.previewDir = argv[++i];
    } else {
      fail(`unexpected argument ${argv[i]}`);
    }
  }
  return args;
}

if (require.main === module) {
  try {
    const {outputs, previews} = generate(parseArgs(process.argv.slice(2)));
    console.log(`wrote ${outputs.length} outputs, ${previews.length} previews`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  APPICONSET,
  ANDROID_RES,
  SOURCE_DIR,
  SOURCE_FILES,
  generate,
  opaqueRgbPng,
  parseSvg,
  toVectorDrawable,
  buildTextOutputs,
};
