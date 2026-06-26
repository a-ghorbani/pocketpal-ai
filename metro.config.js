const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

//const localPackagePaths = ['localpath/code/llama.rn'];

// @huggingface/gguf is consumed via a non-exported deep path (its `browser`
// build): the package only exports `.`, which resolves to the Node build that
// statically imports stream/fs and breaks the RN bundle. Derive the deep path
// from the (exported) package root and assert it exists up front, so a missing
// or relocated build fails loudly here instead of silently shipping the Node
// build into the bundle (the same false-green class that hid the original break).
const path = require('path');
const fs = require('fs');
const ggufRoot = path.resolve(
  path.dirname(require.resolve('@huggingface/gguf')),
  '..',
);
const ggufBrowserBuild = path.join(ggufRoot, 'dist/browser/index.mjs');
if (!fs.existsSync(ggufBrowserBuild)) {
  throw new Error(
    `[metro] @huggingface/gguf browser build not found at ${ggufBrowserBuild}. ` +
      'The package layout changed; update the redirect in metro.config.js. ' +
      'Without it the RN bundle pulls the Node build (stream/fs) and breaks.',
  );
}

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const defaultConfig = getDefaultConfig(__dirname);
const {assetExts, sourceExts} = defaultConfig.resolver;

const config = {
  resolver: {
    //nodeModulesPaths: [...localPackagePaths], // update to resolver
    assetExts: assetExts.filter(ext => ext !== 'svg'),
    sourceExts: [...sourceExts, 'svg'],
    // @huggingface/gguf has no `browser` export condition, so Metro resolves
    // its Node build, which statically imports stream/fs (FileBlob) and breaks
    // the RN bundle. Redirect to the fetch-based browser build instead.
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === '@huggingface/gguf' ||
        moduleName.startsWith('@huggingface/gguf/')
      ) {
        return context.resolveRequest(context, ggufBrowserBuild, platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    babelTransformerPath: require.resolve(
      'react-native-svg-transformer/react-native',
    ),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    // Make sure decorators are properly transformed
    enableBabelRuntime: true,
  },
  //watchFolders: [...localPackagePaths],
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
