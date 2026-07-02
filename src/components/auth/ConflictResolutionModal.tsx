/**
 * ConflictResolutionModal - Conflict Resolution UI
 *
 * Displays when sync conflict is detected.
 * Allows user to choose between local and remote versions.
 *
 * @phase Phase1 - Conflict Resolution UI
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { observer } from 'mobx-react-lite';

import { syncStore } from '../../store/SyncStore';

export type ConflictResolution = 'local' | 'remote' | 'merge';

interface ConflictInfo {
  collection: string;
  localData: any;
  remoteData: any;
  conflictField?: string;
}

interface ConflictResolutionModalProps {
  /**
   * Whether the modal is visible
   */
  visible: boolean;

  /**
   * Conflict information
   */
  conflict: ConflictInfo | null;

  /**
   * Callback when user resolves conflict
   */
  onResolve: (resolution: ConflictResolution) => void;

  /**
   * Callback when user cancels
   */
  onCancel: () => void;
}

/**
 * ConflictResolutionModal - Modal for resolving sync conflicts
 *
 * Features:
 * - Shows local and remote versions
 * - Allows choosing local, remote, or merge
 * - Displays conflicting fields
 */
const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = observer(
  ({ visible, conflict, onResolve, onCancel }) => {
    if (!visible || !conflict) {
      return null;
    }

    const renderDataComparison = () => {
      const local = conflict.localData;
      const remote = conflict.remoteData;

      // Simple comparison for demonstration
      const localUpdated = local.updatedAt
        ? new Date(local.updatedAt).toLocaleString()
        : 'Unknown';
      const remoteUpdated = remote.updatedAt
        ? new Date(remote.updatedAt).toLocaleString()
        : 'Unknown';

      return (
        <View style={styles.comparisonContainer}>
          {/* Local Version */}
          <View style={styles.versionCard}>
            <Text style={styles.versionTitle}>Local Version</Text>
            <Text style={styles.versionTime}>Updated: {localUpdated}</Text>
            <View style={styles.dataPreview}>
              <Text style={styles.dataText} numberOfLines={5}>
                {JSON.stringify(local, null, 2)}
              </Text>
            </View>
          </View>

          {/* VS Divider */}
          <View style={styles.divider}>
            <Text style={styles.dividerText}>VS</Text>
          </View>

          {/* Remote Version */}
          <View style={styles.versionCard}>
            <Text style={styles.versionTitle}>Remote Version</Text>
            <Text style={styles.versionTime}>Updated: {remoteUpdated}</Text>
            <View style={styles.dataPreview}>
              <Text style={styles.dataText} numberOfLines={5}>
                {JSON.stringify(remote, null, 2)}
              </Text>
            </View>
          </View>
        </View>
      );
    };

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onCancel}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Sync Conflict Detected</Text>
              <Text style={styles.subtitle}>
                Choose which version to keep for {conflict.collection}
              </Text>
            </View>

            {/* Data Comparison */}
            <ScrollView style={styles.content}>{renderDataComparison()}</ScrollView>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.localButton]}
                onPress={() => onResolve('local')}
              >
                <Text style={styles.buttonText}>Keep Local</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.remoteButton]}
                onPress={() => onResolve('remote')}
              >
                <Text style={styles.buttonText}>Keep Remote</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.mergeButton]}
                onPress={() => onResolve('merge')}
              >
                <Text style={styles.buttonText}>Merge (Latest Wins)</Text>
              </TouchableOpacity>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
  },
  content: {
    maxHeight: 300,
  },
  comparisonContainer: {
    flexDirection: 'column',
  },
  versionCard: {
    backgroundColor: '#F8F8F8',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  versionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  versionTime: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 8,
  },
  dataPreview: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 4,
    maxHeight: 100,
  },
  dataText: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#333333',
  },
  divider: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#007AFF',
  },
  actions: {
    flexDirection: 'column',
    marginTop: 16,
  },
  button: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  localButton: {
    backgroundColor: '#007AFF',
  },
  remoteButton: {
    backgroundColor: '#34C759',
  },
  mergeButton: {
    backgroundColor: '#FF9500',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  cancelText: {
    color: '#999999',
    fontSize: 14,
  },
});

export default ConflictResolutionModal;
