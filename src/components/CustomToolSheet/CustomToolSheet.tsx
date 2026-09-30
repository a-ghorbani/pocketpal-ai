import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {View} from 'react-native';
import type {TextInput as RNTextInput} from 'react-native';

import {Button, SegmentedButtons, Switch, Text} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {customToolStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  isNonLoopback,
  secretNames,
} from '../../services/customTools/toolStatus';
import {validateDefinition} from '../../services/customTools/validator';
import type {
  CustomToolDefinition,
  CustomToolErrorCode,
  HttpMethod,
  ValidationIssue,
} from '../../services/customTools/types';

import {createStyles} from './styles';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MIN_SECRET_LENGTH = 4;

type FieldKey = 'name' | 'description' | 'url' | 'body' | 'schema';

/** Focus goes to the first offender in this order. */
const FIELD_ORDER: FieldKey[] = [
  'name',
  'description',
  'url',
  'body',
  'schema',
];

/** Codes absent here have no field of their own and stay in the sheet list. */
const FIELD_OF_CODE: Partial<Record<CustomToolErrorCode, FieldKey>> = {
  name_invalid: 'name',
  name_builtin: 'name',
  name_taken: 'name',
  description_empty: 'description',
  url_scheme: 'url',
  url_userinfo: 'url',
  url_placeholder_in_origin: 'url',
  body_not_allowed: 'body',
  body_placeholder_mixed: 'body',
  required_not_declared: 'schema',
  placeholder_undeclared: 'schema',
};

type FieldErrors = Partial<Record<FieldKey, string>>;

interface Row {
  key: string;
  value: string;
}

interface CustomToolSheetProps {
  isVisible: boolean;
  /** Existing definition to edit, or undefined to create a new one. */
  tool?: CustomToolDefinition;
  onClose: () => void;
}

const toRows = (record: Record<string, string> | undefined): Row[] =>
  Object.entries(record ?? {}).map(([key, value]) => ({key, value}));

const fromRows = (rows: Row[]): Record<string, string> | undefined => {
  const entries = rows.filter(row => row.key.trim().length > 0);
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries.map(row => [row.key.trim(), row.value]));
};

/**
 * Create and edit one HTTP tool. Secret inputs are write-only: a stored value
 * is never read back, only its set/unset state, following the search-provider
 * key sheet. Validator failures arrive as codes and are resolved to copy here,
 * so a raw code can never reach the screen.
 */
