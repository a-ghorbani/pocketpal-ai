#!/usr/bin/env node
/**
 * Writes every launcher icon output (Android adaptive + legacy, iOS AppIcon)
 * from the SVG sources in scripts/app-icon/.
 *
 * Usage: node scripts/generate-app-icons.js [--preview <dir outside the repo>]
 */
const CANVAS_VIEWBOX = '-28 -28 168 168';
const CANVAS_OFFSET = 28;
const CANVAS_SIZE = 168;

const BACKGROUND_LIGHT = '#FFFFFF';

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
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/;
const NUMBER_LIST = '(-?[\\d.]+(?:e-?\\d+)?)';
const TRANSFORMS = [
  {
    kind: 'translate',
    pattern: new RegExp(`^translate\\(${NUMBER_LIST}[ ,]+${NUMBER_LIST}\\)$`),
  },
  {
    kind: 'rotate',
    pattern: new RegExp(
      `^rotate\\(${NUMBER_LIST}[ ,]+${NUMBER_LIST}[ ,]+${NUMBER_LIST}\\)$`,
    ),
  },
  {kind: 'scale', pattern: new RegExp(`^scale\\(${NUMBER_LIST}\\)$`)},
];

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

function checkDrawnPath(node) {
  if (!node.attrs.d) {
    fail('<path> without d');
  }
  const label = node.attrs.id || node.attrs.d.slice(0, 20);
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

module.exports = {
  APPICONSET,
  ANDROID_RES,
  parseSvg,
  toVectorDrawable,
  buildTextOutputs,
};
