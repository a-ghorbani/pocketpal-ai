import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from 'react-native';
import {Card, Button} from 'react-native-paper';
import {database} from '../../../../database';
import {chatSessionRepository} from '../../../../repositories/ChatSessionRepository';
import {palRepository} from '../../../../repositories/PalRepository';
import {useNavigation} from '@react-navigation/native';

// Define the collections we want to inspect
const COLLECTIONS = [
  'chat_sessions',
  'messages',
  'completion_settings',
  'global_settings',
  'local_pals',
  'cached_pals',
  'user_library',
  'sync_status',
];

const DatabaseInspectorScreen = () => {
  const navigation = useNavigation();
  const [collectionData, setCollectionData] = useState<{
    [key: string]: Array<any>;
  }>({});
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null,
  );
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);

  // Load data for all collections
  const loadAllCollections = async () => {
    const data: {[key: string]: Array<any>} = {};

    for (const collectionName of COLLECTIONS) {
      try {
        const records = await database.collections
          .get(collectionName)
          .query()
          .fetch();

        data[collectionName] = records.map(record => ({
          ...record._raw,
        }));
      } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        data[collectionName] = [];
      }
    }

    setCollectionData(data);
  };

  useEffect(() => {
    loadAllCollections();
  }, []);

  const resetChatMigration = async () => {
    try {
      await chatSessionRepository.resetMigration();
      Alert.alert('Chat migration reset successful', 'Please restart the app.');
    } catch (error) {
      console.error('Failed to reset chat migration:', error);
      Alert.alert(
        'Failed to reset chat migration',
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    }
  };

  const resetPalMigration = async () => {
    try {
      await palRepository.resetMigration();
      Alert.alert('Pal migration reset successful', 'Please restart the app.');
    } catch (error) {
      console.error('Failed to reset pal migration:', error);
      Alert.alert(
        'Failed to reset pal migration',
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    }
  };

  const renderCollectionList = () => {
    return (
      <Card style={styles.card}>
        <Card.Title title="Database Collections" />
        <Card.Content>
          {COLLECTIONS.map(collectionName => (
            <TouchableOpacity
              key={collectionName}
              style={styles.collectionItem}
              onPress={() => setSelectedCollection(collectionName)}>
              <Text style={styles.collectionName}>{collectionName}</Text>
              <Text style={styles.recordCount}>
                {collectionData[collectionName]?.length || 0} records
              </Text>
            </TouchableOpacity>
          ))}
        </Card.Content>
        <Card.Actions style={styles.cardActionsColumn}>
          <View style={styles.buttonRow}>
            <Button onPress={loadAllCollections} mode="contained">
              Refresh
            </Button>
          </View>
          <View style={styles.buttonRow}>
            <Button
              onPress={resetChatMigration}
              mode="outlined"
              style={styles.resetButton}>
              Reset Chat Migration
            </Button>
            <Button
              onPress={resetPalMigration}
              mode="outlined"
              style={styles.resetButton}>
              Reset Pal Migration
            </Button>
          </View>
        </Card.Actions>
      </Card>
    );
  };

  const renderRecordList = () => {
    if (!selectedCollection) {
      return null;
    }

    const records = collectionData[selectedCollection] || [];

    return (
      <Card style={styles.card}>
        <Card.Title
          title={`${selectedCollection} (${records.length})`}
          subtitle="Tap a record to view details"
        />
        <Card.Content>
          <ScrollView style={styles.recordList}>
            {records.length === 0 ? (
              <Text style={styles.emptyText}>No records found</Text>
            ) : (
              records.map(record => (
                <TouchableOpacity
                  key={record.id}
                  style={styles.recordItem}
                  onPress={() => setSelectedRecord(record)}>
                  <Text style={styles.recordId}>{record.id}</Text>
                  {record.title && (
                    <Text style={styles.recordTitle}>{record.title}</Text>
                  )}
                  {record.name && (
                    <Text style={styles.recordTitle}>{record.name}</Text>
                  )}
                  {record.session_id && (
                    <Text style={styles.recordSessionId}>
                      Session: {record.session_id}
                    </Text>
                  )}
                  {record.palshub_id && (
                    <Text style={styles.recordSessionId}>
                      PalsHub ID: {record.palshub_id}
                    </Text>
                  )}
                  {record.source && (
                    <Text style={styles.recordSessionId}>
                      Source: {record.source}
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Card.Content>
        <Card.Actions>
          <Button onPress={() => setSelectedCollection(null)}>Back</Button>
        </Card.Actions>
      </Card>
    );
  };

  // Find related records for a given record
  const findRelatedRecords = (record: any, collection: string) => {
    const relatedRecords: {[key: string]: any[]} = {};

    // If this is a chat_session, find related messages and completion_settings
    if (collection === 'chat_sessions') {
      const sessionId = record.id;
      const messages = (collectionData.messages || []).filter(
        msg => msg.session_id === sessionId,
      );
      const settings = (collectionData.completion_settings || []).filter(
        setting => setting.session_id === sessionId,
      );

      if (messages.length > 0) {
        relatedRecords.messages = messages;
      }

      if (settings.length > 0) {
        relatedRecords.completion_settings = settings;
      }
    }

    // If this is a message, find related chat_session
    if (collection === 'messages' && record.session_id) {
      const session = (collectionData.chat_sessions || []).find(
        s => s.id === record.session_id,
      );

      if (session) {
        relatedRecords.chat_sessions = [session];
      }
    }

    // If this is a completion_setting, find related chat_session
    if (collection === 'completion_settings' && record.session_id) {
      const session = (collectionData.chat_sessions || []).find(
        s => s.id === record.session_id,
      );

      if (session) {
        relatedRecords.chat_sessions = [session];
      }
    }

    // If this is a cached_pal, find related user_library entries
    if (collection === 'cached_pals' && record.palshub_id) {
      const userLibraryEntries = (collectionData.user_library || []).filter(
        entry => entry.palshub_id === record.palshub_id,
      );

      if (userLibraryEntries.length > 0) {
        relatedRecords.user_library = userLibraryEntries;
      }
    }

    // If this is a user_library entry, find related cached_pal
    if (collection === 'user_library' && record.palshub_id) {
      const cachedPal = (collectionData.cached_pals || []).find(
        pal => pal.palshub_id === record.palshub_id,
      );

      if (cachedPal) {
        relatedRecords.cached_pals = [cachedPal];
      }
    }

    return relatedRecords;
  };

  const renderRecordDetails = () => {
    if (!selectedRecord) {
      return null;
    }

    // Find the current record index and collection
    const records = collectionData[selectedCollection || ''] || [];
    const currentIndex = records.findIndex(
      record => record.id === selectedRecord.id,
    );

    // Determine if there are previous/next records
    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < records.length - 1;

    // Find related records
    const relatedRecords = findRelatedRecords(
      selectedRecord,
      selectedCollection || '',
    );

    return (
      <Card style={styles.card}>
        <Card.Title
          title="Record Details"
          subtitle={`${selectedCollection} (${currentIndex + 1}/${
            records.length
          })`}
        />
        <Card.Content>
          <ScrollView style={styles.recordDetails}>
            {Object.entries(selectedRecord).map(([key, value]) => (
              <View key={key} style={styles.detailItem}>
                <Text style={styles.detailKey}>{key}:</Text>
                <Text style={styles.detailValue}>
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </Text>
              </View>
            ))}

            {/* Related Records Section */}
            {Object.keys(relatedRecords).length > 0 && (
              <View style={styles.relatedRecordsSection}>
                <Text style={styles.relatedRecordsTitle}>Related Records:</Text>
                {Object.entries(relatedRecords).map(
                  ([collection, relatedItems]) => (
                    <View key={collection} style={styles.relatedCollection}>
                      <Text style={styles.relatedCollectionTitle}>
                        {collection} ({relatedItems.length})
                      </Text>
                      {relatedItems.map(record => (
                        <TouchableOpacity
                          key={record.id}
                          style={styles.relatedRecord}
                          onPress={() => {
                            setSelectedCollection(collection);
                            setSelectedRecord(record);
                          }}>
                          <Text style={styles.relatedRecordId}>
                            {record.id}
                          </Text>
                          {record.title && (
                            <Text style={styles.relatedRecordTitle}>
                              {record.title}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ),
                )}
              </View>
            )}
          </ScrollView>
        </Card.Content>
        <Card.Actions style={styles.cardActions}>
          <Button onPress={() => setSelectedRecord(null)} mode="outlined">
            Back
          </Button>
          <View style={styles.navigationButtons}>
            <Button
              onPress={() => setSelectedRecord(records[currentIndex - 1])}
              disabled={!hasPrevious}
              mode="text"
              icon="chevron-left">
              Prev
            </Button>
            <Button
              onPress={() => setSelectedRecord(records[currentIndex + 1])}
              disabled={!hasNext}
              mode="text"
              icon="chevron-right"
              contentStyle={styles.next}>
              Next
            </Button>
          </View>
        </Card.Actions>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Database Inspector</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content}>
        {selectedRecord
          ? renderRecordDetails()
          : selectedCollection
          ? renderRecordList()
          : renderCollectionList()}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2c3e50',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  collectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '500',
  },
  recordCount: {
    color: '#666',
  },
  recordList: {
    maxHeight: 400,
  },
  recordItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  recordId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  recordTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  recordSessionId: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#666',
  },
  recordDetails: {
    maxHeight: 500,
  },
  detailItem: {
    marginBottom: 8,
  },
  detailKey: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  detailValue: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navigationButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  relatedRecordsSection: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
  },
  relatedRecordsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  relatedCollection: {
    marginBottom: 12,
  },
  relatedCollectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  relatedRecord: {
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 4,
    marginLeft: 8,
  },
  relatedRecordId: {
    fontSize: 12,
    color: '#888',
  },
  relatedRecordTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  next: {
    flexDirection: 'row-reverse',
  },
  cardActionsColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  resetButton: {
    flex: 1,
  },
});

export default DatabaseInspectorScreen;