export const CustomToolSheet: React.FC<CustomToolSheetProps> = observer(
  ({isVisible, tool, onClose}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const strings = l10n.components.customToolSheet;

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [method, setMethod] = useState<HttpMethod>('GET');
    const [url, setUrl] = useState('');
    const [queryRows, setQueryRows] = useState<Row[]>([]);
    const [headerRows, setHeaderRows] = useState<Row[]>([]);
    const [bodyText, setBodyText] = useState('');
    const [schemaText, setSchemaText] = useState('');
    const [extract, setExtract] = useState('');
    const [fields, setFields] = useState('');
    const [template, setTemplate] = useState('');
    const [maxItems, setMaxItems] = useState('');
    const [maxChars, setMaxChars] = useState('');
    const [wrapUntrusted, setWrapUntrusted] = useState(true);
    const [timeoutMs, setTimeoutMs] = useState('15000');
    const [requiresConfirmation, setRequiresConfirmation] = useState(true);

    const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>(
      {},
    );
    const [storedSecretNames, setStoredSecretNames] = useState<string[]>([]);
    const [issues, setIssues] = useState<ValidationIssue[]>([]);
    const [localError, setLocalError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const fieldRefs: Record<FieldKey, React.RefObject<RNTextInput | null>> = {
      name: useRef<RNTextInput>(null),
      description: useRef<RNTextInput>(null),
      url: useRef<RNTextInput>(null),
      body: useRef<RNTextInput>(null),
      schema: useRef<RNTextInput>(null),
    };

    useEffect(() => {
      if (!isVisible) {
        return;
      }
      setIssues([]);
      setLocalError(null);
      setFieldErrors({});
      setSecretDrafts({});
      setName(tool?.name ?? '');
      setDescription(tool?.description ?? '');
      setMethod(tool?.request.method ?? 'GET');
      setUrl(tool?.request.url ?? '');
      setQueryRows(toRows(tool?.request.query));
      setHeaderRows(toRows(tool?.request.headers));
      setBodyText(
        tool?.request.body === undefined
          ? ''
          : JSON.stringify(tool.request.body, null, 2),
      );
      setSchemaText(
        JSON.stringify(
          tool?.parameters ?? {type: 'object', properties: {}},
          null,
          2,
        ),
      );
      setExtract(tool?.response?.extract ?? '');
      setFields((tool?.response?.fields ?? []).join(', '));
      setTemplate(tool?.response?.template ?? '');
      setMaxItems(
        tool?.response?.maxItems === undefined
          ? ''
          : String(tool.response.maxItems),
      );
      setMaxChars(
        tool?.response?.maxChars === undefined
          ? ''
          : String(tool.response.maxChars),
      );
      setWrapUntrusted(tool?.response?.wrapUntrusted !== false);
      setTimeoutMs(String(tool?.timeoutMs ?? 15000));
      setRequiresConfirmation(tool?.requiresConfirmation ?? true);

      if (tool) {
        customToolStore
          .getSecretNames(tool.id)
          .then(setStoredSecretNames)
          .catch(() => setStoredSecretNames([]));
      } else {
        setStoredSecretNames([]);
      }
    }, [isVisible, tool]);

    const draft = useMemo(() => {
      let parameters: CustomToolDefinition['parameters'] = {
        type: 'object',
        properties: {},
      };
      try {
        parameters = JSON.parse(schemaText);
      } catch {
        // Surfaced on save as schemaJsonInvalid.
      }
      let body: unknown;
      try {
        body = bodyText.trim() ? JSON.parse(bodyText) : undefined;
      } catch {
        body = undefined;
      }
      const response = {
        ...(extract.trim() ? {extract: extract.trim()} : {}),
        ...(fields.trim()
          ? {
              fields: fields
                .split(',')
                .map(field => field.trim())
                .filter(Boolean),
            }
          : {}),
        ...(template.trim() ? {template} : {}),
        ...(maxItems.trim() ? {maxItems: Number(maxItems)} : {}),
        ...(maxChars.trim() ? {maxChars: Number(maxChars)} : {}),
        ...(wrapUntrusted ? {} : {wrapUntrusted: false}),
      };
      return {
        name: name.trim(),
        description,
        parameters,
        request: {
          method,
          url: url.trim(),
          ...(fromRows(queryRows) ? {query: fromRows(queryRows)} : {}),
          ...(fromRows(headerRows) ? {headers: fromRows(headerRows)} : {}),
          ...(body === undefined ? {} : {body}),
        },
        ...(Object.keys(response).length > 0 ? {response} : {}),
        timeoutMs: Number(timeoutMs) || 15000,
        requiresConfirmation,
      };
    }, [
      name,
      description,
      method,
      url,
      queryRows,
      headerRows,
      bodyText,
      schemaText,
      extract,
      fields,
      template,
      maxItems,
      maxChars,
      wrapUntrusted,
      timeoutMs,
      requiresConfirmation,
    ]);

    const referencedSecrets = useMemo(() => {
      try {
        return secretNames({
          ...draft,
          id: tool?.id ?? 'draft',
        } as CustomToolDefinition);
      } catch {
        return [];
      }
    }, [draft, tool]);

    const showNonLoopbackWarning = useMemo(() => {
      if (!url.trim()) {
        return false;
      }
      try {
        return isNonLoopback({
          ...draft,
          id: 'draft',
        } as CustomToolDefinition);
      } catch {
        return false;
      }
    }, [draft, url]);

    const shortSecret = Object.values(secretDrafts).some(
      value => value.length > 0 && value.length < MIN_SECRET_LENGTH,
    );

    const updateRow = (
      rows: Row[],
      setRows: (next: Row[]) => void,
      index: number,
      patch: Partial<Row>,
    ) =>
      setRows(rows.map((row, i) => (i === index ? {...row, ...patch} : row)));

    const renderRows = (
      label: string,
      rows: Row[],
      setRows: (next: Row[]) => void,
      testPrefix: string,
    ) => (
      <View style={styles.section}>
        <Text variant="labelSmall" style={styles.sectionLabel}>
          {label}
        </Text>
        {rows.map((row, index) => (
          <View key={`${testPrefix}-${index}`} style={styles.row}>
            <TextInput
              testID={`${testPrefix}-key-${index}`}
              style={styles.rowInput}
              placeholder={strings.keyPlaceholder}
              value={row.key}
              autoCapitalize="none"
              onChangeText={key => updateRow(rows, setRows, index, {key})}
            />
            <TextInput
              testID={`${testPrefix}-value-${index}`}
              style={styles.rowInput}
              placeholder={strings.valuePlaceholder}
              value={row.value}
              autoCapitalize="none"
              onChangeText={value => updateRow(rows, setRows, index, {value})}
            />
            <Button
              testID={`${testPrefix}-remove-${index}`}
              mode="text"
              onPress={() => setRows(rows.filter((_row, i) => i !== index))}>
              {strings.removeRow}
            </Button>
          </View>
        ))}
        <Button
          testID={`${testPrefix}-add`}
          mode="text"
          onPress={() => setRows([...rows, {key: '', value: ''}])}>
          {strings.addRow}
        </Button>
      </View>
    );

    const messageFor = (issue: ValidationIssue): string => {
      const template_ =
        strings.errors[issue.code] ?? strings.errors.shape_invalid;
      return issue.params ? t(template_, issue.params) : template_;
    };

    /** Field errors first, so the offender is where the user is looking. */
    const showRejection = (rejected: ValidationIssue[], local: FieldErrors) => {
      const mapped: FieldErrors = {};
      const unmapped: ValidationIssue[] = [];
      for (const issue of rejected) {
        const field = FIELD_OF_CODE[issue.code];
        if (field && !mapped[field]) {
          mapped[field] = messageFor(issue);
        } else if (!field) {
          unmapped.push(issue);
        }
      }
      const next: FieldErrors = {...mapped, ...local};
      setFieldErrors(next);
      setIssues(unmapped);
      const first = FIELD_ORDER.find(field => next[field]);
      if (first) {
        fieldRefs[first].current?.focus();
      }
    };

    /**
     * `setSecrets` with a null value is the store's only delete signal, and an
     * empty draft is filtered out of the save patch, so this is the one way a
     * stored secret can be removed without deleting the tool.
     */
    const handleClearSecret = async (secret: string) => {
      if (!tool) {
        return;
      }
      const cleared = await customToolStore.setSecrets(tool.id, {
        [secret]: null,
      });
      if (!cleared) {
        setLocalError(strings.saveFailed);
        return;
      }
      setStoredSecretNames(previous => previous.filter(n => n !== secret));
      setSecretDrafts(previous => {
        const next = {...previous};
        delete next[secret];
        return next;
      });
    };

    const handleSave = async () => {
      setIssues([]);
      setLocalError(null);
      setFieldErrors({});

      // The JSON fields fall back to a parsed default in `draft`, so their own
      // parse failures have to be carried separately from the validator's.
      const local: FieldErrors = {};
      try {
        JSON.parse(schemaText);
      } catch {
        local.schema = strings.schemaJsonInvalid;
      }
      if (bodyText.trim()) {
        try {
          JSON.parse(bodyText);
        } catch {
          local.body = strings.bodyJsonInvalid;
        }
      }
      if (shortSecret) {
        setLocalError(strings.secretMinLength);
      }

      // Validated here only to place every rejection on its field in one pass;
      // the store validates again and remains the only writer.
      const checked = validateDefinition(draft, {
        peerNames: customToolStore.peerNamesExcluding(tool?.id),
      });
      const rejected = checked.ok ? [] : checked.issues;
      if (rejected.length > 0 || Object.keys(local).length > 0 || shortSecret) {
        showRejection(rejected, local);
        return;
      }

      const result = tool
        ? customToolStore.updateTool(tool.id, draft)
        : customToolStore.addTool(draft);
      if (!result.ok) {
        showRejection(result.issues, {});
        return;
      }

      const patch = Object.fromEntries(
        Object.entries(secretDrafts).filter(([, value]) => value.length > 0),
      );
      if (Object.keys(patch).length > 0) {
        const saved = await customToolStore.setSecrets(result.value.id, patch);
        if (!saved) {
          setLocalError(strings.saveFailed);
          return;
        }
      }
      onClose();
    };

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onClose}
        title={tool ? strings.editTitle : strings.createTitle}
        displayFullHeight>
        <Sheet.ScrollView
          contentContainerStyle={styles.container}
          testID="custom-tool-sheet">
          <TextInput
            ref={fieldRefs.name}
            testID="custom-tool-name"
            label={strings.nameLabel}
            placeholder={strings.namePlaceholder}
            value={name}
            autoCapitalize="none"
            onChangeText={setName}
            error={!!fieldErrors.name}
            helperText={fieldErrors.name}
          />
          <TextInput
            ref={fieldRefs.description}
            testID="custom-tool-description"
            label={strings.descriptionLabel}
            placeholder={strings.descriptionPlaceholder}
            value={description}
            onChangeText={setDescription}
            error={!!fieldErrors.description}
            helperText={fieldErrors.description}
          />

          <SegmentedButtons
            value={method}
            onValueChange={next => setMethod(next as HttpMethod)}
            buttons={METHODS.map(entry => ({value: entry, label: entry}))}
          />

          <TextInput
            ref={fieldRefs.url}
            testID="custom-tool-url"
            label={strings.urlLabel}
            placeholder={strings.urlPlaceholder}
            value={url}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUrl}
            error={!!fieldErrors.url}
            helperText={fieldErrors.url}
          />
          {showNonLoopbackWarning && (
            <Text style={styles.warning} testID="custom-tool-non-loopback">
              {strings.nonLoopbackWarning}
            </Text>
          )}

          {renderRows(
            strings.queryLabel,
            queryRows,
            setQueryRows,
            'custom-tool-query',
          )}
          {renderRows(
            strings.headersLabel,
            headerRows,
            setHeaderRows,
            'custom-tool-header',
          )}

          <TextInput
            ref={fieldRefs.body}
            testID="custom-tool-body"
            label={strings.bodyLabel}
            value={bodyText}
            multiline
            autoCapitalize="none"
            onChangeText={setBodyText}
            error={!!fieldErrors.body}
            helperText={fieldErrors.body}
          />

          <TextInput
            ref={fieldRefs.schema}
            testID="custom-tool-schema"
            label={strings.rawSchemaLabel}
            value={schemaText}
            multiline
            autoCapitalize="none"
            onChangeText={setSchemaText}
            error={!!fieldErrors.schema}
            helperText={fieldErrors.schema}
          />

          <View style={styles.section}>
            <Text variant="labelSmall" style={styles.sectionLabel}>
              {strings.responseLabel}
            </Text>
            <TextInput
              testID="custom-tool-extract"
              label={strings.extractLabel}
              value={extract}
              autoCapitalize="none"
              onChangeText={setExtract}
            />
            <TextInput
              testID="custom-tool-fields"
              label={strings.fieldsLabel}
              value={fields}
              autoCapitalize="none"
              onChangeText={setFields}
            />
            <TextInput
              testID="custom-tool-template"
              label={strings.templateLabel}
              value={template}
              onChangeText={setTemplate}
            />
            <TextInput
              testID="custom-tool-max-items"
              label={strings.maxItemsLabel}
              value={maxItems}
              keyboardType="numeric"
              onChangeText={setMaxItems}
            />
            <TextInput
              testID="custom-tool-max-chars"
              label={strings.maxCharsLabel}
              value={maxChars}
              keyboardType="numeric"
              onChangeText={setMaxChars}
            />
            <View style={styles.switchRow}>
              <Text>{strings.wrapUntrustedLabel}</Text>
              <Switch
                testID="custom-tool-wrap-untrusted"
                value={wrapUntrusted}
                onValueChange={setWrapUntrusted}
              />
            </View>
          </View>

          {referencedSecrets.length > 0 && (
            <View style={styles.section}>
              <Text variant="labelSmall" style={styles.sectionLabel}>
                {strings.secretsLabel}
              </Text>
              {referencedSecrets.map(secret => (
                <View key={secret} style={styles.section}>
                  <View style={styles.row}>
                    <Text style={styles.secretState}>
                      {`${secret} — ${
                        storedSecretNames.includes(secret)
                          ? strings.secretSet
                          : strings.secretNotSet
                      }`}
                    </Text>
                    <Button
                      testID={`custom-tool-secret-clear-${secret}`}
                      mode="text"
                      disabled={!tool || !storedSecretNames.includes(secret)}
                      onPress={() => handleClearSecret(secret)}>
                      {strings.secretClear}
                    </Button>
                  </View>
                  <TextInput
                    testID={`custom-tool-secret-${secret}`}
                    placeholder={strings.secretPlaceholder}
                    value={secretDrafts[secret] ?? ''}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={value =>
                      setSecretDrafts(previous => ({
                        ...previous,
                        [secret]: value,
                      }))
                    }
                  />
                </View>
              ))}
              {shortSecret && (
                <Text
                  style={styles.error}
                  testID="custom-tool-secret-too-short">
                  {strings.secretMinLength}
                </Text>
              )}
            </View>
          )}

          <TextInput
            testID="custom-tool-timeout"
            label={strings.timeoutLabel}
            value={timeoutMs}
            keyboardType="numeric"
            onChangeText={setTimeoutMs}
          />
          <View style={styles.switchRow}>
            <Text>{strings.requiresConfirmationLabel}</Text>
            <Switch
              testID="custom-tool-requires-confirmation"
              value={requiresConfirmation}
              onValueChange={setRequiresConfirmation}
            />
          </View>

          {localError && (
            <Text style={styles.error} testID="custom-tool-local-error">
              {localError}
            </Text>
          )}
          {issues.map(issue => (
            <Text
              key={`${issue.code}-${JSON.stringify(issue.params ?? {})}`}
              style={styles.error}
              testID={`custom-tool-error-${issue.code}`}>
              {messageFor(issue)}
            </Text>
          ))}
        </Sheet.ScrollView>

        <Sheet.Actions>
          <View style={styles.actions}>
            <Button
              testID="custom-tool-save"
              mode="contained"
              onPress={handleSave}>
              {strings.save}
            </Button>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
