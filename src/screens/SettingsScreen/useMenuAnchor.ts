import type React from 'react';
import {useRef, useState} from 'react';
import type {HostInstance, View} from 'react-native';

export const useMenuAnchor = () => {
  const ref = useRef<HostInstance>(null);
  const [anchor, setAnchor] = useState<{x: number; y: number}>({x: 0, y: 0});
  const [visible, setVisible] = useState(false);

  const open = () =>
    ref.current?.measure((x, y, width, height, pageX, pageY) => {
      setAnchor({x: pageX, y: pageY + height});
      setVisible(true);
    });

  return {
    buttonRef: ref as unknown as React.Ref<View>,
    anchor,
    visible,
    open,
    close: () => setVisible(false),
  };
};

export type MenuAnchor = ReturnType<typeof useMenuAnchor>;
