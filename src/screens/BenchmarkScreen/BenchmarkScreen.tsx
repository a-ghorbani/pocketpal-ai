import React, {useState} from 'react';
import {View, ScrollView} from 'react-native';
import {observer} from 'mobx-react';
import {Text, Button, Card, ActivityIndicator, Icon} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

import {modelStore} from '../../store';
import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import type {Model} from '../../utils/types';
import {Menu} from '../../components';
import {BenchResultCard} from './BenchResultCard';
import {BenchmarkConfig, BenchmarkResult} from './types';

const DEFAULT_CONFIGS: BenchmarkConfig[] = [
  {pp: 512, tg: 128, pl: 1, nr: 3, label: 'Default'},
  {pp: 256, tg: 64, pl: 1, nr: 3, label: 'Fast'},
];

const BENCHMARK_PARAMS_METADATA = {
  pp: {
    validation: {min: 64, max: 512},
    descriptionKey: 'Number of prompt processing tokens',
  },
  tg: {
    validation: {min: 32, max: 512},
    descriptionKey: 'Number of text generation tokens',
  },
  pl: {
    validation: {min: 1, max: 4},
    descriptionKey: 'Pipeline parallel size',
  },
  nr: {
    validation: {min: 1, max: 10},
    descriptionKey: 'Number of repetitions',
  },
};

export const BenchmarkScreen: React.FC = observer(() => {
  const [isRunning, setIsRunning] = useState(false);
  const [storedResults, setStoredResults] = useState<BenchmarkResult[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<BenchmarkConfig>(
    DEFAULT_CONFIGS[0],
  );
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [localSliderValues, setLocalSliderValues] = useState<{
    [key: string]: number;
  }>({});

  const theme = useTheme();
  const styles = createStyles(theme);

  const handleModelSelect = async (model: Model) => {
    setShowModelMenu(false);
    if (model.id !== modelStore.activeModelId) {
      try {
        await modelStore.initContext(model);
        setSelectedModel(model);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Model initialization error:', error);
        }
      }
    } else {
      setSelectedModel(model);
    }
  };

  const handleSliderChange = (name: string, value: number) => {
    setSelectedConfig(prev => ({
      ...prev,
      [name]: value,
      label: 'Custom',
    }));
  };

  const runBenchmark = async () => {
    if (!modelStore.context || !modelStore.activeModel) {
      return;
    }

    setIsRunning(true);
    try {
      const {modelDesc, modelSize, modelNParams, ppAvg, ppStd, tgAvg, tgStd} =
        await modelStore.context.bench(
          selectedConfig.pp,
          selectedConfig.tg,
          selectedConfig.pl,
          selectedConfig.nr,
        );

      const result: BenchmarkResult = {
        config: selectedConfig,
        modelDesc,
        modelSize,
        modelNParams,
        ppAvg,
        ppStd,
        tgAvg,
        tgStd,
        timestamp: new Date().toISOString(),
        modelId: modelStore.activeModel.id,
      };

      setStoredResults(prev => [result, ...prev]);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Benchmark error:', error);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handlePresetSelect = (config: BenchmarkConfig) => {
    setSelectedConfig(config);
    setLocalSliderValues({});
  };

  const renderModelSelector = () => (
    <Menu
      visible={showModelMenu}
      onDismiss={() => setShowModelMenu(false)}
      anchor={
        <Button
          mode="outlined"
          onPress={() => setShowModelMenu(true)}
          style={styles.modelSelector}
          contentStyle={styles.modelSelectorContent}
          icon={({color}) => (
            <View style={styles.modelSelectorIconContainer}>
              <Icon source="chevron-down" size={24} color={color} />
            </View>
          )}>
          {selectedModel?.name ||
            modelStore.activeModel?.name ||
            'Select Model'}
        </Button>
      }>
      {modelStore.availableModels.map(model => (
        <Menu.Item
          key={model.id}
          onPress={() => handleModelSelect(model)}
          label={model.name}
          leadingIcon={
            model.id === modelStore.activeModelId ? 'check' : undefined
          }
        />
      ))}
    </Menu>
  );

  const renderSlider = ({
    name,
    step = 1,
  }: {
    name: keyof typeof BENCHMARK_PARAMS_METADATA;
    step?: number;
  }) => (
    <View style={styles.settingItem}>
      <Text variant="labelSmall" style={styles.settingLabel}>
        {name.toUpperCase()}
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={BENCHMARK_PARAMS_METADATA[name].validation.min}
        maximumValue={BENCHMARK_PARAMS_METADATA[name].validation.max}
        step={step}
        value={localSliderValues[name] ?? selectedConfig[name]}
        onValueChange={value => {
          setLocalSliderValues(prev => ({...prev, [name]: value}));
        }}
        onSlidingComplete={value => {
          handleSliderChange(name, value);
        }}
        thumbTintColor={theme.colors.primary}
        minimumTrackTintColor={theme.colors.primary}
      />
      <View style={styles.sliderDescriptionContainer}>
        <Text style={styles.description}>
          {BENCHMARK_PARAMS_METADATA[name].descriptionKey}
        </Text>
        <Text style={styles.settingValue}>
          {Number.isInteger(step)
            ? Math.round(
                localSliderValues[name] ?? selectedConfig[name],
              ).toString()
            : (localSliderValues[name] ?? selectedConfig[name]).toFixed(2)}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        <Card elevation={0} style={styles.card}>
          <Card.Content>
            <Text variant="bodyMedium" style={styles.description}>
              Measure model performance for prompt processing and text
              generation.
            </Text>

            {renderModelSelector()}

            {modelStore.loadingModel ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Initializing model...</Text>
              </View>
            ) : (
              <>
                {!modelStore.context ? (
                  <Text style={styles.warning}>
                    Please select and initialize a model first
                  </Text>
                ) : (
                  <>
                    <View style={styles.presetContainer}>
                      {DEFAULT_CONFIGS.map((config, index) => (
                        <Button
                          key={index}
                          mode={
                            selectedConfig === config ? 'contained' : 'outlined'
                          }
                          onPress={() => handlePresetSelect(config)}
                          style={styles.presetButton}>
                          {config.label}
                        </Button>
                      ))}
                    </View>

                    <View style={styles.slidersContainer}>
                      {renderSlider({name: 'pp'})}
                      {renderSlider({name: 'tg'})}
                      {/* {renderSlider({name: 'pl'})} */}
                      {renderSlider({name: 'nr'})}
                    </View>

                    <Button
                      mode="contained"
                      onPress={runBenchmark}
                      disabled={isRunning}
                      style={styles.button}>
                      {isRunning ? 'Running Benchmarks...' : 'Start Benchmark'}
                    </Button>

                    {isRunning && (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" />
                        <Text style={styles.loadingText}>
                          Running benchmarks...
                        </Text>
                      </View>
                    )}

                    {storedResults.length > 0 && (
                      <View style={styles.resultsContainer}>
                        <Text variant="titleMedium" style={styles.resultsTitle}>
                          Results:
                        </Text>
                        {storedResults.map((result, index) => {
                          return (
                            <BenchResultCard key={index} result={result} />
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
});
