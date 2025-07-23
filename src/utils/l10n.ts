/** Base chat l10n containing all required properties to provide localized copy. */
export const l10n = {
  en: {
    common: {
      cancel: 'Cancel',
      delete: 'Delete',
      dismiss: 'Dismiss',
      rename: 'Rename',
      reset: 'Reset',
      save: 'Save',
      update: 'Update',
      networkError: 'Network error. Please try again.',
      downloadETA: 'ETA',
      calculating: 'calculating...',
      second: 'sec',
      seconds: 'sec',
      year: 'year',
      years: 'years',
      month: 'month',
      months: 'months',
      week: 'week',
      weeks: 'weeks',
      day: 'day',
      days: 'days',
      hour: 'hour',
      hours: 'hours',
      minute: 'min',
      minutes: 'min',
      justNow: 'just now',
      ok: 'OK',
      close: 'Close',
      clear: 'Clear All',
      gallery: 'Gallery',
    },
    settings: {
      // Model Initialization Settings
      modelInitializationSettings: 'Model Initialization Settings',
      // Metal Settings
      metal: 'Metal',
      metalDescription: "Apple's hardware-accelerated API.",
      metalRequiresNewerIOS:
        'Metal acceleration requires iOS 18 or higher. Please upgrade your device to use this feature.',
      layersOnGPU: 'Layers on GPU: {{gpuLayers}}',
      // Context Size
      contextSize: 'Context Size',
      contextSizePlaceholder: 'Enter context size (min {{minContextSize}})',
      invalidContextSizeError:
        'Please enter a valid number (minimum {{minContextSize}})',
      modelReloadNotice: 'Model reload needed for changes to take effect.',
      // Advanced Settings
      advancedSettings: 'Advanced Settings',
      // Batch Size
      batchSize: 'Batch Size',
      batchSizeDescription: 'Batch size: {{batchSize}}{{effectiveBatch}}',
      effectiveLabel: 'effective',
      // Physical Batch Size
      physicalBatchSize: 'Physical Batch Size',
      physicalBatchSizeDescription:
        'Physical batch size: {{physicalBatchSize}}{{effectivePhysicalBatch}}',
      // Thread Count
      cpuThreads: 'CPU Threads',
      cpuThreadsDescription:
        'Using {{threads}} of {{maxThreads}} available threads',
      // Flash Attention
      flashAttention: 'Flash Attention',
      flashAttentionDescription: 'Enable Flash Attention for faster processing',
      // Cache Type K
      keyCacheType: 'Key Cache Type',
      keyCacheTypeDescription: 'Select the cache type for key computation',
      keyCacheTypeDisabledDescription:
        'Enable Flash Attention to change cache type',
      // Cache Type V
      valueCacheType: 'Value Cache Type',
      valueCacheTypeDescription: 'Select the cache type for value computation',
      valueCacheTypeDisabledDescription:
        'Enable Flash Attention to change cache type',
      // Model Loading Settings
      modelLoadingSettings: 'Model Loading Settings',
      // Auto Offload/Load
      autoOffloadLoad: 'Auto Offload/Load',
      autoOffloadLoadDescription: 'Offload model when app is in background.',
      // Auto Navigate to Chat
      autoNavigateToChat: 'Auto-Navigate to Chat',
      autoNavigateToChatDescription: 'Navigate to chat when loading starts.',
      // App Settings
      appSettings: 'App Settings',
      // Language
      language: 'Language',
      // Dark Mode
      darkMode: 'Dark Mode',
      // Display Memory Usage
      displayMemoryUsage: 'Display Memory Usage',
      displayMemoryUsageDescription: 'Display memory usage in the chat page.',
      // Export/Import Options
      exportOptions: 'Export Options',
      exportLegacyChats: 'Export Legacy Chats',
      exportLegacyChatsDescription:
        'Use this if migration failed or you need to recover old chat sessions.',
      exportButton: 'Export',
      importChats: 'Import Chat Sessions',
      importChatsDescription:
        'Import chat sessions from am (exported) JSON file.',
      importButton: 'Import',
      importSuccess: 'Successfully imported {{count}} chat session(s).',
      importError:
        'Failed to import chat sessions. Please check the file format.',
      // API Settings
      apiSettingsTitle: 'API Settings',
      // Hugging Face Token
      huggingFaceTokenLabel: 'Hugging Face Token',
      tokenIsSetDescription:
        'Token is set. Required for accessing gated models.',
      setTokenDescription:
        'Set a token to access gated models from Hugging Face.',
      setTokenButton: 'Set Token',
      useHfTokenLabel: 'Use HF Token',
      useHfTokenDescription:
        'Enable to use token for API requests. Disable if token is causing authentication issues.',
    },
    memory: {
      shortWarning: 'Memory Warning',
      warning:
        'Warning: Model size may exceed available memory. This could affect performance and stability of your device.',
      multimodalWarning:
        'This device may not have sufficient resources for multimodal models.',
      alerts: {
        memoryWarningTitle: 'Memory Warning',
        memoryWarningMessage:
          'This model may exceed available memory, which could cause instability. Continue loading?',
        multimodalWarningTitle: 'Device Performance Warning',
        multimodalWarningMessage:
          'This device may not have sufficient resources for multimodal models. Loading may cause instability. Continue anyway?',
        combinedWarningTitle: 'Performance Warning',
        combinedWarningMessage:
          'This model may exceed available memory and this device may not have sufficient resources for multimodal models. Loading may cause instability. Continue anyway?',
        cancel: 'Cancel',
        continue: 'Continue',
      },
    },
    storage: {
      checkFailed: 'Failed to check storage',
      lowStorage: 'Storage low! Model {{modelSize}} > {{freeSpace}} free',
    },
    generation: {
      modelNotInitialized: 'Model context not initialized',
      failedToGenerate: 'Failed to generate output',
    },
    models: {
      fileManagement: {
        fileAlreadyExists: 'File already exists',
        fileAlreadyExistsMessage:
          'A file with this name already exists. What would you like to do?',
        replace: 'Replace',
        keepBoth: 'Keep Both',
      },
      labels: {
        localModel: 'Local',
        hfModel: 'HF',
        unknownGroup: 'Unknown',
        availableToUse: 'Ready to Use',
        availableToDownload: 'Available to Download',
        useAddButtonForMore: 'Use + button to find more models',
      },
      vision: 'Vision',
      mmproj: 'Projector',
      multimodal: {
        settings: 'Multimodal Settings',
        projectionModels: 'Projection Models',
        noCompatibleModels: 'No compatible projection models found',
        noProjectionModels: 'No projection models available',
        selected: 'Selected',
        select: 'Select',
        download: 'Download',
        projectionNeededTitle: 'Projection Model Needed',
        projectionNeededMessage:
          'This model requires a projection model for multimodal capabilities.',
        projectionMissingWarning: 'Projection model missing',
        projectionMissingShort: 'Missing projection',
        reloadModelTitle: 'Reload Model',
        reloadModelMessage:
          'The model needs to be reloaded to apply the new projection model. Do you want to reload now?',
        reload: 'Reload',
        deleteProjectionTitle: 'Delete Projection Model',
        deleteProjectionMessage:
          'Are you sure you want to delete this projection model?',
        cannotDeleteTitle: 'Cannot Delete',
        // Vision control strings
        visionControls: {
          enableVision: 'Enable vision capabilities',
          disableVision: 'Disable vision capabilities',
          visionEnabled: 'Vision enabled',
          visionDisabled: 'Vision disabled',
          textOnlyMode: 'Text only',
          visionMode: 'Vision enabled',
          downloadWithVision: 'Download with vision',
          downloadTextOnly: 'Download text only',
          visionToggleDescription: 'Enable image processing capabilities',
          projectionModelSize: '+{size} projection model',
          visionModeDescription: 'Process images and text',
          textOnlyModeDescription: 'Process text only',
          includesVisionCapability: 'Includes vision capability',
          requiresProjectionModel:
            'Download a compatible projection model first',
        },
        cannotDeleteActive: 'This projection model is currently active.',
        cannotDeleteInUse:
          'This projection model is used by downloaded LLM models:',
        dependentModels: 'Dependent models:',
        visionWillBeDisabled:
          'Vision capabilities will be disabled for these models.',
      },
      buttons: {
        addFromHuggingFace: 'Add from Hugging Face',
        addLocalModel: 'Add Local Model',
        reset: 'Reset',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Face Models',
        menuTitleDownloaded: 'Downloaded Models',
        menuTitleGrouped: 'Group by Model Type',
        menuTitleReset: 'Reset Models List',
      },
      modelsResetDialog: {
        proceedWithReset: 'Proceed with Reset',
        confirmReset: 'Confirm Reset',
      },
      chatTemplate: {
        label: 'Base Chat Template:',
      },
      details: {
        title: 'Available GGUF Files',
      },
      modelFile: {
        alerts: {
          cannotRemoveTitle: 'Cannot Remove',
          modelPreset: 'The model is preset.',
          downloadedFirst:
            'The model is downloaded. Please delete the file first.',
          removeTitle: 'Remove Model',
          removeMessage:
            'Are you sure you want to remove this model from the list?',
          removeError: 'Failed to remove the model.',
          alreadyDownloadedTitle: 'Model Already Downloaded',
          alreadyDownloadedMessage: 'The model is already downloaded.',
          deleteTitle: 'Delete Model',
          deleteMessage:
            'Are you sure you want to delete this downloaded model?',
        },
        buttons: {
          remove: 'Remove',
        },
        warnings: {
          storage: {
            message: 'Not enough storage space available.',
            shortMessage: 'Low Storage',
          },
          memory: {
            message:
              "Model size is close to or exceeds your device's total memory. This may cause unexpected behavior.",
          },
          legacy: {
            message: 'Legacy quantization format - model may not run.',
            shortMessage: 'Legacy quantization',
          },
          multiple: '{count} Warnings',
        },
        labels: {
          downloadSpeed: '{speed}',
        },
      },
      search: {
        noResults: 'No models found',
        loadingMore: 'Loading more...',
        searchPlaceholder: 'Search Hugging Face models',
        modelUpdatedLong: 'Updated {{time}} ago',
        modelUpdatedShort: '{{time}} ago',
        modelUpdatedJustNowLong: 'Updated just now',
        modelUpdatedJustNowShort: 'just now',
        errorOccurred: 'Unable to load models. Please try again.',
      },
      modelCard: {
        alerts: {
          deleteTitle: 'Delete Model',
          deleteMessage:
            'Are you sure you want to delete this downloaded model?',
          removeTitle: 'Remove Model',
          removeMessage:
            'Are you sure you want to remove this model from the list?',
        },
        buttons: {
          settings: 'Settings',
          download: 'Download',
          remove: 'Remove',
          load: 'Load',
          offload: 'Offload',
        },
        labels: {
          skills: 'Skills: ',
        },
      },
      modelSettings: {
        template: {
          label: 'Template:',
          editButton: 'Edit',
          dialogTitle: 'Edit Chat Template',
          note1:
            'Note: Changing the template may alter BOS, EOS, and system prompt.',
          note2: "Uses Nunjucks. Leave empty to use model's template.",
          placeholder: 'Enter your chat template here...',
          closeButton: 'Close',
        },
        stopWords: {
          label: 'STOP WORDS',
          placeholder: 'Add new stop word',
        },
        tokenSettings: {
          bos: 'BOS',
          eos: 'EOS',
          addGenerationPrompt: 'Add Generation Prompt',
          bosTokenPlaceholder: 'BOS Token',
          eosTokenPlaceholder: 'EOS Token',
          systemPrompt: 'System Prompt',
        },
      },
      modelDescription: {
        size: 'Size: ',
        parameters: 'Parameters: ',
        separator: ' | ',
        notAvailable: 'N/A',
      },
      modelCapabilities: {
        questionAnswering: 'Question Answering',
        summarization: 'Summarization',
        reasoning: 'Reasoning',
        roleplay: 'Role-play',
        instructions: 'Instruction following',
        code: 'Code generation',
        math: 'Math solving',
        multilingual: 'Multilingual',
        rewriting: 'Rewriting',
        creativity: 'Creative writing',
        vision: 'Vision',
      },
    },
    completionParams: {
      include_thinking_in_context:
        'Include AI thinking/reasoning parts in the context sent to the model. Disabling this can save context space. It might impact performance.',
      jinja:
        'Enable Jinja templating for chat formatting. When enabled, uses Jinja-based chat template processing for better compatibility with modern models.',
      grammar:
        'Enforce specific grammar rules to ensure the generated text follows a particular structure or format',
      stop: 'Define specific phrases that will stop text generation',
      n_predict: 'Set how long the generated response should be (in tokens)',
      n_probs: 'Show probability scores for alternative words.',
      top_k:
        'Control creativity by limiting word choices to the K most likely options. Lower values make responses more focused',
      top_p:
        'Balance creativity and coherence. Higher values (near 1.0) allow more creative but potentially less focused responses',
      min_p:
        'The minimum probability for a token to be considered. Filter out unlikely words to reduce nonsensical or out-of-context responses',
      temperature:
        'Control creativity vs predictability. Higher values make responses more creative but less focused',
      penalty_last_n:
        'How far back to check for repetition. Larger values help prevent long-term repetition',
      penalty_repeat:
        'Discourage word repetition. Higher values make responses use more diverse language',
      penalty_freq:
        'Penalize overused words. Higher values encourage using a broader vocabulary',
      penalty_present:
        'Reduce repetition of themes and ideas. Higher values encourage more diverse content',
      mirostat:
        'Enable advanced control over response creativity. Set to 1 or 2 (smoother) for smart, real-time adjustments to randomness and coherence.',
      mirostat_tau:
        'Set the target creativity level for Mirostat. Higher values allow for more diverse and imaginative responses, while lower values ensure more focused outputs.',
      mirostat_eta:
        'How quickly Mirostat adjusts creativity. Higher values mean faster adjustments',
      dry_multiplier:
        "Strength of the DRY (Don't Repeat Yourself) feature. Higher values strongly prevent repetition",
      dry_base:
        'Base penalty for repetition in DRY mode. Higher values are more aggressive at preventing repetition',
      dry_allowed_length:
        'How many words can repeat before DRY penalty kicks in',
      dry_penalty_last_n: 'How far back to look for repetition in DRY mode',
      dry_sequence_breakers:
        'Symbols that reset the repetition checker in DRY mode',
      ignore_eos:
        'Continue generating even if the model wants to stop. Useful for forcing longer responses',
      logit_bias:
        'Influence how likely specific words are to appear in the response',
      seed: 'Set the random number generator seed. Useful for reproducible results',
      xtc_probability:
        'Set the chance for token removal via XTC sampler. 0 is disabled',
      xtc_threshold:
        'Set a minimum probability threshold for tokens to be removed via XTC sampler. (> 0.5 disables XTC)',
      typical_p:
        'Enable locally typical sampling with parameter p. 1.0 is disabled',
    },
    about: {
      screenTitle: 'App Info',
      description:
        'An app that brings language models directly to your phone. Sits on the shoulders of llama.cpp and llama.rn.',
      supportProject: 'Support the Project',
      supportProjectDescription:
        'If you enjoy using PocketPal AI, please consider supporting the project by:',
      githubButton: 'Star on GitHub',
      orText: 'or',
      orBy: 'or by',
      sponsorButton: 'Become a Sponsor',
      versionCopiedTitle: 'Version copied',
      versionCopiedDescription:
        'Version information has been copied to clipboard',
    },
    feedback: {
      title: 'Send Feedback',
      description:
        'Your voice matters! Tell us how PocketPal AI is helping you and what we can do to make it even more useful.',
      shareThoughtsButton: 'Sharing your thoughts',
      useCase: {
        label: 'What are you using PocketPal AI for?',
        placeholder: 'e.g., summarization, roleplay, etc.',
      },
      featureRequests: {
        label: 'Feature Request',
        placeholder: 'What features would you like to see?',
      },
      generalFeedback: {
        label: 'General Feedback',
        placeholder: 'Share any other thoughts you may have.',
      },
      usageFrequency: {
        label: 'How often do you use PocketPal AI? (Optional)',
        options: {
          daily: 'Daily',
          weekly: 'Weekly',
          monthly: 'Monthly',
          rarely: 'Rarely',
        },
      },
      email: {
        label: 'Contact Email (Optional)',
        placeholder: 'Your email address',
      },
      submit: 'Submit Feedback',
      validation: {
        required: 'Please provide at least some feedback',
      },
      success: 'Thank you for your feedback!',
      error: {
        general: 'Error sending feedback. Please try again.',
      },
    },
    components: {
      attachmentButton: {
        attachmentButtonAccessibilityLabel: 'Send media',
      },
      bubble: {
        timingsString:
          '{{predictedMs}}ms per token, {{predictedPerSecond}} tokens per second',
      },
      exportUtils: {
        fileSaved: 'File Saved',
        fileSavedMessage:
          'The file has been saved to your Downloads folder as {{filename}}',
        share: 'Share',
        ok: 'OK',
        shareError: 'Share Error',
        shareErrorMessage: 'Could not share the file. Please try again.',
        saveError: 'Error saving to Downloads',
        saveOptions: 'Save Options',
        saveOptionsMessage:
          'Unable to save directly to Downloads. Would you like to share the file instead?',
        cancel: 'Cancel',
        shareContentErrorMessage:
          'Could not share the content. Please try again.',
        exportError: 'Export Error',
        exportErrorMessage:
          'There was an error exporting the file. Please try again.',
        permissionRequired: 'Storage Permission Required',
        permissionMessage:
          'We need permission to save your export into the Download folder.',
        permissionDenied: 'Permission Denied',
        permissionDeniedMessage:
          'Without storage permission, the export feature will be disabled.',
        continue: 'Continue',
      },
      thinkingBubble: {
        reasoning: 'Reasoning',
      },
      chatEmptyPlaceholder: {
        noModelsTitle: 'No Models Available',
        noModelsDescription:
          'Download a model to start chatting with PocketPal',
        noModelsButton: 'Download Model',
        activateModelTitle: 'Activate Model To Get Started',
        activateModelDescription:
          'Select the model and download it. After downloading, tap Load next to the model and start chatting.',
        activateModelButton: 'Select Model',
        loading: 'Loading...',
      },
      chatInput: {
        inputPlaceholder: 'Message',
        thinkingToggle: {
          enableThinking: 'Enable thinking mode',
          disableThinking: 'Disable thinking mode',
          thinkingEnabled: 'Thinking mode enabled',
          thinkingDisabled: 'Thinking mode disabled',
          thinkText: 'Think',
        },
      },
      chatGenerationSettingsSheet: {
        invalidValues: 'Invalid Values',
        invalidNumericValuesMessage: 'Must be a valid number',
        pleaseCorrect: 'Please correct the following:',
        ok: 'OK',
        saveChanges: 'Save Changes',
        saveAsPreset: 'Save as Preset',
        title_session: 'Chat Generation Settings (Session)',
        title_preset: 'Chat Generation Settings (Preset)',
        resetToSystemDefaults: 'Reset to System Defaults',
        resetToPreset: 'Reset to Preset',
        applytoPresetAlert: {
          title: 'Success',
          message: 'These settings will be applied to all future sessions',
        },
      },
      chatHeaderTitle: {
        defaultTitle: 'Chat',
      },
      fileMessage: {
        fileButtonAccessibilityLabel: 'File',
      },
      chatPalModelPickerSheet: {
        modelsTab: 'Models',
        palsTab: 'Pals',
        noPal: 'No Pal',
        disablePal: 'Disable active pal',
        noDescription: 'No description',
        assistantType: 'Assistant',
        roleplayType: 'Roleplay',
        videoType: 'Video',
        confirmationTitle: 'Confirmation',
        modelSwitchMessage:
          "This pal has a different default model ({{modelName}}). Would you like to switch to the pal's default model?",
        keepButton: 'Keep',
        switchButton: 'Switch',
      },
      downloadErrorDialog: {
        downloadFailedTitle: 'Download Failed',
        downloadFailedMessage: 'Failed to download model: {message}',
        unauthorizedTitle: 'Authentication Failed',
        unauthorizedMessage:
          'Your Hugging Face token appears to be invalid or expired. Please update your token in the settings.',
        forbiddenTitle: 'Access Denied',
        forbiddenMessage:
          'You do not have permission to access this model. Please ensure:',
        forbiddenSteps: [
          'Your token has "read" permission',
          'You requested and were granted access to this model',
          'The model owner approved your access request',
        ],
        getTokenTitle: 'Get Hugging Face Token',
        getTokenMessage:
          'This model requires a Hugging Face token to download.',
        getTokenSteps: [
          'Go to huggingface.co and sign in',
          'Navigate to Settings > Access Tokens',
          'Create a new token with "read" access',
          'Copy the token and paste it in the token field',
        ],
        tokenDisabledTitle: 'Token is Disabled',
        tokenDisabledMessage:
          'You have a Hugging Face token set, but it is currently disabled. This model requires a token to download. Enable your token to continue.',
        enableAndRetry: 'Enable and Retry',
        goToSettings: 'Go to Settings',
        tryAgain: 'Try Again',
        viewOnHuggingFace: 'View Model on HF ↗',
      },
      headerRight: {
        deleteChatTitle: 'Delete Chat',
        deleteChatMessage: 'Are you sure you want to delete this chat?',
        generationSettings: 'Generation settings',
        model: 'Model',
        duplicateChatHistory: 'Duplicate chat history',
        makeChatTemporary: 'Make chat temporary',
        export: 'Export/Import',
        exportCurrentSession: 'Export current session',
        exportAllSessions: 'Export all sessions',
        exportChatSession: 'Export chat session',
        importSessions: 'Import sessions',
      },
      hfTokenSheet: {
        title: 'Hugging Face Token',
        description: 'Required to access gated models',
        inputLabel: 'Personal Access Token',
        inputPlaceholder: 'Paste your token here',
        save: 'Save Token',
        saved: 'Token saved successfully',
        reset: 'Reset Token',
        resetSuccess: 'Token removed successfully',
        instructions: 'How to get a token:',
        instructionsSteps: [
          'Go to huggingface.co and sign in',
          'Navigate to Settings > Access Tokens',
          'Create a new token with "read" access',
          'Copy the token and paste it below',
        ],
        getTokenLink: 'Get a token from huggingface.co ↗',
        error: {
          saving: 'Error saving token',
          missing: 'Hugging Face token required',
          invalid: 'Invalid or expired token',
          gatedModelAccess: 'Access to this gated model was denied',
        },
        gatedModelIndicator: 'Requires Token',
        tokenRequired: 'This model requires a Hugging Face access token',
        searchErrorHint:
          'Your Hugging Face API token is invalid or expired. To continue searching, please either remove the token or disable token authentication in Settings.',
        disableAndRetry: 'Disable Token & Retry',
      },
      modelSettingsSheet: {
        modelSettings: 'Model Settings',
        saveChanges: 'Save Changes',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Face Models',
        menuTitleDownloaded: 'Downloaded Models',
        menuTitleGrouped: 'Group by Model Type',
        menuTitleReset: 'Reset Models List',
      },
      modelsResetDialog: {
        proceedWithReset: 'Proceed with Reset',
        confirmReset: 'Confirm Reset',
      },
      assistantPalSheet: {
        title: {
          create: 'Create Assistant Pal',
          edit: 'Edit Assistant Pal',
        },
        palName: 'Pal Name',
        palNamePlaceholder: 'Name',
        defaultModel: 'Default Model',
        defaultModelPlaceholder: 'Select model',
        validation: {
          generatingPromptRequired: 'Generating prompt is required',
          promptModelRequired: 'Prompt generation model is required',
        },
        create: 'Create',
      },
      modelNotAvailable: {
        noModelsDownloaded:
          'You do not have any models downloaded yet. Please download a model first.',
        downloadAModel: 'Download a model',
        defaultModelNotDownloaded:
          'Default model is not downloaded yet. Please download it first.',
        cancelDownload: 'Cancel download',
        download: 'Download',
      },
      roleplayPalSheet: {
        title: {
          create: 'Create Roleplay Pal',
          edit: 'Edit Roleplay Pal',
        },
        palName: 'Pal Name',
        palNamePlaceholder: 'Name',
        defaultModel: 'Default Model',
        defaultModelPlaceholder: 'Select model',
        descriptionSection: 'Description',
        world: 'World',
        worldPlaceholder: 'Fantasy',
        location: 'Location',
        locationPlaceholder: 'Enchanted Forest',
        locationSublabel: 'Where does the story take place?',
        aiRole: "AI's Role",
        aiRolePlaceholder: 'Eldara, a mischievous forest sprite',
        aiRoleSublabel: 'Set the role for character',
        userRole: 'User Role',
        userRolePlaceholder: 'Sir Elandor, a brave knight',
        userRoleSublabel: 'Who are you?',
        situation: 'Situation',
        situationPlaceholder: 'Rescue mission, solving a mystery',
        toneStyle: 'Tone/Style',
        toneStylePlaceholder: 'Serious',
        validation: {
          promptModelRequired: 'Prompt generation model is required',
        },
        create: 'Create',
      },
      lookiePalSheet: {
        title: {
          create: 'Create Lookie Pal',
          edit: 'Edit Lookie Pal',
        },
        palName: 'Pal Name',
        palNamePlaceholder: 'Enter a name for your Lookie Pal',
        visionModel: 'Vision Model',
        visionModelPlaceholder: 'Select a vision model',
        requiredModelsSection: 'Required Models',
        captureInterval: 'Capture Interval',
        captureIntervalHelper:
          'Time between automatic captures in milliseconds',
        create: 'Create',
      },
      sendButton: {
        accessibilityLabel: 'Send',
      },
      systemPromptSection: {
        sectionTitle: 'System Prompt',
        useAIPrompt: 'Use AI to generate system prompt',
        modelSelector: {
          label: 'Select Model for Generation*',
          sublabel: 'Recommended: Llama 3.2 3B or Qwen2.5 3B.',
          placeholder: 'Select model',
        },
        generatingPrompt: {
          label: 'Generating Prompt',
          placeholder: 'Enter prompt for generation',
        },
        buttons: {
          loadingModel: 'Loading model...',
          stopGenerating: 'Stop Generating',
          generatePrompt: 'Generate System Prompt',
        },
        systemPrompt: {
          label: 'System Prompt',
          sublabel:
            'Feel free to edit and experiment to find the optimal prompt for your scenario',
          placeholder: 'You are a helpful assistant',
        },
        warnings: {
          promptChanged: 'System prompt has been manually changed',
        },
      },
      sidebarContent: {
        menuItems: {
          chat: 'Chat',
          models: 'Models',
          pals: 'Pals',
          benchmark: 'Benchmark',
          settings: 'Settings',
          appInfo: 'App Info',
          testCompletion: 'Test Completion',
        },
        deleteChatTitle: 'Delete Chat',
        deleteChatMessage: 'Are you sure you want to delete this chat?',
        dateGroups: {
          today: 'Today',
          yesterday: 'Yesterday',
          thisWeek: 'This week',
          lastWeek: 'Last week',
          twoWeeksAgo: '2 weeks ago',
          threeWeeksAgo: '3 weeks ago',
          fourWeeksAgo: '4 weeks ago',
          lastMonth: 'Last month',
          older: 'Older',
        },
      },
      usageStats: {
        tooltip: {
          title: 'Memory Usage',
          used: 'Used: ',
          total: 'Total: ',
          usage: 'Usage: ',
        },
        byteSizes: ['Bytes', 'KB', 'MB', 'GB'],
      },
      chatView: {
        menuItems: {
          copy: 'Copy',
          regenerate: 'Regenerate',
          regenerateWith: 'Regenerate with',
          edit: 'Edit',
        },
      },
      palHeaderRight: {
        exportAllPals: 'Export all pals',
        importPals: 'Import pals',
        importSuccess: 'Successfully imported {{count}} pal(s).',
        importError: 'Failed to import pals. Please check the file format.',
      },
    },
    palsScreen: {
      systemPrompt: 'System Prompt',
      videoAnalysis: 'Video Analysis',
      videoAnalysisDescription:
        "This is a video-based AI assistant that provides real-time commentary on video streams from your device's camera.",
      captureInterval: 'Capture Interval',
      captureIntervalUnit: 'ms',
      world: 'World',
      toneStyle: 'Tone/Style',
      aiRole: "AI's Role",
      userRole: 'My Role',
      prompt: 'Prompt',
      assistant: 'Assistant',
      roleplay: 'Roleplay',
      video: 'Video',
      deletePal: 'Delete Pal',
      deletePalMessage: 'Are you sure you want to delete this pal?',
      missingModel: 'Missing Model',
      missingModelMessage:
        'The default model "{{modelName}}" for this pal is not available. Please download it in the edit sheet or select a different model.',
    },
    validation: {
      nameRequired: 'Name is required',
      systemPromptRequired: 'System prompt is required',
      worldRequired: 'World is required',
      locationRequired: 'Location is required',
      aiRoleRequired: "AI's role is required",
      userRoleRequired: 'User role is required',
      situationRequired: 'Situation is required',
      toneStyleRequired: 'Tone/Style is required',
    },
    camera: {
      permissionTitle: 'Camera Permission Required',
      permissionMessage: 'PocketPal needs camera access to analyze images',
      requestingPermission: 'Requesting camera permission...',
      noDevice: 'No camera device found',
      errorTitle: 'Camera Error',
      errorMessage: 'An error occurred while taking the photo',
      flip: 'Flip',
      analyzing: 'Analyzing image...',
      startCamera: 'Start Camera',
      stopCamera: 'Stop Camera',
      promptPlaceholder: 'What do you want to know about this image?',
      takePhoto: 'Camera',
    },
    video: {
      permissionTitle: 'Camera Permission Required',
      permissionMessage: 'PocketPal needs camera access for video analysis',
      requestingPermission: 'Requesting camera permission...',
      noDevice: 'No camera device found',
      errorTitle: 'Camera Error',
      errorMessage: 'An error occurred with the camera',
      flip: 'Flip',
      analyzing: 'Analyzing video...',
      startCamera: 'Start Camera',
      stopCamera: 'Stop Camera',
      promptPlaceholder: 'What do you want to know about this video?',
      captureInterval: 'Capture Interval',
      captureIntervalUnit: 'ms',
      liveCommentary: 'Live Commentary',
      emptyPlaceholder: {
        title: 'Welcome to Lookie',
        subtitle: 'Private On-Device Real-time Video Analysis',
        experimentalNotice:
          'This is an experimental feature. Accuracy depends on the selected model, speed depends on your device specs, and some models might fail.',
        howToUse: 'How to use:',
        step1: '• Edit the prompt (optional) to guide the analysis',
        step2: '• Tap the camera button to start live video analysis',
        step3: '• Adjust snapshot frequency while camera is active',
        step4: '• Switch to another pal for normal text chat',
      },
    },
    screenTitles: {
      chat: 'Chat',
      models: 'Models',
      pals: 'Pals (experimental)',
      benchmark: 'Benchmark',
      settings: 'Settings',
      appInfo: 'App Info',
      testCompletion: 'Test Completion',
    },
    chat: {
      conversationReset: 'Conversation reset!',
      modelNotLoaded: 'Model not loaded. Please initialize the model.',
      completionFailed: 'Completion failed: ',
      loadingModel: 'Loading model ...',
      typeYourMessage: 'Type your message here',
      load: 'Load',
      goToModels: 'Go to Models',
      readyToChat: 'Ready to chat? Load the last used model.',
      pleaseLoadModel: 'Load a model to chat.',
      multimodalNotEnabled:
        'Multimodal is not enabled for this model. Images will be displayed but not processed by the AI.',
    },
    benchmark: {
      title: 'Benchmark',
      modelSelector: {
        prompt: 'Select Model',
      },
      buttons: {
        advancedSettings: 'Advanced Settings',
        startTest: 'Start Test',
        runningTest: 'Running Test...',
        clearAll: 'Clear All',
        done: 'Done',
        cancel: 'Cancel',
        delete: 'Delete',
        share: 'Share',
        sharing: 'Sharing...',
        viewRawData: 'View Raw Data',
        hideRawData: 'Hide Raw Data',
      },
      messages: {
        pleaseSelectModel: 'Please select and initialize a model first',
        testWarning:
          'Note: Test could run for up to 2-5 minutes for larger models and cannot be interrupted once started.',
        keepScreenOpen: 'Please keep this screen open.',
        initializingModel: 'Initializing model...',
        modelMaxValue: '(max: {{maxValue}})',
      },
      dialogs: {
        advancedSettings: {
          title: 'Advanced Settings',
          testProfile: 'Test Profile',
          customParameters: 'Custom Parameters',
          description:
            'Fine-tune the benchmark parameters for specific testing scenarios.',
        },
        deleteResult: {
          title: 'Delete Result',
          message: 'Are you sure you want to delete this benchmark result?',
        },
        clearAllResults: {
          title: 'Clear All Results',
          message: 'Are you sure you want to delete all benchmark results?',
        },
        shareResults: {
          title: 'Share Benchmark Results',
          sharedDataTitle: 'Shared data includes:',
          deviceAndModelInfo: '• Device specs & model info',
          performanceMetrics: '• Performance metrics',
          dontShowAgain: "Don't show this message again",
        },
      },
      sections: {
        testResults: 'Test Results',
      },
      benchmarkResultCard: {
        modelMeta: {
          params: 'params',
        },
        config: {
          title: 'Benchmark Config',
          format: 'PP: {{pp}} • TG: {{tg}} • PL: {{pl}} • Rep: {{nr}}',
        },
        modelSettings: {
          title: 'Model Settings',
          context: 'Context: {{context}}',
          batch: 'Batch: {{batch}}',
          ubatch: 'UBatch: {{ubatch}}',
          cpuThreads: 'CPU Threads: {{threads}}',
          gpuLayers: 'GPU Layers: {{layers}}',
          flashAttentionEnabled: 'Flash Attention Enabled',
          flashAttentionDisabled: 'Flash Attention Disabled',
          cacheTypes: 'Cache Types: {{cacheK}}/{{cacheV}}',
        },
        results: {
          promptProcessing: 'Prompt Processing',
          tokenGeneration: 'Token Generation',
          totalTime: 'Total Time',
          peakMemory: 'Peak Memory',
          tokensPerSecond: 't/s',
        },
        actions: {
          deleteButton: '',
          submittedText: '✓ Shared to',
          leaderboardLink: 'AI Phone Leaderboard ↗',
          cannotShare: 'Cannot share',
          cannotShareTooltip: 'Local model results cannot be shared',
          submitButton: 'Submit to Leaderboard',
          viewLeaderboard: 'View leaderboard ↗',
        },
        errors: {
          networkRetry: 'Check connection & retry',
          appCheckRetry: 'Retry submission',
          serverRetry: 'Try again later',
          genericRetry: 'Retry',
          failedToSubmit: 'Failed to submit benchmark',
        },
      },
      deviceInfoCard: {
        title: 'Device Information',
        deviceSummary: '{{brand}} {{model}} • {{systemName}} {{systemVersion}}',
        coreSummary: '{{cores}} cores • {{memory}}',
        sections: {
          basicInfo: 'Basic Info',
          cpuDetails: 'CPU Details',
          appInfo: 'App Info',
        },
        fields: {
          architecture: 'Architecture',
          totalMemory: 'Total Memory',
          deviceId: 'Device ID',
          cpuCores: 'CPU Cores',
          cpuModel: 'CPU Model',
          chipset: 'Chipset',
          instructions: 'Instructions',
          version: 'Version',
        },
        instructions: {
          format:
            'FP16: {{fp16}}, DotProd: {{dotProd}}, SVE: {{sve}}, I8MM: {{i8mm}}',
          yes: '✓',
          no: '✗',
        },
        versionFormat: '{{version}} ({{buildNumber}})',
      },
    },
    errors: {
      unexpectedError: 'An unexpected error occurred',
      hfAuthenticationError:
        'Hugging Face authentication error: Token is missing or invalid',
      hfAuthenticationErrorSearch:
        'Hugging Face authentication error: Invalid token',
      authenticationError: 'Authentication error: Token is missing or invalid',
      hfAuthorizationError:
        'Hugging Face authorization error: No permission to access this resource',
      authorizationError:
        'Authorization error: No permission to access this resource',
      hfServerError: 'Hugging Face server error: API server issue',
      serverError: 'Server error: API server issue',
      hfNetworkTimeout:
        'Network timeout: Request to Hugging Face took too long to complete',
      networkTimeout: 'Network timeout: Request took too long to complete',
      hfNetworkError: 'Network error: Unable to connect to Hugging Face API',
      networkError: 'Network error: Unable to connect to API',
      downloadSetupFailedTitle: 'Download Setup Failed',
      downloadSetupFailedMessage:
        'Failed to prepare model for download: {message}',
      cameraErrorTitle: 'Camera Error',
      cameraErrorMessage: 'Failed to take photo',
      galleryErrorTitle: 'Gallery Error',
      galleryErrorMessage: 'Failed to select images',
    },
    simulator: {
      cameraNotAvailable:
        'Camera not available in simulator. Please use a physical device.',
    },
  },

  ja: {
    common: {
      cancel: 'キャンセル',
      delete: '削除',
      dismiss: '閉じる',
      rename: '名前変更',
      reset: 'リセット',
      save: '保存',
      update: '更新',
      networkError: 'ネットワークエラーが発生しました、もう一度お試しください',
      downloadETA: '残り',
      minutes: '分',
      second: '秒',
      seconds: '秒',
      calculating: '計算中...',
      year: '年',
      years: '年',
      month: 'ヶ月',
      months: 'ヶ月',
      week: '週間',
      weeks: '週間',
      day: '日',
      days: '日',
      hour: '時間',
      hours: '時間',
      minute: '分',
      justNow: 'たった今',
      ok: 'OK',
      close: '閉じる',
      clear: 'すべてクリア',
      gallery: 'ギャラリー',
    },
    settings: {
      // Model Initialization Settings
      modelInitializationSettings: 'モデル初期化設定',
      // Metal Settings
      metal: 'Metal',
      metalDescription: 'Appleのハードウェア加速API',
      metalRequiresNewerIOS:
        'Metal加速機能にはiOS 18以上が必要です、この機能を利用するにはデバイスを更新してください',
      layersOnGPU: 'GPUレイヤー：{{gpuLayers}}',
      // Context Size
      contextSize: 'コンテキストサイズ',
      contextSizePlaceholder:
        'コンテキストサイズを入力（最小{{minContextSize}}）',
      invalidContextSizeError:
        '有効な数値を入力してください（最小{{minContextSize}}）',
      modelReloadNotice: '変更を適用にするにはモデルの再読み込みが必要です',
      // Advanced Settings
      advancedSettings: '詳細設定',
      // Batch Size
      batchSize: 'バッチサイズ',
      batchSizeDescription: 'バッチサイズ: {{batchSize}}{{effectiveBatch}}',
      effectiveLabel: '有効',
      // Physical Batch Size
      physicalBatchSize: '物理バッチサイズ',
      physicalBatchSizeDescription:
        '物理バッチサイズ: {{physicalBatchSize}}{{effectivePhysicalBatch}}',
      // Thread Count
      cpuThreads: 'CPUスレッド',
      cpuThreadsDescription:
        '利用可能な{{maxThreads}}スレッドのうち{{threads}}を使用',
      // Flash Attention
      flashAttention: 'Flash Attention',
      flashAttentionDescription: '高速処理のためのFlash Attentionを有効化',
      // Cache Type K
      keyCacheType: 'キーキャッシュタイプ',
      keyCacheTypeDescription: 'キー計算用のキャッシュタイプを選択',
      keyCacheTypeDisabledDescription:
        'キャッシュタイプを変更するにはFlash Attentionを有効にしてください',
      // Cache Type V
      valueCacheType: '値キャッシュタイプ',
      valueCacheTypeDescription: '値計算用のキャッシュタイプを選択',
      valueCacheTypeDisabledDescription:
        'キャッシュタイプを変更するにはFlash Attentionを有効にしてください',
      // Model Loading Settings
      modelLoadingSettings: 'モデル読み込み設定',
      // Auto Offload/Load
      autoOffloadLoad: '自動オフロード/ロード',
      autoOffloadLoadDescription:
        'アプリがバックグラウンドにあるときにモデルをオフロードします',
      // Auto Navigate to Chat
      autoNavigateToChat: 'チャットへ自動移動',
      autoNavigateToChatDescription:
        '読み込みが開始されたらチャット画面へ移動します',
      // App Settings
      appSettings: 'アプリ設定',
      // Language
      language: '言語',
      // Dark Mode
      darkMode: 'ダークモード',
      // Display Memory Usage
      displayMemoryUsage: 'メモリ使用量を表示',
      displayMemoryUsageDescription: 'チャット画面にメモリ使用量を表示します',
      // Export/Import Options
      exportOptions: 'エクスポートオプション',
      exportLegacyChats: '旧チャットセッションをエクスポート',
      exportLegacyChatsDescription:
        '移行に失敗した場合や古いチャットセッションを復元する必要がある場合に使用します',
      exportButton: 'エクスポート',
      importChats: 'チャットセッションをインポート',
      importChatsDescription:
        'JSONファイルからチャットセッションをインポートします',
      importButton: 'インポート',
      importSuccess: '{{count}}個のチャットセッションをインポートしました',
      importError:
        'チャットセッションのインポートに失敗しました、ファイル形式を確認してください',
      // API Settings
      apiSettingsTitle: 'API設定',
      // Hugging Face Token
      huggingFaceTokenLabel: 'Hugging Faceトークン',
      tokenIsSetDescription:
        'トークンが設定されています、制限付きモデルへのアクセスに必要です',
      setTokenDescription:
        'Hugging Faceから制限付きモデルにアクセスするためのトークンを設定します',
      setTokenButton: 'トークンを設定',
      useHfTokenLabel: 'HFトークンを使用',
      useHfTokenDescription:
        'HFトークンを使用して制限付きモデルにアクセスします',
    },
    memory: {
      shortWarning: 'メモリ警告',
      warning:
        '警告：モデルサイズが利用可能なメモリを超える可能性があります、デバイスのパフォーマンスと安定性に影響する可能性があります',
      multimodalWarning:
        'このデバイスはマルチモーダルモデルに十分なリソースがない可能性があります',
      alerts: {
        memoryWarningTitle: 'メモリ警告',
        memoryWarningMessage:
          'このモデルは利用可能なメモリを超える可能性があり、不安定になる可能性があります、読み込みを続行しますか？',
        multimodalWarningTitle: 'デバイス性能警告',
        multimodalWarningMessage:
          'このデバイスはマルチモーダルモデルに十分なリソースがない可能性があります、読み込みにより不安定になる可能性があります、続行しますか？',
        combinedWarningTitle: '性能警告',
        combinedWarningMessage:
          'このモデルは利用可能なメモリを超える可能性があり、このデバイスはマルチモーダルモデルに十分なリソースがない可能性があります、読み込みにより不安定になる可能性があります、続行しますか？',
        cancel: 'キャンセル',
        continue: '続行',
      },
    },
    storage: {
      checkFailed: 'ストレージの確認に失敗しました',
      lowStorage:
        'ストレージ容量不足！モデル {{modelSize}} > 空き容量 {{freeSpace}}',
    },
    generation: {
      modelNotInitialized: 'モデルコンテキストが初期化されていません',
      failedToGenerate: '出力の生成に失敗しました',
    },
    models: {
      fileManagement: {
        fileAlreadyExists: 'ファイルが既に存在します',
        fileAlreadyExistsMessage:
          'この名前のファイルは既に存在します、どうしますか？',
        replace: '置き換え',
        keepBoth: '両方保持する',
      },
      labels: {
        localModel: 'ローカル',
        hfModel: 'HF',
        unknownGroup: '不明',
        availableToUse: '使用可能',
        availableToDownload: 'ダウンロード可能',
        useAddButtonForMore: '+ ボタンを他のモデルを探す',
      },
      vision: 'ビジョン',
      mmproj: 'プロジェクター',
      multimodal: {
        settings: 'マルチモーダル設定',
        projectionModels: '投影モデル',
        noCompatibleModels: '互換性のある投影モデルが見つかりません',
        noProjectionModels: '利用可能な投影モデルがありません',
        selected: '選択済み',
        select: '選択',
        download: 'ダウンロード',
        projectionNeededTitle: '投影モデルが必要です',
        projectionNeededMessage:
          'このモデルはマルチモーダル機能のために投影モデルが必要です',
        projectionMissingWarning: '投影モデルが不足しています',
        projectionMissingShort: '投影モデル不足',
        reloadModelTitle: 'モデルを再読み込み',
        reloadModelMessage:
          '新しい投影モデルを適用するにはモデルを再読み込みする必要があります、今すぐ再読み込みしますか？',
        reload: '再読み込み',
        deleteProjectionTitle: '投影モデルを削除',
        deleteProjectionMessage: 'この投影モデルを削除してもよろしいですか？',
        cannotDeleteTitle: '削除できません',
        // Vision control strings
        visionControls: {
          enableVision: 'ビジョン機能を有効にする',
          disableVision: 'ビジョン機能を無効にする',
          visionEnabled: 'ビジョン有効',
          visionDisabled: 'ビジョン無効',
          textOnlyMode: 'テキストのみ',
          visionMode: 'ビジョン有効',
          downloadWithVision: 'ビジョン付きでダウンロード',
          downloadTextOnly: 'テキストのみダウンロード',
          visionToggleDescription: '画像処理機能を有効にする',
          projectionModelSize: '+{size} 投影モデル',
          visionModeDescription: '画像とテキストを処理',
          textOnlyModeDescription: 'テキストのみ処理',
          includesVisionCapability: 'ビジョン機能を含む',
          requiresProjectionModel:
            '先に互換性のある投影モデルをダウンロードしてください',
        },
        cannotDeleteActive: 'この投影モデルは現在アクティブです',
        cannotDeleteInUse:
          'この投影モデルはダウンロード済みのLLMモデルで使用されています：',
        dependentModels: '依存モデル：',
        visionWillBeDisabled: 'これらのモデルのビジョン機能が無効になります',
      },
      buttons: {
        addFromHuggingFace: 'Hugging Faceから追加',
        addLocalModel: 'ローカルモデルを追加',
        reset: 'リセット',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Faceモデル',
        menuTitleDownloaded: 'ダウンロード済みモデル',
        menuTitleGrouped: 'モデルタイプでグループ化',
        menuTitleReset: 'モデルリストをリセット',
      },
      modelsResetDialog: {
        proceedWithReset: 'リセットを続行',
        confirmReset: 'リセットの確認',
      },
      chatTemplate: {
        label: '基本チャットテンプレート:',
      },
      details: {
        title: '利用可能な GGUF ファイル',
      },
      modelFile: {
        alerts: {
          cannotRemoveTitle: '削除できません',
          modelPreset: 'このモデルはプリセットです',
          downloadedFirst:
            'モデルがダウンロード済みです、先にファイルを削除してください',
          removeTitle: 'モデルを削除',
          removeMessage: 'このモデルをリストから削除してもよろしいですか？',
          removeError: 'モデルの削除に失敗しました',
          alreadyDownloadedTitle: '既にダウンロード済み',
          alreadyDownloadedMessage: 'このモデルは既にダウンロードされています',
          deleteTitle: 'モデルを削除',
          deleteMessage:
            'このダウンロード済みモデルを削除してもよろしいですか？',
        },
        buttons: {
          remove: '削除',
        },
        warnings: {
          storage: {
            message: '十分なストレージ容量がありません',
            shortMessage: 'ストレージ容量不足',
          },
          memory: {
            message:
              'モデルサイズがデバイスの総メモリに近いか超えています、予期しない動作が発生する可能性があります',
          },
          legacy: {
            message:
              '旧式の量子化形式です - モデルが実行できない可能性があります',
            shortMessage: '旧式の量子化',
          },
          multiple: '{count}件の警告',
        },
        labels: {
          downloadSpeed: '{speed}',
        },
      },
      search: {
        noResults: 'モデルが見つかりません',
        loadingMore: '読み込み中...',
        searchPlaceholder: 'Hugging Faceモデルを検索',
        modelUpdatedLong: '{{time}}前に更新',
        modelUpdatedShort: '{{time}}前',
        modelUpdatedJustNowLong: 'たった今更新',
        modelUpdatedJustNowShort: 'たった今',
        errorOccurred: 'モデルを読み込めませんでした、もう一度お試しください',
      },
      modelCard: {
        alerts: {
          deleteTitle: 'モデルを削除',
          deleteMessage:
            'このダウンロード済みモデルを削除してもよろしいですか？',
          removeTitle: 'モデルを削除',
          removeMessage: 'このモデルをリストから削除してもよろしいですか？',
        },
        buttons: {
          settings: '設定',
          download: 'ダウンロード',
          remove: '削除',
          load: '読み込み',
          offload: 'オフロード',
        },
        labels: {
          skills: 'スキル: ',
        },
      },
      modelSettings: {
        template: {
          label: 'テンプレート:',
          editButton: '編集',
          dialogTitle: 'チャットテンプレートを編集',
          note1:
            '注意: テンプレートを変更すると開始トークン、終了トークン、システムプロンプトが変更される可能性があります',
          note2:
            'Nunjucksを使用します、空白の場合はモデルのデフォルトテンプレートを使用します',
          placeholder: 'チャットテンプレートをここに入力...',
          closeButton: '閉じる',
        },
        stopWords: {
          label: 'ストップワード',
          placeholder: '新しいストップワードを追加',
        },
        tokenSettings: {
          bos: '開始',
          eos: '終了',
          addGenerationPrompt: '生成プロンプトを追加',
          bosTokenPlaceholder: '開始トークン',
          eosTokenPlaceholder: '終了トークン',
          systemPrompt: 'システムプロンプト',
        },
      },
      modelDescription: {
        size: 'サイズ: ',
        parameters: 'パラメータ: ',
        separator: ' | ',
        notAvailable: '不明',
      },
      modelCapabilities: {
        questionAnswering: '質問応答',
        summarization: '要約',
        reasoning: '推論',
        roleplay: 'ロールプレイ',
        instructions: '指示への対応',
        code: 'コード生成',
        math: '数学問題の解決',
        multilingual: '多言語対応',
        rewriting: '文章の書き換え',
        creativity: '創作文章',
        vision: 'ビジョン',
      },
    },
    completionParams: {
      include_thinking_in_context:
        'AIの思考/推論部分をモデルに送信するコンテキストに含めます、無効にするとコンテキスト容量を節約できますが、パフォーマンスに影響する可能性があります',
      jinja:
        'チャットフォーマットにJinjaテンプレートを使用します、有効にすると、最新のモデルとの互換性を向上させるためにJinjaベースのチャットテンプレート処理を使用します',
      grammar:
        '生成テキストが特定の構造や形式に従うよう、文法ルールを適用します',
      stop: 'テキスト生成を停止する特定のフレーズを設定します',
      n_predict: '生成する応答の長さをトークン単位で設定します',
      n_probs: '代替単語の確率スコアを表示します',
      top_k:
        '最も可能性の高いK個の選択肢に単語の選択を限定することで創造性を制御します、値が低いほど応答がより焦点を絞ったものになります',
      top_p:
        '創造性と一貫性のバランスを調整します、高い値（1.0に近い）ではより創造的ですが、焦点が少ない応答が生成される可能性があります',
      min_p:
        'トークンが考慮される最小確率です、確率の低い単語を除外して、不自然または文脈にそぐわない応答を減らします',
      temperature:
        '創造性と予測可能性を制御します、値が高いほど応答がより創造的ですが焦点が少なくなります',
      penalty_last_n:
        '繰り返しをチェックする範囲です、大きな値は長期的な繰り返しを防ぎます',
      penalty_repeat:
        '単語の繰り返しを抑制します、値が高いほど応答はより多様な表現を使用します',
      penalty_freq:
        '頻出用語にペナルティを与えます、値が高いほど幅広い語彙の使用を促します',
      penalty_present:
        'テーマやアイデアの繰り返しを減らします、値が高いほどより多様なコンテンツを生成します',
      mirostat:
        '応答の創造性を高度に制御します、1か2（よりスムーズ）に設定して、ランダム性と一貫性をリアルタイムに調整します',
      mirostat_tau:
        'Mirostatの創造性レベルを設定します、高い値ではより多様で想像力豊かな応答が、低い値ではより焦点を絞った出力が得られます',
      mirostat_eta:
        'Mirostatが創造性を調整する速さです、値が高いほど調整が速くなります',
      dry_multiplier:
        "DRY（Don't Repeat Yourself）機能の強さです、値が高いほど繰り返しを強く防ぎます",
      dry_base:
        'DRYモードでの繰り返しに対する基本ペナルティです、高い値は繰り返しをより防ぎます',
      dry_allowed_length:
        'DRYペナルティが適用される前に繰り返し可能な単語数です',
      dry_penalty_last_n: 'DRYモードで繰り返しをチェックする範囲です',
      dry_sequence_breakers:
        'DRYモードで繰り返しチェックをリセットする記号です',
      ignore_eos:
        'モデルが停止しようとしても生成を続けます、より長い応答を強制するのに役立ちます',
      logit_bias: '特定の単語が応答に現れる確率を調整します',
      seed: '乱数生成のシードを設定します、再現可能な結果に役立ちます',
      xtc_probability:
        'XTCサンプラーによるトークン削除の確率を設定します、0は無効です',
      xtc_threshold:
        'XTCサンプラーによって削除されるトークンの最小確率閾値を設定します、0.5以上でXTCは無効になります',
      typical_p:
        'パラメータpを使用してローカルに典型的なサンプリングを有効にします、1.0は無効です',
    },
    about: {
      screenTitle: 'アプリ情報',
      description:
        '言語モデルをスマートフォンで直接利用できるアプリです、llama.cppとllama.rnをベースに開発されています',
      supportProject: 'プロジェクトを応援する',
      supportProjectDescription:
        'PocketPal AIをご利用いただき楽しんでいただけているなら、以下の方法でプロジェクトを応援いただけると幸いです：',
      githubButton: 'GitHubでスターをつける',
      orText: 'または',
      orBy: 'または',
      sponsorButton: 'スポンサーになる',
      versionCopiedTitle: 'バージョンをコピーしました',
      versionCopiedDescription:
        'バージョン情報がクリップボードにコピーされました',
    },
    feedback: {
      title: 'フィードバックを送信',
      description:
        'ご意見をお聞かせください！PocketPal AIの使い心地やより便利にするためのアイデアをお寄せください',
      shareThoughtsButton: 'ご意見を共有する',
      useCase: {
        label: 'PocketPal AIをどのように使っていますか？',
        placeholder: '例：要約、ロールプレイなど',
      },
      featureRequests: {
        label: '希望する機能',
        placeholder: '追加してほしい機能をお知らせください',
      },
      generalFeedback: {
        label: '一般的なご意見',
        placeholder: 'その他のご感想やアイデアをぜひお聞かせください',
      },
      usageFrequency: {
        label: 'どのくらいの頻度で利用されていますか？（任意）',
        options: {
          daily: '毎日',
          weekly: '週に1回以上',
          monthly: '月に1回以上',
          rarely: 'ほとんど使わない',
        },
      },
      email: {
        label: '連絡先メール（任意）',
        placeholder: 'メールアドレス',
      },
      submit: 'フィードバックを送信',
      validation: {
        required: 'フィードバック内容を入力してください',
      },
      success: 'フィードバックをありがとうございます！',
      error: {
        general:
          'フィードバックの送信中にエラーが発生しました、もう一度お試しください',
      },
    },
    components: {
      attachmentButton: {
        attachmentButtonAccessibilityLabel: 'メディアを送信',
      },
      bubble: {
        timingsString:
          'トークンあたり{{predictedMs}}ms、1秒あたり{{predictedPerSecond}}トークン',
      },
      exportUtils: {
        fileSaved: 'ファイル保存完了',
        fileSavedMessage:
          'ファイルはダウンロードフォルダに{{filename}}として保存されました',
        share: '共有',
        ok: 'OK',
        shareError: '共有エラー',
        shareErrorMessage:
          'ファイルを共有できませんでした、もう一度お試しください',
        saveError: 'ダウンロードフォルダへの保存エラー',
        saveOptions: '保存オプション',
        saveOptionsMessage:
          'ダウンロードフォルダに直接保存できません、代わりにファイルを共有しますか？',
        cancel: 'キャンセル',
        shareContentErrorMessage:
          'コンテンツを共有できませんでした、もう一度お試しください',
        exportError: 'エクスポートエラー',
        exportErrorMessage:
          'ファイルのエクスポート中にエラーが発生しました、もう一度お試しください',
        permissionRequired: 'ストレージへのアクセス許可が必要です',
        permissionMessage:
          'ダウンロードフォルダにファイルを保存するには許可が必要です',
        permissionDenied: 'アクセス許可が拒否されました',
        permissionDeniedMessage:
          'ストレージへのアクセス許可がないため、エクスポート機能は利用できません',
        continue: '続ける',
      },
      thinkingBubble: {
        reasoning: '考える',
      },
      chatEmptyPlaceholder: {
        noModelsTitle: '利用可能なモデルがありません',
        noModelsDescription:
          'PocketPalとチャットを始めるにはモデルをダウンロードしてください',
        noModelsButton: 'モデルをダウンロード',
        activateModelTitle: '開始するにはモデルを有効化してください',
        activateModelDescription:
          'モデルを選択してダウンロードしてください、ダウンロード後、モデルの横にある読み込みをタップしてチャットを開始します',
        activateModelButton: 'モデルを選択',
        loading: '読み込み中...',
      },
      chatInput: {
        inputPlaceholder: 'メッセージを入力',
        thinkingToggle: {
          enableThinking: '思考モードを有効にする',
          disableThinking: '思考モードを無効にする',
          thinkingEnabled: '思考モードが有効',
          thinkingDisabled: '思考モードが無効',
          thinkText: '思考',
        },
      },
      chatGenerationSettingsSheet: {
        invalidValues: '無効な値',
        invalidNumericValuesMessage: '有効な数値を入力してください',
        pleaseCorrect: '以下を修正してください：',
        ok: 'OK',
        saveChanges: '変更を保存',
        saveAsPreset: 'プリセットとして保存',
        title_session: 'チャット生成設定 (セッション)',
        title_preset: 'チャット生成設定 (プリセット)',
        resetToSystemDefaults: 'デフォルト設定に戻す',
        resetToPreset: 'プリセットに戻す',
        applytoPresetAlert: {
          title: '保存完了',
          message: 'これらの設定は今後すべてのセッションに適用されます',
        },
      },
      chatHeaderTitle: {
        defaultTitle: 'チャット',
      },
      fileMessage: {
        fileButtonAccessibilityLabel: 'ファイル',
      },
      chatPalModelPickerSheet: {
        modelsTab: 'モデル',
        palsTab: 'アシスタント',
        noPal: 'アシスタントなし',
        disablePal: '現在のアシスタントを無効化',
        noDescription: '説明なし',
        assistantType: 'アシスタント',
        roleplayType: 'ロールプレイ',
        videoType: 'ビデオ',
        confirmationTitle: '確認',
        modelSwitchMessage:
          'このアシスタントには別のデフォルトモデル({{modelName}})があります、アシスタントのデフォルトモデルに切り替えますか？',
        keepButton: '現在のモデルを使用',
        switchButton: '切り替える',
      },
      downloadErrorDialog: {
        downloadFailedTitle: 'ダウンロード失敗',
        downloadFailedMessage: 'モデルのダウンロードに失敗しました: {message}',
        unauthorizedTitle: '認証失敗',
        unauthorizedMessage:
          'Hugging Faceトークンが無効または期限切れのようです、設定でトークンを更新してください',
        forbiddenTitle: 'アクセス拒否',
        forbiddenMessage:
          'このモデルにアクセスする権限がありません、以下を確認してください:',
        forbiddenSteps: [
          'トークンに「読み取り」権限があること',
          'このモデルへのアクセスをリクエストし、許可されていること',
          'モデル所有者があなたのアクセスリクエストを承認していること',
        ],
        getTokenTitle: 'Hugging Faceトークンを取得',
        getTokenMessage:
          'このモデルをダウンロードするにはHugging Faceトークンが必要です',
        getTokenSteps: [
          'huggingface.coにアクセスしてサインインする',
          '設定 > アクセストークンに移動',
          '「読み取り」アクセス権を持つ新しいトークンを作成',
          'トークンをコピーしてトークンフィールドに貼り付ける',
        ],
        tokenDisabledTitle: 'トークンが無効',
        tokenDisabledMessage:
          'Hugging Faceトークンが設定されていますが、現在無効になっています、このモデルをダウンロードするにはトークンが必要です、続行するにはトークンを有効にしてください',
        enableAndRetry: 'トークンを有効にして再試行',
        goToSettings: '設定へ移動',
        tryAgain: '再試行',
        viewOnHuggingFace: 'HFでモデルを表示 ↗',
      },
      headerRight: {
        deleteChatTitle: 'チャットを削除',
        deleteChatMessage: 'このチャットを削除してもよろしいですか？',
        generationSettings: '生成設定',
        model: 'モデル',
        duplicateChatHistory: 'チャット履歴を複製',
        makeChatTemporary: '一時的なチャットにする',
        export: 'エクスポート/インポート',
        exportCurrentSession: '現在のセッションをエクスポート',
        exportAllSessions: 'すべてのセッションをエクスポート',
        exportChatSession: 'チャットをエクスポート',
        importSessions: 'セッションをインポート',
      },
      hfTokenSheet: {
        title: 'Hugging Face トークン',
        description: '制限付きモデルへのアクセスに必要',
        inputLabel: '個人アクセストークン',
        inputPlaceholder: 'トークンをここに貼り付けてください',
        save: 'トークンを保存',
        saved: 'トークンが正常に保存されました',
        reset: 'トークンをリセット',
        resetSuccess: 'トークンが正常に削除されました',
        instructions: 'トークンの取得方法：',
        instructionsSteps: [
          'huggingface.coにサインインします',
          '設定 > アクセストークンに移動',
          '「read」権限で新しいトークンを作成',
          'トークンをコピーして下に貼り付け',
        ],
        getTokenLink: 'huggingface.coでトークンを取得 ↗',
        error: {
          saving: 'トークンの保存エラー',
          missing: 'Hugging Faceトークンが必要です',
          invalid: '無効または期限切れのトークン',
          gatedModelAccess: 'このゲートモデルへのアクセスが拒否されました',
        },
        gatedModelIndicator: 'トークンが必要',
        tokenRequired: 'このモデルはHugging Faceアクセストークンが必要です',
        searchErrorHint:
          'Hugging Face APIトークンが無効または期限切れです、検索を続けるには、設定でトークンを削除するか、トークン認証を無効にしてください',
        disableAndRetry: 'トークンを無効にして再試行',
      },
      modelSettingsSheet: {
        modelSettings: 'モデル設定',
        saveChanges: '変更を保存',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Faceモデル',
        menuTitleDownloaded: 'ダウンロード済みモデル',
        menuTitleGrouped: 'モデルタイプでグループ化',
        menuTitleReset: 'モデルリストをリセット',
      },
      modelsResetDialog: {
        proceedWithReset: 'リセットする',
        confirmReset: 'リセットの確認',
      },
      assistantPalSheet: {
        title: {
          create: 'アシスタントを作成',
          edit: 'アシスタントを編集',
        },
        palName: 'アシスタント名',
        palNamePlaceholder: '名前',
        defaultModel: 'デフォルトモデル',
        defaultModelPlaceholder: 'モデルを選択',
        validation: {
          generatingPromptRequired: '生成プロンプトが必要です',
          promptModelRequired: 'プロンプト生成モデルが必要です',
        },
        create: '作成する',
      },
      modelNotAvailable: {
        noModelsDownloaded:
          'モデルがダウンロードされていません、先にモデルをダウンロードしてください',
        downloadAModel: 'モデルをダウンロード',
        defaultModelNotDownloaded:
          'デフォルトモデルがダウンロードされていません、先にダウンロードしてください',
        cancelDownload: 'キャンセル',
        download: 'ダウンロード',
      },
      roleplayPalSheet: {
        title: {
          create: 'ロールプレイを作成',
          edit: 'ロールプレイを編集',
        },
        palName: '名前',
        palNamePlaceholder: '名前',
        defaultModel: 'デフォルトモデル',
        defaultModelPlaceholder: 'モデルを選択',
        descriptionSection: '説明',
        world: '世界観',
        worldPlaceholder: 'ファンタジー',
        location: '場所',
        locationPlaceholder: '魔法の森',
        locationSublabel: '物語の舞台はどこですか？',
        aiRole: 'AIの役割',
        aiRolePlaceholder: 'エルダラ、いたずら好きな森の精霊',
        aiRoleSublabel: 'キャラクター設定',
        userRole: 'ユーザーの役割',
        userRolePlaceholder: 'エランドール卿、勇敢な騎士',
        userRoleSublabel: 'あなたは誰を演じますか？',
        situation: '状況',
        situationPlaceholder: '救出ミッション、謎解き',
        toneStyle: '雰囲気/スタイル',
        toneStylePlaceholder: '真面目',
        validation: {
          promptModelRequired: 'プロンプト生成モデルが必要です',
        },
        create: '作成する',
      },
      lookiePalSheet: {
        title: {
          create: 'Lookieアシスタントを作成',
          edit: 'Lookieアシスタントを編集',
        },
        palName: 'アシスタント名',
        palNamePlaceholder: 'Lookieアシスタントの名前を入力',
        visionModel: 'ビジョンモデル',
        visionModelPlaceholder: 'ビジョンモデルを選択',
        requiredModelsSection: '必要なモデル',
        captureInterval: 'キャプチャ間隔',
        captureIntervalHelper: '自動キャプチャ間の時間（ミリ秒）',
        create: '作成する',
      },
      sendButton: {
        accessibilityLabel: '送信',
      },
      systemPromptSection: {
        sectionTitle: 'システムプロンプト',
        useAIPrompt: 'AIを使用してシステムプロンプトを生成する',
        modelSelector: {
          label: '生成用モデルを選択*',
          sublabel: '推奨: Llama 3.2 3B または Qwen2.5 3B.',
          placeholder: 'モデルを選択',
        },
        generatingPrompt: {
          label: '生成プロンプト',
          placeholder: '生成用のプロンプトを入力',
        },
        buttons: {
          loadingModel: 'モデルを読み込み中...',
          stopGenerating: '生成を停止',
          generatePrompt: 'システムプロンプトを生成',
        },
        systemPrompt: {
          label: 'システムプロンプト',
          sublabel: '最適な結果が得られるよう、自由に編集してください',
          placeholder: 'あなたは役立つアシスタントです',
        },
        warnings: {
          promptChanged: 'システムプロンプトが変更されました',
        },
      },
      sidebarContent: {
        menuItems: {
          chat: 'チャット',
          models: 'モデル',
          pals: 'アシスタント',
          benchmark: 'ベンチマーク',
          settings: '設定',
          appInfo: 'アプリ情報',
          testCompletion: 'テスト完了',
        },
        deleteChatTitle: 'チャットを削除',
        deleteChatMessage: 'このチャットを削除してもよろしいですか？',
        dateGroups: {
          today: '今日',
          yesterday: '昨日',
          thisWeek: '今週',
          lastWeek: '先週',
          twoWeeksAgo: '2週間前',
          threeWeeksAgo: '3週間前',
          fourWeeksAgo: '4週間前',
          lastMonth: '先月',
          older: 'それ以前',
        },
      },
      usageStats: {
        tooltip: {
          title: 'メモリ使用量',
          used: '使用中: ',
          total: '合計: ',
          usage: '使用率: ',
        },
        byteSizes: ['B', 'KB', 'MB', 'GB'],
      },
      chatView: {
        menuItems: {
          copy: 'コピー',
          regenerate: '再生成',
          regenerateWith: '再生成（モデル選択）',
          edit: '編集',
        },
      },
      palHeaderRight: {
        exportAllPals: 'すべてのアシスタントをエクスポート',
        importPals: 'アシスタントをインポート',
        importSuccess: '{{count}}個のアシスタントをインポートしました。',
        importError:
          'アシスタントのインポートに失敗しました。ファイル形式を確認してください。',
      },
    },
    palsScreen: {
      systemPrompt: 'システムプロンプト',
      videoAnalysis: '動画解析',
      videoAnalysisDescription:
        'デバイスのカメラからの動画ストリームにリアルタイムでコメントを提供する動画ベースのAIアシスタントです',
      captureInterval: 'キャプチャ間隔',
      captureIntervalUnit: 'ミリ秒',
      world: '世界観',
      toneStyle: '雰囲気/スタイル',
      aiRole: 'AIの役割',
      userRole: 'ユーザーの役割',
      prompt: 'プロンプト',
      assistant: 'アシスタント',
      roleplay: 'ロールプレイ',
      video: '動画',
      deletePal: 'アシスタントを削除',
      deletePalMessage: 'このアシスタントを削除してもよろしいですか？',
      missingModel: 'モデルが見つかりません',
      missingModelMessage:
        'このアシスタントのデフォルトモデル「{{modelName}}」が利用できません、編集シートでダウンロードするか、別のモデルを選択してください',
    },
    validation: {
      nameRequired: '名前を入力してください',
      systemPromptRequired: 'システムプロンプトを入力してください',
      worldRequired: '世界観を入力してください',
      locationRequired: '場所を入力してください',
      aiRoleRequired: 'AIの役割を入力してください',
      userRoleRequired: 'ユーザーの役割を入力してください',
      situationRequired: '状況を入力してください',
      toneStyleRequired: '雰囲気/スタイルを入力してください',
    },
    camera: {
      permissionTitle: 'カメラ許可が必要',
      permissionMessage:
        'PocketPalが画像を分析するにはカメラへのアクセスが必要です',
      requestingPermission: 'カメラの許可をリクエスト中...',
      noDevice: 'カメラデバイスが見つかりません',
      errorTitle: 'カメラエラー',
      errorMessage: '写真撮影中にエラーが発生しました',
      flip: '反転',
      analyzing: '画像を分析中...',
      startCamera: 'カメラを起動',
      stopCamera: 'カメラを停止',
      promptPlaceholder: 'この画像について何を知りたいですか？',
      takePhoto: 'カメラ',
    },
    video: {
      permissionTitle: 'カメラ許可が必要',
      permissionMessage:
        'PocketPalが動画を分析するにはカメラへのアクセスが必要です',
      requestingPermission: 'カメラの許可をリクエスト中...',
      noDevice: 'カメラデバイスが見つかりません',
      errorTitle: 'カメラエラー',
      errorMessage: 'カメラでエラーが発生しました',
      flip: '反転',
      analyzing: '動画を分析中...',
      startCamera: 'カメラを起動',
      stopCamera: 'カメラを停止',
      promptPlaceholder: 'この動画について何を知りたいですか？',
      captureInterval: 'キャプチャ間隔',
      captureIntervalUnit: 'ミリ秒',
      liveCommentary: 'ライブ解説',
      emptyPlaceholder: {
        title: 'Lookieへようこそ',
        subtitle: 'プライベート・オンデバイス・リアルタイム動画解析',
        experimentalNotice:
          'これは実験的な機能です、精度は選択したモデルに依存し、速度はデバイスの性能に依存し、一部のモデルは失敗する可能性があります',
        howToUse: '使い方：',
        step1: '• プロンプトを編集（任意）して解析を誘導',
        step2: '• カメラボタンをタップしてライブ動画解析を開始',
        step3: '• カメラ起動中にスナップショット頻度を調整',
        step4: '• 通常のテキストチャットには別のアシスタントに切り替え',
      },
    },
    screenTitles: {
      chat: 'チャット',
      models: 'モデル',
      pals: 'アシスタント（実験的）',
      benchmark: 'ベンチマーク',
      settings: '設定',
      appInfo: 'アプリ情報',
      testCompletion: 'テスト完了',
    },
    chat: {
      conversationReset: '会話をリセットしました',
      modelNotLoaded:
        'モデルが読み込まれていません、モデルを初期化してください',
      completionFailed: '生成に失敗しました: ',
      loadingModel: 'モデルを読み込み中...',
      typeYourMessage: 'メッセージを入力',
      load: '読み込む',
      goToModels: 'モデルへ移動',
      readyToChat: 'チャットを始めましょう、前回使用したモデルを読み込みます',
      pleaseLoadModel: 'チャットを開始するにはモデルを読み込んでください',
      multimodalNotEnabled:
        'このモデルではマルチモーダル機能が有効になっていません、画像は表示されますが、AIによって処理されません',
    },
    benchmark: {
      title: 'ベンチマーク',
      modelSelector: {
        prompt: 'モデルを選択',
      },
      buttons: {
        advancedSettings: '詳細設定',
        startTest: 'テスト開始',
        runningTest: 'テスト実行中...',
        clearAll: 'すべて消去',
        done: '完了',
        cancel: 'キャンセル',
        delete: '削除',
        share: '共有',
        sharing: '共有中...',
        viewRawData: '生データを表示',
        hideRawData: '生データを隠す',
      },
      messages: {
        pleaseSelectModel: 'モデルを選択して初期化してください',
        testWarning:
          '注意：大きなモデルでは最大2～5分かかる場合があり、開始後は中断できません',
        keepScreenOpen: '画面を開いたままにしておいてください',
        initializingModel: 'モデルを初期化中...',
        modelMaxValue: '(最大: {{maxValue}})',
      },
      dialogs: {
        advancedSettings: {
          title: '詳細設定',
          testProfile: 'テストプロファイル',
          customParameters: 'カスタムパラメーター',
          description:
            '特定のテストシナリオに合わせてベンチマーク設定を調整できます',
        },
        deleteResult: {
          title: '結果を削除',
          message: 'このベンチマーク結果を削除してもよろしいですか？',
        },
        clearAllResults: {
          title: 'すべての結果を消去',
          message: 'すべてのベンチマーク結果を削除してもよろしいですか？',
        },
        shareResults: {
          title: 'ベンチマーク結果を共有',
          sharedDataTitle: '共有されるデータ：',
          deviceAndModelInfo: '• デバイス仕様とモデル情報',
          performanceMetrics: '• パフォーマンス指標',
          dontShowAgain: '次回から表示しない',
        },
      },
      sections: {
        testResults: 'テスト結果',
      },
      benchmarkResultCard: {
        modelMeta: {
          params: 'パラメータ',
        },
        config: {
          title: 'ベンチマーク設定',
          format: 'PP: {{pp}} • TG: {{tg}} • PL: {{pl}} • Rep: {{nr}}',
        },
        modelSettings: {
          title: 'モデル設定',
          context: 'コンテキスト: {{context}}',
          batch: 'バッチ: {{batch}}',
          ubatch: 'Uバッチ: {{ubatch}}',
          cpuThreads: 'CPUスレッド: {{threads}}',
          gpuLayers: 'GPUレイヤー: {{layers}}',
          flashAttentionEnabled: 'Flash Attention 有効',
          flashAttentionDisabled: 'Flash Attention 無効',
          cacheTypes: 'キャッシュタイプ: {{cacheK}}/{{cacheV}}',
        },
        results: {
          promptProcessing: 'プロンプト処理',
          tokenGeneration: 'トークン生成',
          totalTime: '合計時間',
          peakMemory: '最大メモリ使用量',
          tokensPerSecond: 'トークン/秒',
        },
        actions: {
          deleteButton: '',
          submittedText: '✓ 共有先：',
          leaderboardLink: 'AIスマホリーダーボード ↗',
          cannotShare: '共有できません',
          cannotShareTooltip: 'ローカルモデルの結果は共有できません',
          submitButton: 'リーダーボードに送信',
          viewLeaderboard: 'リーダーボードを表示 ↗',
        },
        errors: {
          networkRetry: '接続を確認して再試行',
          appCheckRetry: '送信をやり直す',
          serverRetry: '後でもう一度お試しください',
          genericRetry: '再試行',
          failedToSubmit: 'ベンチマーク結果の送信に失敗しました',
        },
      },
      deviceInfoCard: {
        title: 'デバイス情報',
        deviceSummary: '{{brand}} {{model}} • {{systemName}} {{systemVersion}}',
        coreSummary: '{{cores}}コア • {{memory}}',
        sections: {
          basicInfo: '基本情報',
          cpuDetails: 'CPU詳細',
          appInfo: 'アプリ情報',
        },
        fields: {
          architecture: 'アーキテクチャ',
          totalMemory: '総メモリ',
          deviceId: 'デバイスID',
          cpuCores: 'CPUコア数',
          cpuModel: 'CPUモデル',
          chipset: 'チップセット',
          instructions: '命令セット',
          version: 'バージョン',
        },
        instructions: {
          format:
            'FP16: {{fp16}}, DotProd: {{dotProd}}, SVE: {{sve}}, I8MM: {{i8mm}}',
          yes: '✓',
          no: '✗',
        },
        versionFormat: '{{version}} ({{buildNumber}})',
      },
    },
    errors: {
      unexpectedError: '予期しないエラーが発生しました',
      hfAuthenticationError:
        'Hugging Face認証エラー: トークンが見つからないか無効です',
      hfAuthenticationErrorSearch:
        'Hugging Face認証エラー: トークンが見つからないか無効です',
      authenticationError: '認証エラー: トークンが見つからないか無効です',
      hfAuthorizationError:
        'Hugging Face認可エラー: このリソースにアクセスする権限がありません',
      authorizationError:
        '認可エラー: このリソースにアクセスする権限がありません',
      hfServerError: 'Hugging Faceサーバーエラー: APIサーバーの問題',
      serverError: 'サーバーエラー: APIサーバーの問題',
      hfNetworkTimeout:
        'ネットワークタイムアウト: Hugging Faceへのリクエストが完了するのに時間がかかりすぎました',
      networkTimeout:
        'ネットワークタイムアウト: リクエストが完了するのに時間がかかりすぎました',
      hfNetworkError: 'ネットワークエラー: Hugging Face APIに接続できません',
      networkError: 'ネットワークエラー: APIに接続できません',
      downloadSetupFailedTitle: 'ダウンロード設定失敗',
      downloadSetupFailedMessage:
        'モデルのダウンロード準備に失敗しました: {message}',
      cameraErrorTitle: 'カメラエラー',
      cameraErrorMessage: '写真撮影に失敗しました',
      galleryErrorTitle: 'ギャラリーエラー',
      galleryErrorMessage: '画像選択に失敗しました',
    },
    simulator: {
      cameraNotAvailable:
        'シミュレーターではカメラを使用できません、実機をご使用ください',
    },
  },

  // Please do not translate "Pal", keep it as default!!
  zh: {
    common: {
      cancel: '取消',
      delete: '删除',
      dismiss: '关闭',
      rename: '重命名',
      reset: '重置',
      save: '保存',
      update: '更新',
      networkError: '网络错误，请重试',
      downloadETA: '预计时间',
      calculating: '计算中...',
      second: '秒',
      seconds: '秒',
      year: '年',
      years: '年',
      month: '月',
      months: '月',
      week: '周',
      weeks: '周',
      day: '天',
      days: '天',
      hour: '小时',
      hours: '小时',
      minute: '分钟',
      minutes: '分钟',
      justNow: '刚刚',
      ok: '确定',
      close: '关闭',
      clear: '全部清除',
      gallery: '图库',
    },
    settings: {
      // Model Initialization Settings
      modelInitializationSettings: '模型初始化设置',
      // Metal Settings
      metal: 'Metal',
      metalDescription: 'Apple的硬件加速API',
      metalRequiresNewerIOS:
        'Metal加速需要iOS 18或更高版本，请升级设备以使用此功能',
      layersOnGPU: 'GPU层数：{{gpuLayers}}',
      // Context Size
      contextSize: '上下文长度',
      contextSizePlaceholder: '输入上下文长度（最小{{minContextSize}}）',
      invalidContextSizeError: '请输入有效数字（最小{{minContextSize}}）',
      modelReloadNotice: '更改需要模型重新加载才能生效',
      // Advanced Settings
      advancedSettings: '高级设置',
      // Batch Size
      batchSize: '批处理大小',
      batchSizeDescription: '批处理大小: {{batchSize}}{{effectiveBatch}}',
      effectiveLabel: '有效',
      // Physical Batch Size
      physicalBatchSize: '物理批处理大小',
      physicalBatchSizeDescription:
        '物理批处理大小: {{physicalBatchSize}}{{effectivePhysicalBatch}}',
      // Thread Count
      cpuThreads: 'CPU线程',
      cpuThreadsDescription:
        '使用{{threads}}个线程（可用{{maxThreads}}个线程）',
      // Flash Attention
      flashAttention: 'Flash Attention',
      flashAttentionDescription: '启用Flash Attention以加快处理速度',
      // Cache Type K
      keyCacheType: '键缓存类型',
      keyCacheTypeDescription: '选择键计算的缓存类型',
      keyCacheTypeDisabledDescription: '启用Flash Attention以更改缓存类型',
      // Cache Type V
      valueCacheType: '值缓存类型',
      valueCacheTypeDescription: '选择值计算的缓存类型',
      valueCacheTypeDisabledDescription: '启用Flash Attention以更改缓存类型',
      // Model Loading Settings
      modelLoadingSettings: '模型加载设置',
      // Auto Offload/Load
      autoOffloadLoad: '自动卸载/加载',
      autoOffloadLoadDescription: '当APP在后台时自动卸载模型',
      // Auto Navigate to Chat
      autoNavigateToChat: '自动导航到聊天',
      autoNavigateToChatDescription: '加载完成时导航到聊天界面',
      // App Settings
      appSettings: 'APP设置',
      // Language
      language: '语言',
      // Dark Mode
      darkMode: '深色模式',
      // Display Memory Usage
      displayMemoryUsage: '显示内存使用情况',
      displayMemoryUsageDescription: '在聊天页面中显示内存使用情况',
      // Export/Import Options
      exportOptions: '导出选项',
      exportLegacyChats: '导出旧版聊天会话',
      exportLegacyChatsDescription:
        '如果迁移失败或需要恢复旧聊天会话，请使用此选项',
      exportButton: '导出',
      importChats: '导入聊天会话',
      importChatsDescription: '从JSON文件导入聊天会话',
      importButton: '导入',
      importSuccess: '成功导入{{count}}个聊天会话',
      importError: '导入聊天会话失败，请检查文件格式',
      // API Settings
      apiSettingsTitle: 'API设置',
      // Hugging Face Token
      huggingFaceTokenLabel: 'Hugging Face令牌',
      tokenIsSetDescription: '令牌已设置，访问受限模型时需要',
      setTokenDescription: '设置令牌以从Hugging Face访问受限模型',
      setTokenButton: '设置令牌',
      useHfTokenLabel: '使用HF令牌',
      useHfTokenDescription: '使用HF令牌访问受限模型',
    },
    memory: {
      shortWarning: '内存警告',
      warning:
        '警告：模型大小可能会超过可用内存，这可能会影响设备的性能和稳定性',
      multimodalWarning: '此设备可能没有足够的资源运行多模态模型',
      alerts: {
        memoryWarningTitle: '内存警告',
        memoryWarningMessage:
          '此模型可能超过可用内存，这可能导致不稳定；继续加载吗？',
        multimodalWarningTitle: '设备性能警告',
        multimodalWarningMessage:
          '此设备可能没有足够的资源运行多模态模型，加载可能导致不稳定；仍要继续吗？',
        combinedWarningTitle: '性能警告',
        combinedWarningMessage:
          '此模型可能超过可用内存，且此设备可能没有足够的资源运行多模态模型，加载可能导致不稳定；仍要继续吗？',
        cancel: '取消',
        continue: '继续',
      },
    },
    storage: {
      checkFailed: '检查存储失败',
      lowStorage: '存储不足！模型 {{modelSize}} > 可用空间 {{freeSpace}}',
    },
    generation: {
      modelNotInitialized: '模型上下文未初始化',
      failedToGenerate: '生成输出失败',
    },
    models: {
      fileManagement: {
        fileAlreadyExists: '文件已存在',
        fileAlreadyExistsMessage: '此名称的文件已存在，你想做什么？',
        replace: '替换',
        keepBoth: '保留两者',
      },
      labels: {
        localModel: '本地',
        hfModel: 'HF',
        unknownGroup: '未知',
        availableToUse: '可使用',
        availableToDownload: '可下载',
        useAddButtonForMore: '点击 + 按钮添加更多模型',
      },
      vision: '视觉',
      mmproj: '投影仪',
      multimodal: {
        settings: '多模态设置',
        projectionModels: 'Projection模型',
        noCompatibleModels: '未找到兼容的Projection模型',
        noProjectionModels: '没有可用的Projection模型',
        selected: '已选择',
        select: '选择',
        download: '下载',
        projectionNeededTitle: '需要Projection模型',
        projectionNeededMessage: '此模型需要Projection模型才能使用多模态功能',
        projectionMissingWarning: 'Projection模型缺失',
        projectionMissingShort: '缺少Projection模型',
        reloadModelTitle: '重新加载模型',
        reloadModelMessage:
          '需要重新加载模型以应用新的Projection模型，你想现在重新加载吗？',
        reload: '重新加载',
        deleteProjectionTitle: '删除Projection模型',
        deleteProjectionMessage: '你确定要删除此Projection模型吗？',
        cannotDeleteTitle: '无法删除',
        // Vision control strings
        visionControls: {
          enableVision: '启用视觉能力',
          disableVision: '禁用视觉能力',
          visionEnabled: '视觉已启用',
          visionDisabled: '视觉已禁用',
          textOnlyMode: '仅文本',
          visionMode: '视觉已启用',
          downloadWithVision: '下载包含视觉能力的模型',
          downloadTextOnly: '仅下载包含文本能力的模型',
          visionToggleDescription: '启用图像处理功能',
          projectionModelSize: '+{size} Projection模型',
          visionModeDescription: '处理图像和文本',
          textOnlyModeDescription: '仅处理文本',
          includesVisionCapability: '包含视觉能力',
          requiresProjectionModel: '请先下载兼容的Projection模型',
        },
        cannotDeleteActive: '此Projection模型当前处于活动状态',
        cannotDeleteInUse: '此Projection模型被已下载的LLM模型使用：',
        dependentModels: '依赖模型：',
        visionWillBeDisabled: '这些模型的视觉能力将被禁用',
      },
      buttons: {
        addFromHuggingFace: '从Hugging Face添加',
        addLocalModel: '添加本地模型',
        reset: '重置',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Face模型',
        menuTitleDownloaded: '已下载模型',
        menuTitleGrouped: '按模型类型分组',
        menuTitleReset: '重置模型列表',
      },
      modelsResetDialog: {
        proceedWithReset: '继续重置',
        confirmReset: '确认重置',
      },
      chatTemplate: {
        label: '基础聊天模板:',
      },
      details: {
        title: '可用 GGUF 文件',
      },
      modelFile: {
        alerts: {
          cannotRemoveTitle: '无法删除',
          modelPreset: '此模型是预设的',
          downloadedFirst: '模型已下载，请先删除模型',
          removeTitle: '删除模型',
          removeMessage: '你确定要从列表中删除此模型吗？',
          removeError: '无法删除模型',
          alreadyDownloadedTitle: '模型已下载',
          alreadyDownloadedMessage: '模型已下载',
          deleteTitle: '删除模型',
          deleteMessage: '你确定要删除此已下载的模型吗？',
        },
        buttons: {
          remove: '删除',
        },
        warnings: {
          storage: {
            message: '没有足够的存储空间',
            shortMessage: '存储不足',
          },
          memory: {
            message: '模型大小接近或超过设备的总内存，这可能会导致意外行为',
          },
          legacy: {
            message: '旧版量化格式 - 模型可能无法运行',
            shortMessage: '旧版量化',
          },
          multiple: '{count}个警告',
        },
        labels: {
          downloadSpeed: '{speed}',
        },
      },
      search: {
        noResults: '找不到模型',
        loadingMore: '加载中...',
        searchPlaceholder: '搜索Hugging Face模型',
        modelUpdatedLong: '{{time}}前更新',
        modelUpdatedShort: '{{time}}前',
        modelUpdatedJustNowLong: '刚刚更新',
        modelUpdatedJustNowShort: '刚刚',
        errorOccurred: '无法加载模型，请重试',
      },
      modelCard: {
        alerts: {
          deleteTitle: '删除模型',
          deleteMessage: '你确定要删除此已下载的模型吗？',
          removeTitle: '删除模型',
          removeMessage: '你确定要从列表中删除此模型吗？',
        },
        buttons: {
          settings: '设置',
          download: '下载',
          remove: '删除',
          load: '加载',
          offload: '卸载',
        },
        labels: {
          skills: '技能: ',
        },
      },
      modelSettings: {
        template: {
          label: '模板:',
          editButton: '编辑',
          dialogTitle: '编辑聊天模板',
          note1: '注意: 更改模板可能会更改BOS、EOS和系统提示',
          note2: '使用Nunjucks，留空以使用模型的模板',
          placeholder: '在此输入聊天模板...',
          closeButton: '关闭',
        },
        stopWords: {
          label: '停止词',
          placeholder: '添加新停止词',
        },
        tokenSettings: {
          bos: 'BOS',
          eos: 'EOS',
          addGenerationPrompt: '添加生成Prompt',
          bosTokenPlaceholder: 'BOS Token',
          eosTokenPlaceholder: 'EOS Token',
          systemPrompt: '系统提示',
        },
      },
      modelDescription: {
        size: '大小: ',
        parameters: '参数: ',
        separator: ' | ',
        notAvailable: '不可用',
      },
      modelCapabilities: {
        questionAnswering: '问答',
        summarization: '摘要',
        reasoning: '推理',
        roleplay: '角色扮演',
        instructions: '遵循指示',
        code: '代码生成',
        math: '数学解决',
        multilingual: '多语言支持',
        rewriting: '重写文章',
        creativity: '创造性写作',
        vision: '视觉',
      },
    },
    completionParams: {
      include_thinking_in_context:
        '在发送给模型的上下文中包含AI的思考/推理部分，禁用此选项可以节省上下文空间；但可能会影响性能',
      jinja:
        '启用Jinja模板进行聊天格式化；启用时，使用基于Jinja的聊天模板处理以提高与现代模型的兼容性',
      grammar: '应用特定的语法规则，以确保生成的文本遵循特定的结构或格式',
      stop: '定义将停止文本生成的特定短语',
      n_predict: '设置生成响应的长度（以token为单位）',
      n_probs: '显示替代词的概率分数',
      top_k:
        '通过限制单词选择到K个最可能的选项来控制创造性，较低的值会使响应更集中',
      top_p:
        '平衡创造性和连贯性，较高的值（接近1.0）允许更富有创造性但可能不那么集中的响应',
      min_p:
        '考虑token的最小概率，过滤掉不太可能的单词以减少不合逻辑或上下文外的响应',
      temperature:
        '控制创造性和可预测性，较高的值会使响应更富有创造性但焦点较少',
      penalty_last_n: '检查重复的范围，较大的值有助于防止长期重复',
      penalty_repeat: '抑制单词重复，较高的值会使响应使用更多样化的语言',
      penalty_freq: '惩罚常用词，较高的值鼓励使用更广泛的词汇',
      penalty_present: '减少主题和想法的重复，较高的值鼓励更多样化的内容',
      mirostat:
        '启用对响应创造性的高级控制，为了智能、实时调整随机性和连贯性，请设置为1或2（更平滑）',
      mirostat_tau:
        '设置Mirostat的创造性水平，较高的值允许更多样化和富有想象力的响应，而较低的值确保更集中的输出',
      mirostat_eta: 'Mirostat调整创造性的速度，较高的值意味着调整速度更快',
      dry_multiplier: 'DRY（不要重复自己）功能的强度，较高的值强烈防止重复',
      dry_base: 'DRY模式中的重复基本惩罚，较高的值更积极地防止重复',
      dry_allowed_length: 'DRY惩罚在应用之前可以重复的单词数',
      dry_penalty_last_n: 'DRY模式中检查重复的范围',
      dry_sequence_breakers: '重置DRY模式中重复检查器的符号',
      ignore_eos: '即使模型想要停止也要继续生成，有助于强制更长的响应',
      logit_bias: '调整特定单词出现在响应中的可能性',
      seed: '设置随机数生成器的种子，有助于重现结果',
      xtc_probability: '设置token通过XTC采样器删除的可能性，0是禁用',
      xtc_threshold:
        '设置token通过XTC采样器删除的最小概率阈值，（> 0.5禁用XTC）',
      typical_p: '使用参数p启用本地典型采样，1.0是禁用',
    },
    about: {
      screenTitle: '关于',
      description:
        '直接将语言模型完全本地部署在你手机上的APP，建立在llama.cpp和llama.rn的基础上！',
      supportProject: '支持项目',
      supportProjectDescription:
        '如果你喜欢使用PocketPal AI，请考虑通过以下方式支持项目：',
      githubButton: '在GitHub上点个Star~',
      orText: '或',
      orBy: '或通过',
      sponsorButton: '成为帅气且尊贵的赞助者！',
      versionCopiedTitle: '复制成功！',
      versionCopiedDescription: '版本信息已复制到剪贴板',
    },
    feedback: {
      title: '发送反馈',
      description:
        '你的声音很重要！告诉我们PocketPal AI如何帮助你以及我们可以做什么来使其更有用',
      shareThoughtsButton: '分享你的想法',
      useCase: {
        label: '你如何使用PocketPal AI？',
        placeholder: '例如：摘要、角色扮演等',
      },
      featureRequests: {
        label: '你想在未来看到什么功能？',
        placeholder: '分享你的想法或功能建议',
      },
      generalFeedback: {
        label: '一般反馈',
        placeholder: '如果你有其他想法，请随时分享',
      },
      usageFrequency: {
        label: '你多久使用一次PocketPal AI？（可选）',
        options: {
          daily: '每天',
          weekly: '每周',
          monthly: '每月',
          rarely: '几乎不使用',
        },
      },
      email: {
        label: '联系电子邮件（可选）',
        placeholder: '你的电子邮件地址',
      },
      submit: '提交反馈',
      validation: {
        required: '请提供至少一些反馈',
      },
      success: '感谢你的反馈！',
      error: {
        general: '发送反馈时出错，请再试一次',
      },
    },
    components: {
      attachmentButton: {
        attachmentButtonAccessibilityLabel: '发送媒体',
      },
      bubble: {
        timingsString:
          '每token{{predictedMs}}ms，每秒{{predictedPerSecond}}tokens',
      },
      exportUtils: {
        fileSaved: '文件已保存',
        fileSavedMessage: '文件已保存到你的下载文件夹，文件名为{{filename}}',
        share: '分享',
        ok: '确定',
        shareError: '分享错误',
        shareErrorMessage: '无法分享文件，请重试',
        saveError: '保存到下载文件夹时出错',
        saveOptions: '保存选项',
        saveOptionsMessage: '无法直接保存到下载文件夹，你想分享文件吗？',
        cancel: '取消',
        shareContentErrorMessage: '无法分享内容，请重试',
        exportError: '导出错误',
        exportErrorMessage: '导出文件时出错，请重试',
        permissionRequired: '需要存储权限',
        permissionMessage: '需要存储权限才能将文件保存到下载文件夹',
        permissionDenied: '存储权限被拒绝',
        permissionDeniedMessage: '没有存储权限，导出功能将被禁用',
        continue: '继续',
      },
      thinkingBubble: {
        reasoning: '思考',
      },
      chatEmptyPlaceholder: {
        noModelsTitle: '没有可用的模型',
        noModelsDescription: '需要下载一个模型，才能与PocketPal开始聊天',
        noModelsButton: '下载模型',
        activateModelTitle: '在你和PocketPal开始聊天前，请先激活模型~',
        activateModelDescription: '选择并加载一个模型以开始聊天',
        activateModelButton: '选择模型',
        loading: '加载中...',
      },
      chatInput: {
        inputPlaceholder: '消息',
        thinkingToggle: {
          enableThinking: '启用思考模式',
          disableThinking: '禁用思考模式',
          thinkingEnabled: '思考模式已启用',
          thinkingDisabled: '思考模式已禁用',
          thinkText: '思考',
        },
      },
      chatGenerationSettingsSheet: {
        invalidValues: '无效值',
        invalidNumericValuesMessage: '必须是有效数字',
        pleaseCorrect: '请纠正以下内容：',
        ok: '确定',
        saveChanges: '保存更改',
        saveAsPreset: '保存为预设',
        title_session: '聊天生成设置（会话）',
        title_preset: '聊天生成设置（预设）',
        resetToSystemDefaults: '重置为系统默认值',
        resetToPreset: '重置为预设',
        applytoPresetAlert: {
          title: '成功',
          message: '这些设置将应用于所有未来的会话',
        },
      },
      chatHeaderTitle: {
        defaultTitle: '聊天',
      },
      fileMessage: {
        fileButtonAccessibilityLabel: '文件',
      },
      chatPalModelPickerSheet: {
        modelsTab: '模型',
        palsTab: 'Pal',
        noPal: '没有Pal',
        disablePal: '禁用当前Pal',
        noDescription: '没有描述',
        assistantType: 'Pal',
        roleplayType: '角色扮演',
        videoType: '视频',
        confirmationTitle: '确认',
        modelSwitchMessage:
          '此Pal具有不同的默认模型({{modelName}})，要切换到Pal的默认模型吗？',
        keepButton: '保持',
        switchButton: '切换',
      },
      downloadErrorDialog: {
        downloadFailedTitle: '下载失败',
        downloadFailedMessage: '模型下载失败: {message}',
        unauthorizedTitle: '认证失败',
        unauthorizedMessage:
          '你的Hugging Face令牌似乎无效或已过期，请在设置中更新你的令牌',
        forbiddenTitle: '访问被拒绝',
        forbiddenMessage: '你没有权限访问此模型，请确保:',
        forbiddenSteps: [
          '你的令牌具有"读取"权限',
          '你已请求并获得了此模型的访问权限',
          '模型所有者已批准你的访问请求',
        ],
        getTokenTitle: '获取Hugging Face令牌',
        getTokenMessage: '下载此模型需要Hugging Face令牌',
        getTokenSteps: [
          '访问huggingface并登录',
          '导航至设置 > 访问令牌',
          '创建具有"读取"权限的新令牌',
          '复制令牌并粘贴到令牌字段中',
        ],
        tokenDisabledTitle: '令牌已禁用',
        tokenDisabledMessage:
          '你有一个Hugging Face令牌设置，但它目前被禁用；此模型需要令牌才能下载；请启用你的令牌以继续',
        enableAndRetry: '启用并重试',
        goToSettings: '前往设置',
        tryAgain: '重试',
        viewOnHuggingFace: '在HF上查看模型 ↗',
      },
      headerRight: {
        deleteChatTitle: '删除聊天',
        deleteChatMessage: '确定要删除这个聊天记录吗？',
        generationSettings: '生成设置',
        model: '模型',
        duplicateChatHistory: '复制聊天历史',
        makeChatTemporary: '使聊天临时',
        export: '导出/导入',
        exportCurrentSession: '导出当前会话',
        exportAllSessions: '导出所有会话',
        exportChatSession: '导出聊天会话',
        importSessions: '导入会话',
      },
      hfTokenSheet: {
        title: 'Hugging Face 令牌',
        description: '访问受限模型所需',
        inputLabel: '个人访问令牌',
        inputPlaceholder: '在此粘贴你的令牌',
        save: '保存令牌',
        saved: '令牌已成功保存',
        reset: '重置令牌',
        resetSuccess: '令牌已成功删除',
        instructions: '如何获取令牌：',
        instructionsSteps: [
          '登录 huggingface',
          '导航至设置 > 访问令牌',
          '创建具有"read"权限的新令牌',
          '复制令牌并粘贴在下方',
        ],
        getTokenLink: '从 huggingface 获取令牌 ↗',
        error: {
          saving: '保存令牌时出错',
          missing: '需要 Hugging Face 令牌',
          invalid: '无效或过期的令牌',
          gatedModelAccess: '对此受限模型的访问被拒绝',
        },
        gatedModelIndicator: '需要令牌',
        tokenRequired: '此模型需要 Hugging Face 访问令牌',
        searchErrorHint:
          '你的 Hugging Face API 令牌无效或已过期；如果要继续搜索，请在设置中删除令牌或禁用令牌验证',
        disableAndRetry: '禁用令牌并重试',
      },
      modelSettingsSheet: {
        modelSettings: '模型设置',
        saveChanges: '保存更改',
      },
      modelsHeaderRight: {
        menuTitleHf: 'Hugging Face模型',
        menuTitleDownloaded: '已下载模型',
        menuTitleGrouped: '按模型类型分组',
        menuTitleReset: '重置模型列表',
      },
      modelsResetDialog: {
        proceedWithReset: '继续重置',
        confirmReset: '确认重置',
      },
      assistantPalSheet: {
        title: {
          create: '创建助手Pal',
          edit: '编辑助手Pal',
        },
        palName: 'Pal名',
        palNamePlaceholder: '名称',
        defaultModel: '默认模型',
        defaultModelPlaceholder: '选择模型',
        validation: {
          generatingPromptRequired: '需要生成Prompt',
          promptModelRequired: '需要Prompt生成模型',
        },
        create: '创建',
      },
      modelNotAvailable: {
        noModelsDownloaded: '你还没有下载任何模型，请先下载模型',
        downloadAModel: '下载模型',
        defaultModelNotDownloaded: '默认模型还没有下载，请先下载它',
        cancelDownload: '取消下载',
        download: '下载',
      },
      roleplayPalSheet: {
        title: {
          create: '创建角色扮演Pal',
          edit: '编辑角色扮演Pal',
        },
        palName: 'Pal名',
        palNamePlaceholder: '名称',
        defaultModel: '默认模型',
        defaultModelPlaceholder: '选择模型',
        descriptionSection: '描述',
        world: '世界',
        worldPlaceholder: '奇幻',
        location: '位置',
        locationPlaceholder: '魔法森林',
        locationSublabel: '故事发生在哪里？',
        aiRole: 'AI的角色',
        aiRolePlaceholder: '埃尔达拉，一个顽皮的森林精灵',
        aiRoleSublabel: '设置角色',
        userRole: '用户角色',
        userRolePlaceholder: '埃拉德爵士，勇敢的骑士',
        userRoleSublabel: '你是谁？',
        situation: '情况',
        situationPlaceholder: '救援任务，解开谜团',
        toneStyle: '语气/风格',
        toneStylePlaceholder: '严肃',
        validation: {
          promptModelRequired: '需要Prompt生成模型',
        },
        create: '创建',
      },
      lookiePalSheet: {
        title: {
          create: '创建Lookie Pal',
          edit: '编辑Lookie Pal',
        },
        palName: 'Pal名',
        palNamePlaceholder: '输入你的Lookie Pal名称',
        visionModel: '视觉模型',
        visionModelPlaceholder: '选择视觉模型',
        requiredModelsSection: '必需模型',
        captureInterval: '捕获间隔',
        captureIntervalHelper: '自动捕获之间的时间（毫秒）',
        create: '创建',
      },
      sendButton: {
        accessibilityLabel: '发送',
      },
      systemPromptSection: {
        sectionTitle: '系统提示',
        useAIPrompt: '使用AI生成系统提示',
        modelSelector: {
          label: '选择生成用模型*',
          sublabel: '推荐: Llama 3.2 3B 或 Qwen3 4B.',
          placeholder: '选择模型',
        },
        generatingPrompt: {
          label: '生成Prompt',
          placeholder: '输入生成Prompt',
        },
        buttons: {
          loadingModel: '加载模型中...',
          stopGenerating: '停止生成',
          generatePrompt: '生成系统提示',
        },
        systemPrompt: {
          label: '系统提示',
          sublabel: '自由编辑内容以找到最佳Prompt',
          placeholder: '你是一个乐于助人的助手',
        },
        warnings: {
          promptChanged: '系统提示已手动更改',
        },
      },
      sidebarContent: {
        menuItems: {
          chat: '聊天',
          models: '模型',
          pals: 'Pals',
          benchmark: '基准测试',
          settings: '设置',
          appInfo: '关于',
          testCompletion: '测试完成',
        },
        deleteChatTitle: '删除聊天',
        deleteChatMessage: '确定要删除这个聊天记录吗？',
        dateGroups: {
          today: '今天',
          yesterday: '昨天',
          thisWeek: '这周',
          lastWeek: '上周',
          twoWeeksAgo: '2周前',
          threeWeeksAgo: '3周前',
          fourWeeksAgo: '4周前',
          lastMonth: '上个月',
          older: '以前',
        },
      },
      usageStats: {
        tooltip: {
          title: '内存使用情况',
          used: '使用中: ',
          total: '总计: ',
          usage: '使用率: ',
        },
        byteSizes: ['字节', 'KB', 'MB', 'GB'],
      },
      chatView: {
        menuItems: {
          copy: '复制',
          regenerate: '重新生成',
          regenerateWith: '重新生成（重选模型）',
          edit: '编辑',
        },
      },
      palHeaderRight: {
        exportAllPals: '导出所有帕尔',
        importPals: '导入帕尔',
        importSuccess: '成功导入{{count}}个帕尔',
        importError: '导入帕尔失败，请检查文件格式',
      },
    },
    palsScreen: {
      systemPrompt: '系统提示',
      videoAnalysis: '视频分析',
      videoAnalysisDescription:
        '这是一个基于视频的AI助手，可以对来自设备摄像头的视频流提供实时评论',
      captureInterval: '捕获间隔',
      captureIntervalUnit: '毫秒',
      world: '世界',
      toneStyle: '音调/风格',
      aiRole: 'AI的角色',
      userRole: '用户角色',
      prompt: '提示',
      assistant: '助手',
      roleplay: '角色扮演',
      video: '视频',
      deletePal: '删除Pal',
      deletePalMessage: '你确定要删除此Pal吗？',
      missingModel: '缺少模型',
      missingModelMessage:
        '此Pal的默认模型"{{modelName}}"不可用，请在编辑表中下载它或选择其他模型',
    },
    validation: {
      nameRequired: '需要填写名称',
      systemPromptRequired: '需要填写系统提示',
      worldRequired: '需要填写世界设置',
      locationRequired: '需要填写位置',
      aiRoleRequired: '需要填写AI角色',
      userRoleRequired: '需要填写用户角色',
      situationRequired: '需要填写情况',
      toneStyleRequired: '需要填写语气/风格',
    },
    camera: {
      permissionTitle: '需要摄像头权限',
      permissionMessage: 'PocketPal需要访问摄像头来分析图像',
      requestingPermission: '请求摄像头权限...',
      noDevice: '未找到摄像头设备',
      errorTitle: '摄像头错误',
      errorMessage: '拍照时发生错误',
      flip: '翻转',
      analyzing: '分析图像中...',
      startCamera: '启动摄像头',
      stopCamera: '停止摄像头',
      promptPlaceholder: '你想了解这张图片的什么信息？',
      takePhoto: '摄像头',
    },
    video: {
      permissionTitle: '需要摄像头权限',
      permissionMessage: 'PocketPal需要访问摄像头来分析视频',
      requestingPermission: '请求摄像头权限...',
      noDevice: '未找到摄像头设备',
      errorTitle: '摄像头错误',
      errorMessage: '摄像头出现错误',
      flip: '翻转',
      analyzing: '分析视频中...',
      startCamera: '启动摄像头',
      stopCamera: '停止摄像头',
      promptPlaceholder: '你想了解这个视频的什么信息？',
      captureInterval: '捕获间隔',
      captureIntervalUnit: '毫秒',
      liveCommentary: '实时解说',
      emptyPlaceholder: {
        title: '欢迎使用Lookie',
        subtitle: '私密设备端实时视频分析',
        experimentalNotice:
          '这是一个实验性功能，准确性取决于所选模型，速度取决于你的设备性能；某些模型可能会失败',
        howToUse: '使用方法：',
        step1: '• 编辑提示词（可选）来指导分析',
        step2: '• 点击摄像头按钮开始实时视频分析',
        step3: '• 在摄像头激活时调整快照频率',
        step4: '• 切换到其他助手进行正常文本聊天',
      },
    },
    screenTitles: {
      chat: '聊天',
      models: '模型',
      pals: 'Pals（实验性）',
      benchmark: '基准测试',
      settings: '设置',
      appInfo: '关于',
      testCompletion: '测试完成',
    },
    chat: {
      conversationReset: '对话已重置！',
      modelNotLoaded: '模型未加载，请初始化模型',
      completionFailed: '生成失败: ',
      loadingModel: '加载模型中...',
      typeYourMessage: '输入消息',
      load: '加载',
      goToModels: '转到模型',
      readyToChat: '准备好聊天了吗？加载上次使用的模型',
      pleaseLoadModel: '在你聊天前，请先加载模型',
      multimodalNotEnabled: '此模型未启用多模态功能，图片将显示但不会被AI处理',
    },
    benchmark: {
      title: '基准测试',
      modelSelector: {
        prompt: '选择模型',
      },
      buttons: {
        advancedSettings: '高级设置',
        startTest: '开始测试',
        runningTest: '测试运行中...',
        clearAll: '全部清除',
        done: '完成',
        cancel: '取消',
        delete: '删除',
        share: '共享',
        sharing: '共享中...',
        viewRawData: '查看原始数据',
        hideRawData: '隐藏原始数据',
      },
      messages: {
        pleaseSelectModel: '请先选择并初始化一个模型',
        testWarning: '注意：大模型可能需要2-5分钟进行测试，一旦开始就无法中断',
        keepScreenOpen: '请保持此界面打开！',
        initializingModel: '正在初始化模型...',
        modelMaxValue: '(最大值: {{maxValue}})',
      },
      dialogs: {
        advancedSettings: {
          title: '高级设置',
          testProfile: '测试配置文件',
          customParameters: '自定义参数',
          description: '微调基准测试参数以适应特定测试场景',
        },
        deleteResult: {
          title: '删除结果',
          message: '你确定要删除此基准测试结果吗？',
        },
        clearAllResults: {
          title: '清除所有结果',
          message: '你确定要删除所有基准测试结果吗？',
        },
        shareResults: {
          title: '共享基准测试结果',
          sharedDataTitle: '共享数据包括：',
          deviceAndModelInfo: '• 设备规格和模型信息',
          performanceMetrics: '• 性能指标',
          dontShowAgain: '不要再次显示此消息',
        },
      },
      sections: {
        testResults: '测试结果',
      },
      benchmarkResultCard: {
        modelMeta: {
          params: '参数',
        },
        config: {
          title: '基准测试设置',
          format: 'PP: {{pp}} • TG: {{tg}} • PL: {{pl}} • Rep: {{nr}}',
        },
        modelSettings: {
          title: '模型设置',
          context: '上下文长度: {{context}}',
          batch: '批处理: {{batch}}',
          ubatch: 'U批处理: {{ubatch}}',
          cpuThreads: 'CPU线程: {{threads}}',
          gpuLayers: 'GPU层数: {{layers}}',
          flashAttentionEnabled: '启用Flash Attention',
          flashAttentionDisabled: '禁用Flash Attention',
          cacheTypes: '缓存类型: {{cacheK}}/{{cacheV}}',
        },
        results: {
          promptProcessing: 'Prompt处理',
          tokenGeneration: 'Token生成',
          totalTime: '总时间',
          peakMemory: '峰值内存',
          tokensPerSecond: 'tok/sec',
        },
        actions: {
          deleteButton: '',
          submittedText: '✓ 提交到',
          leaderboardLink: 'AI手机排行榜 ↗',
          cannotShare: '无法共享',
          cannotShareTooltip: '本地模型结果无法共享',
          submitButton: '提交到排行榜',
          viewLeaderboard: '查看排行榜 ↗',
        },
        errors: {
          networkRetry: '检查连接并重试',
          appCheckRetry: '重试提交',
          serverRetry: '稍后再试',
          genericRetry: '重试',
          failedToSubmit: '基准测试提交失败',
        },
      },
      deviceInfoCard: {
        title: '设备信息',
        deviceSummary: '{{brand}} {{model}} • {{systemName}} {{systemVersion}}',
        coreSummary: '{{cores}}核心 • {{memory}}',
        sections: {
          basicInfo: '基本信息',
          cpuDetails: 'CPU详细信息',
          appInfo: 'APP信息',
        },
        fields: {
          architecture: '架构',
          totalMemory: '总内存',
          deviceId: '设备ID',
          cpuCores: 'CPU核心',
          cpuModel: 'CPU型号',
          chipset: '芯片组',
          instructions: '指令集',
          version: '版本',
        },
        instructions: {
          format:
            'FP16: {{fp16}}, DotProd: {{dotProd}}, SVE: {{sve}}, I8MM: {{i8mm}}',
          yes: '✓',
          no: '✗',
        },
        versionFormat: '{{version}} ({{buildNumber}})',
      },
    },
    errors: {
      unexpectedError: '发生意外错误',
      hfAuthenticationError: 'Hugging Face认证错误：令牌缺失或无效',
      hfAuthenticationErrorSearch: 'Hugging Face认证错误：令牌缺失或无效',
      authenticationError: '认证错误：令牌缺失或无效',
      hfAuthorizationError: 'Hugging Face授权错误：没有访问此资源的权限',
      authorizationError: '授权错误：没有访问此资源的权限',
      hfServerError: 'Hugging Face服务器错误：API服务器问题',
      serverError: '服务器错误：API服务器问题',
      hfNetworkTimeout: '网络超时：对Hugging Face的请求花费时间过长',
      networkTimeout: '网络超时：请求花费时间过长',
      hfNetworkError: '网络错误：无法连接到Hugging Face API',
      networkError: '网络错误：无法连接到API',
      downloadSetupFailedTitle: '下载设置失败',
      downloadSetupFailedMessage: '无法准备模型下载: {message}',
      cameraErrorTitle: '摄像头错误',
      cameraErrorMessage: '拍照失败',
      galleryErrorTitle: '图库错误',
      galleryErrorMessage: '选择图片失败',
    },
    simulator: {
      cameraNotAvailable: '当前虚拟机无法使用摄像头，请使用物理机！！',
    },
  },
};
