import * as React from 'react';
import {Animated, Image, View} from 'react-native';

import {useTheme} from '../../hooks';

import {styles} from './styles';

let hasPlayedAnimation = false;

export const PocketPalIconAnimation = React.memo(
  ({testID = 'pocketpal-icon-animation'}: {testID?: string}) => {
    const theme = useTheme();
    const fadeGifAnim = React.useRef(
      new Animated.Value(hasPlayedAnimation ? 0 : 1),
    ).current;
    const fadeStaticAnim = React.useRef(
      new Animated.Value(hasPlayedAnimation ? 1 : 0),
    ).current;

    const logoStyle = React.useMemo(
      () => [styles.logo, theme.dark && {opacity: 0.4}],
      [theme.dark],
    );

    const staticImage = React.useMemo(
      () => (
        <Image
          source={
            theme.dark
              ? require('../../assets/pocketpal-dark.png')
              : require('../../assets/pocketpal-light.png')
          }
          style={logoStyle}
          resizeMode="contain"
        />
      ),
      [theme.dark, logoStyle],
    );

    React.useEffect(() => {
      if (!hasPlayedAnimation) {
        const timer = setTimeout(() => {
          Animated.parallel([
            Animated.timing(fadeGifAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(fadeStaticAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
          ]).start();
          hasPlayedAnimation = true;
        }, 1100);

        return () => clearTimeout(timer);
      }
    }, [fadeGifAnim, fadeStaticAnim]);

    return (
      <View style={styles.container} testID={testID}>
        <Animated.View style={[styles.imageContainer, {opacity: fadeGifAnim}]}>
          <Image
            source={require('../../assets/pocketpal.gif')}
            style={logoStyle}
            resizeMode="contain"
          />
        </Animated.View>
        <Animated.View
          style={[styles.imageContainer, {opacity: fadeStaticAnim}]}>
          {staticImage}
        </Animated.View>
      </View>
    );
  },
);
