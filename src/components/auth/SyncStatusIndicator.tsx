/**
 * SyncStatusIndicator - Sync Status Display Component
 *
 * Shows the current sync status and allows manual sync trigger.
 * Integrated with SyncStore for real-time status updates.
 *
 * @phase Phase1 - Sync UI Component
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { observer } from 'mobx-react-lite';

import { syncStore } from '../../store/SyncStore';
import { SyncStatus } from '../../services/sync/ISyncService';

/**
 * SyncStatusIndicator - Displays sync status and provides sync controls
 *
 * Features:
 * - Shows current sync status (idle, syncing, error)
 * - Displays last sync time
 * - Manual sync trigger button
 * - Error state with retry option
 */
const SyncStatusIndicator: React.FC = observer(() => {
  const getStatusColor = (): string => {
    switch (syncStore.syncStatus) {
      case 'syncing':
        return '#007AFF';
      case 'error':
        return '#FF3B30';
      case 'conflict':
        return '#FF9500';
      default:
        return '#34C759';
    }
  };

  const getStatusText = (): string => {
    switch (syncStore.syncStatus) {
      case 'syncing':
        return 'Syncing...';
      case 'error':
        return 'Sync Error';
      case 'conflict':
        return 'Conflict Detected';
      default:
        return 'Synced';
    }
  };

  const getStatusIcon = (): string => {
    switch (syncStore.syncStatus) {
      case 'syncing':
        return '🔄';
      case 'error':
        return '⚠️';
      case 'conflict':
        return '⚡';
      default:
        return '✅';
    }
  };

  const handleSyncPress = async (): Promise<void> => {
    if (syncStore.isSyncing) {
      return;
    }
    await syncStore.sync('both');
  };

  const formatLastSyncTime = (): string => {
    if (!syncStore.lastSyncAt) {
      return 'Never';
    }

    const now = Date.now();
    const diff = now - syncStore.lastSyncAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) {
      return 'Just now';
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F8F8F8',
        borderRadius: 8,
        marginHorizontal: 16,
        marginVertical: 8,
      }}
    >
      {/* Status Icon */}
      <Text style={{ fontSize: 16, marginRight: 8 }}>
        {syncStore.isSyncing ? (
          <ActivityIndicator size="small" color={getStatusColor()} />
        ) : (
          getStatusIcon()
        )}
      </Text>

      {/* Status Text */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '500',
            color: getStatusColor(),
          }}
        >
          {getStatusText()}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: '#999999',
            marginTop: 2,
          }}
        >
          Last sync: {formatLastSyncTime()}
        </Text>
      </View>

      {/* Sync Button */}
      {!syncStore.isSyncing && syncStore.syncStatus !== 'conflict' && (
        <TouchableOpacity
          onPress={handleSyncPress}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: '#007AFF',
            borderRadius: 6,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
            Sync Now
          </Text>
        </TouchableOpacity>
      )}

      {/* Retry Button (on error) */}
      {syncStore.syncStatus === 'error' && (
        <TouchableOpacity
          onPress={handleSyncPress}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: '#FF3B30',
            borderRadius: 6,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
            Retry
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default SyncStatusIndicator;
