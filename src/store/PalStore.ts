import {makeAutoObservable} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import {v4 as uuidv4} from 'uuid';
import {
  AssistantFormData,
  PalType,
  RoleplayFormData,
  CameraPalFormData,
  VideoPalFormData,
} from '../components/PalsSheets/types';

export type Pal = {id: string} & (
  | AssistantFormData
  | RoleplayFormData
  | CameraPalFormData
  | VideoPalFormData
);
export type AssistantPal = Pal & {palType: PalType.ASSISTANT};
export type RoleplayPal = Pal & {palType: PalType.ROLEPLAY};
export type CameraPal = Pal & {palType: PalType.CAMERA};
export type VideoPal = Pal & {palType: PalType.VIDEO};

class PalStore {
  pals: Pal[] = [];

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'PalStore',
      properties: ['pals'],
      storage: AsyncStorage,
    });
  }

  addPal = (
    data:
      | AssistantFormData
      | RoleplayFormData
      | CameraPalFormData
      | VideoPalFormData,
  ) => {
    const newPal = {
      id: uuidv4(),
      ...data,
    } as Pal;
    this.pals.push(newPal);
  };

  updatePal = (
    id: string,
    data: Partial<
      | AssistantFormData
      | RoleplayFormData
      | CameraPalFormData
      | VideoPalFormData
    >,
  ) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      const currentPal = this.pals[palIndex];
      this.pals[palIndex] = {
        ...currentPal,
        ...data,
        palType: currentPal.palType,
      } as Pal;
    }
  };

  deletePal = (id: string) => {
    const palIndex = this.pals.findIndex(p => p.id === id);
    if (palIndex !== -1) {
      this.pals.splice(palIndex, 1);
    }
  };

  getPals = () => {
    return this.pals;
  };
}

export const palStore = new PalStore();

// Create the default "Lookie" CameraPal if it doesn't exist
export const initializeLookiePal = () => {
  // Check if Lookie already exists
  const lookiePal = palStore.pals.find(
    p => p.palType === PalType.CAMERA && p.name === 'Lookie',
  );

  if (!lookiePal) {
    // Create the Lookie pal
    const lookieData: CameraPalFormData = {
      name: 'Lookie',
      palType: PalType.CAMERA,
      systemPrompt:
        'You are Lookie, an AI assistant that analyzes images. ' +
        'Provide brief, concise descriptions of what you see in the camera. ' +
        'If unsure about something, be honest about it.',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#4CAF50', '#81C784'], // Green colors
    };

    palStore.addPal(lookieData);
  }
};

// Create the default "LiveLens" VideoPal if it doesn't exist
export const initializeLiveLensPal = () => {
  // Check if LiveLens already exists
  const liveLensPal = palStore.pals.find(
    p => p.palType === PalType.VIDEO && p.name === 'LiveLens',
  );

  if (!liveLensPal) {
    // Create the LiveLens pal
    const liveLensData: VideoPalFormData = {
      name: 'LiveLens',
      palType: PalType.VIDEO,
      systemPrompt:
        'You are LiveLens, an AI assistant that provides real-time commentary on video streams. ' +
        'Provide brief, concise descriptions of what you see in the camera feed. ' +
        'Focus on changes and interesting elements in the scene. ' +
        'If unsure about something, be honest about it.',
      useAIPrompt: false,
      isSystemPromptChanged: false,
      color: ['#2196F3', '#64B5F6'], // Blue colors
      captureInterval: 1000, // Default to 1 second
    };

    palStore.addPal(liveLensData);
  }
};
