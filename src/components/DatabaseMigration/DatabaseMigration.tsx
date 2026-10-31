import React from 'react';
import {View, ActivityIndicator, Text, StyleSheet} from 'react-native';
import {observer} from 'mobx-react-lite';
import {chatSessionStore} from '../../store/ChatSessionStore';
import {useTheme} from '../../hooks';

export const DatabaseMigration = observer(() => {
  const theme = useTheme();

  if (!chatSessionStore.isMigrating) {
    return null;
  }

  return (
    <View
      style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.text, {color: theme.colors.text}]}>
        Upgrading database...
      </Text>
      <Text style={[styles.subText, {color: theme.colors.textSecondary}]}>
        Please don't close the app. This may take a moment.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  subText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
