const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

//const localPackagePaths = ['localpath/code/llama.rn'];

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
        return context.resolveRequest(
          context,
          '@huggingface/gguf/dist/browser/index.mjs',
          platform,
        );
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
