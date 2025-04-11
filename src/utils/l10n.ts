/** Base chat l10n containing all required properties to provide localized copy. */
export const l10n = {
  en: {
    model: 'Model',
    modelSettings: 'Model Settings',
    chatGenerationSettings: 'Chat Generation Settings',
    generationSettings: 'Generation settings',
    duplicateChatHistory: 'Duplicate chat history',
    exportChatSession: 'Export chat session',
    rename: 'Rename',
    makeChatTemporary: 'Make chat temporary',
    attachmentButtonAccessibilityLabel: 'Send media',
    emptyChatPlaceholder: 'No messages here yet',
    fileButtonAccessibilityLabel: 'File',
    inputPlaceholder: 'Message',
    sendButtonAccessibilityLabel: 'Send',
    modelNotLoaded: 'Model not loaded. Please initialize the model.',
    loadingModel: 'Loading model ...',
    typeYourMessage: 'Type your message here',
    conversationReset: 'Conversation reset!',
    networkError: 'Network error. Please try again.',
    goToModels: 'Go to Models',
    readyToChat: 'Ready to chat? Load the last used model.',
    pleaseLoadModel: 'Load a model to chat.',
    shortMemoryWarning: 'Memory Warning',
    memoryWarning:
      'Warning: Model size may exceed available memory. This could affect performance and stability of your device.',
    load: 'Load',
    cancel: 'Cancel',
    download: 'Download',
    offload: 'Offload',
    reset: 'Reset',
    saveChanges: 'Save Changes',
    save: 'Save',
    delete: 'Delete',
    dismiss: 'Dismiss',
    replace: 'Replace',
    keepBoth: 'Keep Both',
    fileAlreadyExists: 'File already exists',
    deleteChatTitle: 'Delete Chat',
    deleteChatMessage: 'Are you sure you want to delete this chat?',
    fileAlreadyExistsMessage:
      'A file with this name already exists. What would you like to do?',
    addLocalModel: 'Add Local Model',
    localModel: 'Local',
    hfModel: 'HF',
    hfFABLabel: 'Add from Hugging Face',
    localFABLabel: 'Add Local Model',
    resetFABLabel: 'Reset',
    downloaded: 'Downloaded',
    grouped: 'Grouped',
    proceedWithReset: 'Proceed with Reset',
    confirmReset: 'Confirm Reset',
    modelSettingsTitle: 'Model Settings',
    autoOffloadLoad: 'Auto Offload/Load',
    autoOffloadLoadDescription: 'Offload model when app is in background.',
    metal: 'Metal',
    metalDescription: "Apple's hardware-accelerated API.",
    layersOnGPU: 'Layers on GPU: {{gpuLayers}}',
    contextSize: 'Context Size',
    contextSizePlaceholder: 'Enter context size (min {{minContextSize}})',
    invalidContextSizeError:
      'Please enter a valid number (minimum {{minContextSize}})',
    modelReloadNotice: 'Model reload needed for changes to take effect.',
    autoNavigateToChat: 'Auto-Navigate to Chat',
    autoNavigateToChatDescription: 'Navigate to chat when loading starts.',
    uiSettingsTitle: 'UI Settings',
    darkMode: 'Dark Mode',
    darkModeDescription: 'Toggle dark mode on or off.',
    displayMemoryUsage: 'Display Memory Usage',
    displayMemoryUsageDescription: 'Display memory usage in the chat page.',
    tooltipGroupByType: 'Group by model type',
    tooltipDownloaded: 'Show downloaded only',
    tooltipHf: 'Show HuggingFace-sourced models',
    unknownGroup: 'Unknown',
    menuTitleHf: 'Hugging Face Models',
    menuTitleDownloaded: 'Downloaded Models',
    menuTitleGrouped: 'Group by Model Type',
    menuTitleReset: 'Reset Models List',
    iOSBackgroundDownload: 'Background Download',
    iOSBackgroundDownloadDescription:
      'Allow downloads to continue in the background (it will be slower).',
    availableToUse: 'Ready to Use',
    availableToDownload: 'Available to Download',
    useAddButtonForMore: 'Use + button to find more models',
    // modelSettings
    'modelSettings.grammar':
      'Enforce specific grammar rules to ensure the generated text follows a particular structure or format',
    'modelSettings.stop':
      'Define specific phrases that will stop text generation',
    'modelSettings.n_predict':
      'Set how long the generated response should be (in tokens)',
    'modelSettings.n_probs': 'Show probability scores for alternative words.',
    'modelSettings.top_k':
      'Control creativity by limiting word choices to the K most likely options. Lower values make responses more focused',
    'modelSettings.top_p':
      'Balance creativity and coherence. Higher values (near 1.0) allow more creative but potentially less focused responses',
    'modelSettings.min_p':
      'The minimum probability for a token to be considered. Filter out unlikely words to reduce nonsensical or out-of-context responses',
    'modelSettings.temperature':
      'Control creativity vs predictability. Higher values make responses more creative but less focused',
    'modelSettings.penalty_last_n':
      'How far back to check for repetition. Larger values help prevent long-term repetition',
    'modelSettings.penalty_repeat':
      'Discourage word repetition. Higher values make responses use more diverse language',
    'modelSettings.penalty_freq':
      'Penalize overused words. Higher values encourage using a broader vocabulary',
    'modelSettings.penalty_present':
      'Reduce repetition of themes and ideas. Higher values encourage more diverse content',
    'modelSettings.mirostat':
      'Enable advanced control over response creativity. Set to 1 or 2 (smoother) for smart, real-time adjustments to randomness and coherence.',
    'modelSettings.mirostat_tau':
      'Set the target creativity level for Mirostat. Higher values allow for more diverse and imaginative responses, while lower values ensure more focused outputs.',
    'modelSettings.mirostat_eta':
      'How quickly Mirostat adjusts creativity. Higher values mean faster adjustments',
    'modelSettings.dry_multiplier':
      "Strength of the DRY (Don't Repeat Yourself) feature. Higher values strongly prevent repetition",
    'modelSettings.dry_base':
      'Base penalty for repetition in DRY mode. Higher values are more aggressive at preventing repetition',
    'modelSettings.dry_allowed_length':
      'How many words can repeat before DRY penalty kicks in',
    'modelSettings.dry_penalty_last_n':
      'How far back to look for repetition in DRY mode',
    'modelSettings.dry_sequence_breakers':
      'Symbols that reset the repetition checker in DRY mode',
    'modelSettings.ignore_eos':
      'Continue generating even if the model wants to stop. Useful for forcing longer responses',
    'modelSettings.logit_bias':
      'Influence how likely specific words are to appear in the response',
    'modelSettings.seed':
      'Set the random number generator seed. Useful for reproducible results',
    'modelSettings.xtc_probability':
      'Set the chance for token removal via XTC sampler. 0 is disabled',
    'modelSettings.xtc_threshold':
      'Set a minimum probability threshold for tokens to be removed via XTC sampler. (> 0.5 disables XTC)',
    'modelSettings.typical_p':
      'Enable locally typical sampling with parameter p. 1.0 is disabled',
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
  },
  es: {
    model: 'Modelo',
    modelSettings: 'Configuración del modelo',
    chatGenerationSettings: 'Configuración de generación de chat',
    save: 'Guardar',
    deleteChatTitle: 'Eliminar chat',
    deleteChatMessage: '¿Estás seguro de que quieres eliminar este chat?',
    generationSettings: 'Configuración de generación',
    duplicateChatHistory: 'Duplicar historial de chat',
    exportChatSession: 'Exportar sesión de chat',
    rename: 'Renombrar',
    makeChatTemporary: 'Hacer chat temporal',
    attachmentButtonAccessibilityLabel: 'Enviar multimedia',
    emptyChatPlaceholder: 'Aún no hay mensajes',
    fileButtonAccessibilityLabel: 'Archivo',
    inputPlaceholder: 'Mensaje',
    sendButtonAccessibilityLabel: 'Enviar',
    modelNotLoaded: 'Modelo no cargado. Por favor, inicialice el modelo.',
    loadingModel: 'Cargando modelo...',
    typeYourMessage: 'Escriba su mensaje aquí',
    conversationReset: '¡Conversación reiniciada!',
    networkError: 'Error de red. Inténtalo de nuevo.',
    goToModels: 'Ir a Modelos',
    readyToChat: '¿Listo para chatear? Cargue el último modelo usado.',
    pleaseLoadModel: 'Cargue un modelo para chatear.',
    shortMemoryWarning: 'Advertencia de memoria',
    memoryWarning:
      'Advertencia: El tamaño del modelo puede exceder la memoria disponible. Esto podría afectar el rendimiento y la estabilidad de su dispositivo.',
    load: 'Cargar',
    cancel: 'Cancelar',
    download: 'Descargar',
    offload: 'Liberar',
    reset: 'Reiniciar',
    saveChanges: 'Guardar cambios',
    delete: 'Eliminar',
    dismiss: 'Descartar',
    replace: 'Reemplazar',
    keepBoth: 'Mantener ambos',
    fileAlreadyExists: 'Archivo ya existe',
    fileAlreadyExistsMessage:
      'Un archivo con este nombre ya existe. ¿Qué te gustaría hacer?',
    addLocalModel: 'Agregar modelo local',
    localModel: 'Local',
    hfModel: 'HF',
    hfFABLabel: 'Buscar en Hugging Face',
    localFABLabel: 'Agregar Modelo Local',
    resetFABLabel: 'Restablecer',
    downloaded: 'Descargado',
    grouped: 'Agrupado',
    proceedWithReset: 'Proceder con Reiniciar',
    confirmReset: 'Confirmar Reiniciar',
    modelSettingsTitle: 'Configuración del modelo',
    autoOffloadLoad: 'Auto Offload/Load',
    autoOffloadLoadDescription:
      'Descargar modelo cuando la app está en segundo plano.',
    metal: 'Metal',
    metalDescription: 'API de hardware acelerada por Apple.',
    layersOnGPU: 'Capas en GPU: {{gpuLayers}}',
    contextSize: 'Tamaño del contexto',
    contextSizePlaceholder:
      'Ingrese el tamaño del contexto (mínimo {{minContextSize}})',
    invalidContextSizeError:
      'Por favor, ingrese un número válido (mínimo {{minContextSize}})',
    modelReloadNotice:
      'Se requiere recargar el modelo para que los cambios surtan efecto.',
    autoNavigateToChat: 'Navegar automáticamente a la conversación',
    autoNavigateToChatDescription:
      'Navegar a la conversación cuando comience a cargar.',
    uiSettingsTitle: 'Configuración de la interfaz de usuario',
    darkMode: 'Modo oscuro',
    darkModeDescription: 'Alternar modo oscuro on/off.',
    displayMemoryUsage: 'Mostrar uso de memoria',
    displayMemoryUsageDescription:
      'Mostrar uso de memoria en la página de chat.',
    tooltipGroupByType: 'Agrupar por tipo de modelo',
    tooltipDownloaded: 'Mostrar solo descargados',
    tooltipHf: 'Mostrar modelos de HuggingFace',
    unknownGroup: 'Desconocido',
    menuTitleHf: 'Modelos de Hugging Face',
    menuTitleDownloaded: 'Modelos Descargados',
    menuTitleGrouped: 'Agrupar por Tipo de Modelo',
    menuTitleReset: 'Reiniciar Lista de Modelos',
    iOSBackgroundDownload: 'Descarga en segundo plano',
    iOSBackgroundDownloadDescription:
      'Permitir que las descargas continúen en segundo plano (será más lento).',
    availableToUse: 'Listo para Usar',
    availableToDownload: 'Disponible para Descargar',
    useAddButtonForMore: 'Use el botón + para encontrar más modelos',
    'modelSettings.grammar':
      'Establecer gramática para el muestreo basado en gramática',
    'modelSettings.stop':
      'Especificar cadenas de parada que no se incluirán en la completación',
    'modelSettings.n_predict':
      'Número máximo de tokens a predecir al generar texto',
    'modelSettings.n_probs':
      'Número de probabilidades de tokens superiores a devolver por token',
    'modelSettings.top_k':
      'Limitar la selección de tokens a los K tokens más probables',
    'modelSettings.top_p':
      'Limitar la selección de tokens a aquellos con probabilidad acumulada superior al umbral P',
    'modelSettings.min_p':
      'Probabilidad mínima para un token en relación al token más probable',
    'modelSettings.xtc_probability':
      'Probabilidad de eliminación de tokens mediante el muestreador XTC',
    'modelSettings.xtc_threshold':
      'Umbral mínimo de probabilidad para la eliminación de tokens mediante XTC',
    'modelSettings.typical_p': 'Parámetro para el muestreo localmente típico',
    'modelSettings.temperature': 'Ajustar la aleatoriedad del texto generado',
    'modelSettings.penalty_last_n':
      'Número de tokens a considerar para la penalización por repetición',
    'modelSettings.penalty_repeat':
      'Controlar la repetición de secuencias de tokens',
    'modelSettings.penalty_freq': 'Penalización de frecuencia alfa repetida',
    'modelSettings.penalty_present': 'Penalización de presencia alfa repetida',
    'modelSettings.mirostat':
      'Habilitar muestreo Mirostat para control de perplejidad',
    'modelSettings.mirostat_tau': 'Entropía objetivo de Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Tasa de aprendizado de Mirostat (eta)',
    'modelSettings.dry_multiplier':
      'Multiplicador de penalización por repetición DRY',
    'modelSettings.dry_base': 'Valor base de penalización por repetición DRY',
    'modelSettings.dry_allowed_length':
      'Longitud máxima permitida antes de penalización exponencial',
    'modelSettings.dry_penalty_last_n':
      'Número de tokens a escanear para repeticiones',
    'modelSettings.dry_sequence_breakers':
      'Rompedores de secuencia para muestreo DRY',
    'modelSettings.ignore_eos':
      'Ignorar token de fin de secuencia y continuar generando',
    'modelSettings.logit_bias': 'Modificar probabilidad de tokens específicos',
    'modelSettings.seed': 'Semilla del generador de números aleatorios',
    about: {
      screenTitle: 'Información de la App',
      description:
        'Una aplicación que lleva los modelos de lenguaje directamente a tu teléfono. Se apoya en llama.cpp y llama.rn.',
      supportProject: 'Apoya el Proyecto',
      supportProjectDescription:
        'Si disfrutas usando PocketPal AI, considera apoyar el proyecto de las siguientes formas:',
      githubButton: 'Estrella en GitHub',
      orText: 'o',
      orBy: 'o mediante',
      sponsorButton: 'Convertirse en Patrocinador',
      versionCopiedTitle: 'Versión copiada',
      versionCopiedDescription:
        'La información de la versión ha sido copiada al portapapeles',
    },
    feedback: {
      title: 'Enviar Comentarios',
      description:
        '¡Tu opinión es importante! Cuéntanos cómo PocketPal AI te está ayudando y qué podemos hacer para que sea aún más útil.',
      shareThoughtsButton: 'Comparte tus opiniones',
      useCase: {
        label: '¿Para qué estás usando PocketPal AI?',
        placeholder: 'ej., resúmenes, roleplay, etc.',
      },
      featureRequests: {
        label: '¿Qué características te gustaría ver en el futuro?',
        placeholder: 'Comparte tus ideas y sugerencias de características',
      },
      generalFeedback: {
        label: '¿Algún otro comentario?',
        placeholder:
          'Comparte cualquier otro pensamiento que tengas. Lo que te gusta, lo que no te gusta, etc.',
      },
      usageFrequency: {
        label: '¿Con qué frecuencia usas PocketPal AI? (Opcional)',
        options: {
          daily: 'Diariamente',
          weekly: 'Semanalmente',
          monthly: 'Mensualmente',
          rarely: 'Rara vez',
        },
      },
      email: {
        label: 'Correo de Contacto (Opcional)',
        placeholder: 'Tu dirección de correo electrónico',
      },
      submit: 'Enviar Comentarios',
      validation: {
        required: 'Por favor, proporciona al menos algún comentario',
      },
      success: '¡Gracias por tus comentarios!',
      error: {
        general: 'Error al enviar comentarios. Por favor, inténtalo de nuevo.',
      },
    },
  },
  ko: {
    model: '모델',
    modelSettings: '모델 설정',
    chatGenerationSettings: '채팅 생성 설정',
    save: '저장',
    generationSettings: '생성 설정',
    deleteChatTitle: '채팅 삭제',
    deleteChatMessage: '채팅을 삭제하시겠습니까?',
    duplicateChatHistory: '채팅 기록 복제',
    exportChatSession: '채팅 세션 내보내기',
    rename: '이름 변경',
    makeChatTemporary: '채팅 임시로 만들기',
    attachmentButtonAccessibilityLabel: '미디어 보내기',
    emptyChatPlaceholder: '주고받은 메시지가 없습니다',
    fileButtonAccessibilityLabel: '파일',
    inputPlaceholder: '메시지',
    sendButtonAccessibilityLabel: '보내기',
    modelNotLoaded: '모델이 로드되지 않았습니다. 모델을 초기화하세요.',
    loadingModel: '모델을 로드하는 중...',
    typeYourMessage: '메시지를 입력하세요',
    conversationReset: '대화가 초기화되었습니다!',
    networkError: '네트워크 오류가 발생했습니다. 다시 시도해주세요.',
    goToModels: '모델로 가기',
    readyToChat: '채팅을 준비하세요. 마지막으로 사용된 모델을 로드하세요.',
    pleaseLoadModel: '채팅을 위해 모델을 로드하세요.',
    shortMemoryWarning: '메모리 경고',
    memoryWarning:
      '경고: 모델 크기가 사용 가능한 메모리를 초과할 수 있습니다. 이는 장치의 성능과 안정성에 영향을 미칠 수 있습니다.',
    load: '로드',
    cancel: '취소',
    download: '다운로드',
    offload: '해제',
    reset: '재설정',
    delete: '삭제',
    saveChanges: '변경 저장',
    dismiss: '무시',
    replace: '대체',
    keepBoth: '둘 다 유지',
    fileAlreadyExists: '파일이 이미 존재합니다',
    fileAlreadyExistsMessage:
      '이름이 같은 파일이 이미 존재합니다. 어떻게 하시겠습니까?',
    addLocalModel: '로컬 모델 추가',
    localModel: '로컬',
    hfModel: 'HF',
    hfFABLabel: 'Hugging Face에서 검색',
    localFABLabel: '로컬 모델 추가',
    resetFABLabel: '초기화',
    downloaded: '다운로드됨',
    grouped: '그룹화됨',
    proceedWithReset: '재설정 진행',
    confirmReset: '재설정 확인',
    modelSettingsTitle: '모델 설정',
    autoOffloadLoad: '자동 해제/로드',
    autoOffloadLoadDescription: '앱이 백그라운드에 있을 때 모델을 해제합니다.',
    metal: 'Metal',
    metalDescription: 'Apple의 하드웨어 가속 API.',
    layersOnGPU: 'GPU의 레이어 수: {{gpuLayers}}',
    contextSize: '컨텍스트 크기',
    contextSizePlaceholder: '컨텍스트 크기 입력 (최소 {{minContextSize}})',
    invalidContextSizeError:
      '유효한 숫자를 입력하세요 (최소 {{minContextSize}})',
    modelReloadNotice: '변경 사항이 적용되도록 모델을 다시 로드해야 합니다.',
    autoNavigateToChat: '자동으로 채팅으로 이동',
    autoNavigateToChatDescription: '로드가 시작될 때 채팅으로 이동합니다.',
    uiSettingsTitle: '사용자 인터페이스 설정',
    darkMode: '어두운 모드',
    darkModeDescription: '어두운 모드를 켜거나 끕니다.',
    displayMemoryUsage: '메모리 사용량 표시',
    displayMemoryUsageDescription:
      '채팅 페이지에서 메모리 사용량을 표시합니다.',
    tooltipGroupByType: '모델 유형별 그룹화',
    tooltipDownloaded: '다운로드된 항목만 표시',
    tooltipHf: 'Hugging Face 모델 표시',
    unknownGroup: '알 수 없음',
    menuTitleHf: 'Hugging Face 모델',
    menuTitleDownloaded: '다운로드된 모델',
    menuTitleGrouped: '모델 유형별 그룹화',
    menuTitleReset: '모델 목록 재설정',
    iOSBackgroundDownload: '백그라운드 다운로드',
    iOSBackgroundDownloadDescription:
      '백그라운드에서 다운로드가 계속되도록 허용합니다 (속도가 느려질 수 있습니다).',
    availableToUse: '사용 준비 완료',
    availableToDownload: '다운로드 가능',
    useAddButtonForMore: '+ 버튼을 사용하여 더 많은 모델 찾기',
    'modelSettings.grammar': '문법 기반 샘플링을 위한 문법 설정',
    'modelSettings.stop': '완성에 포함되지 않을 중지 문자열 지정',
    'modelSettings.n_predict': '텍스트 생성 시 예측할 최대 토큰 수',
    'modelSettings.n_probs': '토큰당 반환할 상위 토큰 확률 수',
    'modelSettings.top_k': '가장 확률이 높은 K개의 토큰으로 토큰 선택 제한',
    'modelSettings.top_p':
      '누적 확률이 임계값 P보다 높은 토큰들로 토큰 선택 제한',
    'modelSettings.min_p': '가장 가능성 높은 토큰 대비 토큰의 최소 확률',
    'modelSettings.xtc_probability': 'XTC 샘플러를 통한 토큰 제거 확률',
    'modelSettings.xtc_threshold':
      'XTC 샘플러 토큰 제거를 위한 최소 확률 임계값',
    'modelSettings.typical_p': '지역적 전형 샘플링을 위한 매개변수',
    'modelSettings.temperature': '생성된 텍스트의 무작위성 조정',
    'modelSettings.penalty_last_n': '반복 페널티를 위해 고려할 토큰 수',
    'modelSettings.penalty_repeat': '토큰 시퀀스의 반복 제어',
    'modelSettings.penalty_freq': '반복 알파 빈도 페널티',
    'modelSettings.penalty_present': '반복 알파 존재 페널티',
    'modelSettings.mirostat': '혼란도 제어를 위한 Mirostat 샘플링 활성화',
    'modelSettings.mirostat_tau': 'Mirostat 목표 엔트로피 (tau)',
    'modelSettings.mirostat_eta': 'Mirostat 학습률 (eta)',
    'modelSettings.dry_multiplier': 'DRY 반복 페널티 승수',
    'modelSettings.dry_base': 'DRY 반복 페널티 기본값',
    'modelSettings.dry_allowed_length': '지수 페널티 적용 전 최대 허용 길이',
    'modelSettings.dry_penalty_last_n': '반복 검사를 위한 토큰 수',
    'modelSettings.dry_sequence_breakers': 'DRY 샘플링을 위한 시퀀스 중단자',
    'modelSettings.ignore_eos': '스트림 종료 토큰을 무시하고 생성 계속',
    'modelSettings.logit_bias': '특정 토큰의 확률 수정',
    'modelSettings.seed': '난수 생성기 시드',
    about: {
      screenTitle: '앱 정보',
      description:
        '언어 모델을 직접 휴대폰에서 사용할 수 있게 해주는 앱입니다. llama.cpp와 llama.rn을 기반으로 제작되었습니다.',
      supportProject: '프로젝트 지원하기',
      supportProjectDescription:
        'PocketPal AI가 마음에 드신다면, 다음과 같은 방법으로 프로젝트를 지원해 주세요:',
      githubButton: 'GitHub에서 스타 주기',
      orText: '또는',
      orBy: '또는',
      sponsorButton: '스폰서 되기',
      versionCopiedTitle: '버전 복사됨',
      versionCopiedDescription: '버전 정보가 클립보드에 복사되었습니다',
    },
    feedback: {
      title: '피드백 보내기',
      description:
        '여러분의 의견이 중요합니다! PocketPal AI가 어떻게 도움이 되고 있는지, 그리고 어떻게 하면 더 유용하게 만들 수 있을지 알려주세요.',
      shareThoughtsButton: '의견 공유하기',
      useCase: {
        label: 'PocketPal AI를 어떤 용도로 사용하고 계신가요?',
        placeholder: '예: 요약, 롤플레잉 등',
      },
      featureRequests: {
        label: '앞으로 어떤 기능이 추가되면 좋을까요?',
        placeholder: '원하는 기능과 제안을 공유해주세요',
      },
      generalFeedback: {
        label: '기타 의견이 있으신가요?',
        placeholder: '좋았던 점, 아쉬웠던 점 등 자유롭게 의견을 남겨주세요.',
      },
      usageFrequency: {
        label: 'PocketPal AI 사용 빈도는 어떻게 되시나요? (선택사항)',
        options: {
          daily: '매일',
          weekly: '주간',
          monthly: '월간',
          rarely: '가끔',
        },
      },
      email: {
        label: '연락처 이메일 (선택사항)',
        placeholder: '이메일 주소',
      },
      submit: '피드백 보내기',
      validation: {
        required: '최소한 하나의 피드백을 작성해주세요',
      },
      success: '피드백 감사합니다!',
      error: {
        general: '피드백 전송 중 오류가 발생했습니다. 다시 시도해주세요.',
      },
    },
  },
  pl: {
    model: 'Model',
    modelSettings: 'Ustawienia modelu',
    chatGenerationSettings: 'Ustawienia generowania czatu',
    save: 'Zapisz',
    generationSettings: 'Ustawienia generowania',
    deleteChatTitle: 'Usuń czat',
    deleteChatMessage: 'Czy na pewno chcesz usunąć ten czat?',
    duplicateChatHistory: 'Duplikuj historię czatu',
    exportChatSession: 'Eksportuj sesję czatu',
    rename: 'Zmieniaj nazwę',
    makeChatTemporary: 'Ustaw czat jako tymczasowy',
    attachmentButtonAccessibilityLabel: 'Wyślij multimedia',
    emptyChatPlaceholder: 'Tu jeszcze nie ma wiadomości',
    fileButtonAccessibilityLabel: 'Plik',
    inputPlaceholder: 'Napisz wiadomość',
    sendButtonAccessibilityLabel: 'Wyślij',
    modelNotLoaded: 'Model nie załadowany. Proszę załadować model.',
    loadingModel: 'Ładowanie modelu...',
    typeYourMessage: 'Napisz swoją wiadomość tutaj',
    conversationReset: 'Konwersacja została zresetowana!',
    networkError: 'Błąd sieci. Spróbuj ponownie.',
    goToModels: 'Przejdź do modeli',
    readyToChat: 'Czy gotowy do rozmowy? Załaduj ostatnio używany model.',
    pleaseLoadModel: 'Załaduj model, aby czatować.',
    shortMemoryWarning: 'Ostrzeżenie o pamięci',
    memoryWarning:
      'Ostrzeżenie: Rozmiar modelu może przekraczać dostępną pamięć. Może to wpłynąć na wydajność i stabilność urządzenia.',
    load: 'Załaduj',
    cancel: 'Anuluj',
    download: 'Pobierz',
    offload: 'Odpowiedz',
    reset: 'Resetuj',
    saveChanges: 'Zapisz zmiany',
    delete: 'Usuń',
    dismiss: 'Odrzuć',
    replace: 'Zastąp',
    keepBoth: 'Zachowaj oba',
    fileAlreadyExists: 'Plik już istnieje',
    fileAlreadyExistsMessage:
      'Plik o tej samej nazwie już istnieje. Co chciałbyś zrobić?',
    addLocalModel: 'Dodaj model lokalny',
    localModel: 'Lokalny',
    hfModel: 'HF',
    hfFABLabel: 'Szukaj na Hugging Face',
    localFABLabel: 'Dodaj Model Lokalny',
    resetFABLabel: 'Resetuj',
    downloaded: 'Pobrany',
    grouped: 'Zgrupowany',
    proceedWithReset: 'Kontynuuj reset',
    confirmReset: 'Potwierdź Reiniciację',
    modelSettingsTitle: 'Konfiguracja modelu',
    autoOffloadLoad: 'Auto Offload/Load',
    autoOffloadLoadDescription: 'Odpowiedz modelu, gdy aplikacja jest w tle.',
    metal: 'Metal',
    metalDescription: 'API sprzętu akcelerowanego przez Apple.',
    layersOnGPU: 'Warstwy w GPU: {{gpuLayers}}',
    contextSize: 'Rozmiar kontekstu',
    contextSizePlaceholder: 'Wpisz rozmiar kontekstu (min {{minContextSize}})',
    invalidContextSizeError: 'Wpisz poprawny numer (min {{minContextSize}})',
    modelReloadNotice:
      'Należy ponownie załadować model, aby zmiany zaczęły obowiązywać.',
    autoNavigateToChat: 'Automatycznie przejdź do konwersacji',
    autoNavigateToChatDescription:
      'Przejdź do konwersacji, gdy rozpocznie się ładowanie.',
    uiSettingsTitle: 'Ustawienia interfejsu użytkownika',
    darkMode: 'Ciemny tryb',
    darkModeDescription: 'Włącz lub wyłącz tryb ciemny.',
    displayMemoryUsage: 'Pokaż użycie pamięci',
    displayMemoryUsageDescription: 'Pokaż użycie pamięci na stronie czatu.',
    tooltipGroupByType: 'Grupuj według typu modelu',
    tooltipDownloaded: 'Pokaż tylko pobrane',
    tooltipHf: 'Pokaż modele z HuggingFace',
    unknownGroup: 'Nieznany',
    menuTitleHf: 'Modele Hugging Face',
    menuTitleDownloaded: 'Pobrane Modele',
    menuTitleGrouped: 'Grupuj według Typu Modelu',
    menuTitleReset: 'Reset Lista Modeli',
    iOSBackgroundDownload: 'Pobieranie w tle',
    iOSBackgroundDownloadDescription:
      'Zezwól na kontynuowanie pobierania w tle (będzie wolniejsze).',
    availableToUse: 'Gotowy do Użycia',
    availableToDownload: 'Dostępny do Pobrania',
    useAddButtonForMore: 'Użyj przycisku +, aby znaleźć więcej modeli',
    'modelSettings.grammar':
      'Ustaw gramatykę dla próbkowania opartego na gramatyce',
    'modelSettings.stop':
      'Określ ciągi zatrzymujące, które nie zostaną uwzględnione w uzupełnieniu',
    'modelSettings.n_predict':
      'Maksymalna liczba tokenów do przewidzenia podczas generowania tekstu',
    'modelSettings.n_probs':
      'Liczba najwyższych prawdopodobieństw tokenów do zwrócenia na token',
    'modelSettings.top_k':
      'Ogranicz wybór tokenów do K najbardziej prawdopodobnych tokenów',
    'modelSettings.top_p':
      'Ogranicz wybór tokenów do tych o skumulowanym prawdopodobieństwie powyżej progu P',
    'modelSettings.min_p':
      'Minimalne prawdopodobieństwo dla tokenu względem najbardziej prawdopodobnego tokenu',
    'modelSettings.xtc_probability':
      'Szansa na usunięcie tokenu przez próbkowanie XTC',
    'modelSettings.xtc_threshold':
      'Mnimalny próg prawdopodobieństwa dla usuwania tokenów przez XTC',
    'modelSettings.typical_p': 'Parametr dla lokalnie typowego próbkowania',
    'modelSettings.temperature': 'Ajustar aleatoriedade do tekstu generowanego',
    'modelSettings.penalty_last_n':
      'Liczba tokenów do uwzględnienia przy karze za powtórzenia',
    'modelSettings.penalty_repeat': 'Kontroluj powtarzanie sekwencji tokenów',
    'modelSettings.penalty_freq': 'Penalidade de frequência alfa repetida',
    'modelSettings.penalty_present': 'Penalidade de presença alfa repetida',
    'modelSettings.mirostat':
      'Habilitar amostragem Mirostat para controle de perplexidade',
    'modelSettings.mirostat_tau': 'Entropia alvo do Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Taxa de aprendizado do Mirostat (eta)',
    'modelSettings.dry_multiplier':
      'Multiplicador de penalidade de repetição DRY',
    'modelSettings.dry_base': 'Valor base de penalidade de repetição DRY',
    'modelSettings.dry_allowed_length':
      'Comprimento máximo permitido antes da penalidade exponencial',
    'modelSettings.dry_penalty_last_n':
      'Número de tokens a verificar para repetições',
    'modelSettings.dry_sequence_breakers':
      'Quebradores de sequência para amostragem DRY',
    'modelSettings.ignore_eos':
      'Ignorar token de fim de fluxo e continuar gerando',
    'modelSettings.logit_bias': 'Modificar probabilidade de tokens específicos',
    'modelSettings.seed': 'Semente do gerador de números aleatórios',
    about: {
      screenTitle: 'Informacje o aplikacji',
      description:
        'Aplikacja, która umożliwia korzystanie z modeli językowych bezpośrednio na telefonie. Bazuje na llama.cpp i llama.rn.',
      supportProject: 'Wesprzyj projekt',
      supportProjectDescription:
        'Jeśli podoba Ci się PocketPal AI, rozważ wsparcie projektu w następujący sposób:',
      githubButton: 'Gwiazdka GitHub',
      orText: 'lub',
      orBy: 'lub poprzez',
      sponsorButton: 'Zostań sponsorem',
      versionCopiedTitle: 'Wersja skopiowana',
      versionCopiedDescription:
        'Informacje o wersji zostały skopiowane do schowka',
    },
    feedback: {
      title: 'Wyślij opinię',
      description:
        'Twoja opinia jest ważna! Powiedz nam, jak PocketPal AI Ci pomaga i co możemy zrobić, aby był jeszcze bardziej przydatny.',
      shareThoughtsButton: 'Podziel się swoimi przemyśleniami',
      useCase: {
        label: 'Do czego używasz PocketPal AI?',
        placeholder: 'np. podsumowania, roleplay, itp.',
      },
      featureRequests: {
        label: 'Jakie funkcje chciałbyś zobaczyć w przyszłości?',
        placeholder:
          'Podziel się swoimi pomysłami i sugestiami dotyczącymi funkcji',
      },
      generalFeedback: {
        label: 'Inne uwagi?',
        placeholder:
          'Podziel się swoimi przemyśleniami. Co Ci się podoba, co nie, itp.',
      },
      usageFrequency: {
        label: 'Jak często używasz PocketPal AI? (Opcjonalne)',
        options: {
          daily: 'Codziennie',
          weekly: 'Co tydzień',
          monthly: 'Co miesiąc',
          rarely: 'Rzadko',
        },
      },
      email: {
        label: 'Email kontaktowy (Opcjonalny)',
        placeholder: 'Twój adres email',
      },
      submit: 'Wyślij opinię',
      validation: {
        required: 'Proszę podać przynajmniej jedną opinię',
      },
      success: 'Dziękujemy za opinię!',
      error: {
        general: 'Błąd podczas wysyłania opinii. Spróbuj ponownie.',
      },
    },
  },
  pt: {
    model: 'Modelo',
    modelSettings: 'Configuração do Modelo',
    chatGenerationSettings: 'Configuração de geração de chat',
    save: 'Salvar',
    generationSettings: 'Configuração de geração',
    deleteChatTitle: 'Deletar chat',
    deleteChatMessage: 'Tem certeza de que deseja deletar este chat?',
    duplicateChatHistory: 'Duplicar histórico de chat',
    exportChatSession: 'Exportar sessão de chat',
    rename: 'Renomear',
    makeChatTemporary: 'Fazer chat temporário',
    attachmentButtonAccessibilityLabel: 'Envia mídia',
    emptyChatPlaceholder: 'Ainda não há mensagens aqui',
    fileButtonAccessibilityLabel: 'Arquivo',
    inputPlaceholder: 'Mensagem',
    sendButtonAccessibilityLabel: 'Enviar',
    modelNotLoaded: 'Modelo não carregado. Por favor, inicialize o modelo.',
    loadingModel: 'Carregando modelo...',
    typeYourMessage: 'Digite sua mensagem aqui',
    conversationReset: 'Conversa reiniciada!',
    networkError: 'Erro de rede. Tente novamente.',
    goToModels: 'Ir para Modelos',
    readyToChat: 'Pronto para conversar? Carregue o último modelo usado.',
    pleaseLoadModel: 'Carregue um modelo para conversar.',
    shortMemoryWarning: 'Advertência de memória',
    memoryWarning:
      'Advertência: O tamanho do modelo pode exceder a memória disponível. Isso pode afetar o desempenho e a estabilidade do seu dispositivo.',
    load: 'Carregar',
    cancel: 'Cancelar',
    download: 'Baixar',
    offload: 'Descarregar',
    reset: 'Reiniciar',
    saveChanges: 'Salvar alterações',
    delete: 'Deletar',
    dismiss: 'Descartar',
    replace: 'Substituir',
    keepBoth: 'Manter ambos',
    fileAlreadyExists: 'Arquivo já existe',
    fileAlreadyExistsMessage:
      'Um arquivo com este nome já existe. O que você gostaria de fazer?',
    addLocalModel: 'Dodaj model lokalny',
    localModel: 'Local',
    hfModel: 'HF',
    hfFABLabel: 'Pesquisar no Hugging Face',
    localFABLabel: 'Adicionar Modelo Local',
    resetFABLabel: 'Redefinir',
    downloaded: 'Baixado',
    grouped: 'Agrupado',
    proceedWithReset: 'Proceder com Reiniciar',
    confirmReset: 'Confirmar Reiniciar',
    modelSettingsTitle: 'Configuração do Modelo',
    autoOffloadLoad: 'Auto Offload/Load',
    autoOffloadLoadDescription: 'Odpowiedz modelu, gdy aplikacja é w tle.',
    metal: 'Metal',
    metalDescription: 'API sprzętu akcelerowanego przez Apple.',
    layersOnGPU: 'Warstwy w GPU: {{gpuLayers}}',
    contextSize: 'Rozmiar kontekstu',
    contextSizePlaceholder: 'Wpisz rozmiar kontekstu (min {{minContextSize}})',
    invalidContextSizeError: 'Wpisz poprawny numer (min {{minContextSize}})',
    modelReloadNotice:
      'Należy ponownie załadować model, aby zmiany zaczęły obowiązywać.',
    autoNavigateToChat: 'Automatycznie przejdź do konwersacji',
    autoNavigateToChatDescription:
      'Przejdź do konwersacji, gdy rozpocznie się ładowanie.',
    uiSettingsTitle: 'Ustawienia interfejsu użytkownika',
    darkMode: 'Ciemny tryb',
    darkModeDescription: 'Włącz lub wyłącz tryb ciemny.',
    displayMemoryUsage: 'Pokaż użycie pamięci',
    displayMemoryUsageDescription: 'Pokaż użycie pamięci na stronie czatu.',
    tooltipGroupByType: 'Agrupar por tipo de modelo',
    tooltipDownloaded: 'Mostrar apenas baixados',
    tooltipHf: 'Mostrar modelos provenientes de Hugging Face',
    unknownGroup: 'Desconhecido',
    menuTitleHf: 'Modelos Hugging Face',
    menuTitleDownloaded: 'Modelos Descarregados',
    menuTitleGrouped: 'Agrupar por Tipo de Modelo',
    menuTitleReset: 'Reiniciar Lista de Modelos',
    iOSBackgroundDownload: 'Download em segundo plano',
    iOSBackgroundDownloadDescription:
      'Permitir que os downloads continuem em segundo plano (será mais lento).',
    availableToUse: 'Pronto para Usar',
    availableToDownload: 'Disponível para Baixar',
    useAddButtonForMore: 'Use o botão + para encontrar mais modelos',
    'modelSettings.grammar':
      'Definir gramática para amostragem baseada em gramática',
    'modelSettings.stop':
      'Especificar strings de parada que não serão incluídas na conclusão',
    'modelSettings.n_predict':
      'Número máximo de tokens a prever ao gerar texto',
    'modelSettings.n_probs':
      'Número de probabilidades de tokens superiores a retornar por token',
    'modelSettings.top_k':
      'Limitar a seleção de tokens aos K tokens mais prováveis',
    'modelSettings.top_p':
      'Limitar a seleção de tokens àqueles com probabilidade cumulativa acima do limiar P',
    'modelSettings.min_p':
      'Probabilidade mínima para um token em relação ao token mais provável',
    'modelSettings.xtc_probability':
      'Chance de remoção de token via amostrador XTC',
    'modelSettings.xtc_threshold':
      'Limiar mínimo de probabilidade para remoção de tokens via XTC',
    'modelSettings.typical_p': 'Parâmetro para amostragem localmente típica',
    'modelSettings.temperature': 'Ajustar aleatoriedade do texto gerado',
    'modelSettings.penalty_last_n':
      'Número de tokens a considerar para penalidade de repetição',
    'modelSettings.penalty_repeat':
      'Controlar repetição de sequências de tokens',
    'modelSettings.penalty_freq': 'Penalidade de frequência alfa repetida',
    'modelSettings.penalty_present': 'Penalidade de presença alfa repetida',
    'modelSettings.mirostat':
      'Habilitar amostragem Mirostat para controle de perplexidade',
    'modelSettings.mirostat_tau': 'Entropia alvo do Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Taxa de aprendizado do Mirostat (eta)',
    'modelSettings.dry_multiplier':
      'Multiplicador de penalidade de repetição DRY',
    'modelSettings.dry_base': 'Valor base de penalidade de repetição DRY',
    'modelSettings.dry_allowed_length':
      'Comprimento máximo permitido antes da penalidade exponencial',
    'modelSettings.dry_penalty_last_n':
      'Número de tokens a verificar para repetições',
    'modelSettings.dry_sequence_breakers':
      'Quebradores de sequência para amostragem DRY',
    'modelSettings.ignore_eos':
      'Ignorar token de fim de fluxo e continuar gerando',
    'modelSettings.logit_bias': 'Modificar probabilidade de tokens específicos',
    'modelSettings.seed': 'Semente do gerador de números aleatórios',
    about: {
      screenTitle: 'Informações do Aplicativo',
      description:
        'Um aplicativo que traz modelos de linguagem diretamente para seu telefone. Baseado em llama.cpp e llama.rn.',
      supportProject: 'Apoie o Projeto',
      supportProjectDescription:
        'Se você gosta de usar o PocketPal AI, considere apoiar o projeto das seguintes formas:',
      githubButton: 'Favoritar no GitHub',
      orText: 'ou',
      orBy: 'ou por',
      sponsorButton: 'Torne-se um Patrocinador',
      versionCopiedTitle: 'Versão copiada',
      versionCopiedDescription:
        'As informações da versão foram copiadas para a área de transferência',
    },
    feedback: {
      title: 'Enviar Feedback',
      description:
        'Sua opinião é importante! Conte-nos como o PocketPal AI está te ajudando e o que podemos fazer para torná-lo ainda mais útil.',
      shareThoughtsButton: 'Compartilhe suas opiniões',
      useCase: {
        label: 'Para que você está usando o PocketPal AI?',
        placeholder: 'ex: resumos, roleplay, etc.',
      },
      featureRequests: {
        label: 'Quais recursos você gostaria de ver no futuro?',
        placeholder: 'Compartilhe suas ideias e sugestões de recursos',
      },
      generalFeedback: {
        label: 'Outros comentários?',
        placeholder:
          'Compartilhe seus pensamentos. O que você gosta, o que não gosta, etc.',
      },
      usageFrequency: {
        label: 'Com que frequência você usa o PocketPal AI? (Opcional)',
        options: {
          daily: 'Diariamente',
          weekly: 'Semanalmente',
          monthly: 'Mensalmente',
          rarely: 'Raramente',
        },
      },
      email: {
        label: 'Email de Contato (Opcional)',
        placeholder: 'Seu endereço de email',
      },
      submit: 'Enviar Feedback',
      validation: {
        required: 'Por favor, forneça pelo menos um feedback',
      },
      success: 'Obrigado pelo seu feedback!',
      error: {
        general: 'Erro ao enviar feedback. Por favor, tente novamente.',
      },
    },
  },
  ru: {
    model: 'Модель',
    modelSettings: 'Настройки модели',
    chatGenerationSettings: 'Настройки генерации чата',
    save: 'Сохранить',
    generationSettings: 'Настройки генерации',
    deleteChatTitle: 'Удалить чат',
    deleteChatMessage: 'Вы уверены, что хотите удалить этот чат?',
    duplicateChatHistory: 'Дублировать историю чата',
    exportChatSession: 'Экспортировать сессию чата',
    rename: 'Переименовать',
    makeChatTemporary: 'Сделать чат временным',
    attachmentButtonAccessibilityLabel: 'Отправить медиа',
    emptyChatPlaceholder: 'Пока что у вас нет сообщений',
    fileButtonAccessibilityLabel: 'Файл',
    inputPlaceholder: 'Сообщение',
    sendButtonAccessibilityLabel: 'Отправить',
    modelNotLoaded: 'Модель не загружена. Пожалуйста, инициализируйте модель.',
    loadingModel: 'Загрузка модели...',
    typeYourMessage: 'Введите ваше сообщение здесь',
    conversationReset: 'Конверсация была сброшена!',
    networkError: 'Ошибка сети. Пожалуйста, попробуйте снова.',
    goToModels: 'Перейти к моделям',
    readyToChat: 'Готовы к общению? Загрузите последний используемый модель.',
    pleaseLoadModel: 'Загрузите модель для общения.',
    shortMemoryWarning: 'Предупреждение о памяти',
    memoryWarning:
      'Предупреждение: Размер модели может превышать доступную память. Это может повлиять на производительность и стабильность вашего устройства.',
    load: 'Загрузить',
    cancel: 'Отменить',
    download: 'Скачать',
    offload: 'Отменить',
    reset: 'Сбросить',
    saveChanges: 'Сохранить',
    delete: 'Удалить',
    dismiss: 'Отменить',
    replace: 'Заменить',
    keepBoth: 'Оставить оба',
    fileAlreadyExists: 'Файл уже существует',
    fileAlreadyExistsMessage:
      'Файл с таким названием уже существует. Что вы хотите сделать?',
    addLocalModel: 'Добавить локальную модель',
    localModel: 'Локальная',
    hfModel: 'HF',
    hfFABLabel: 'Поиск в Hugging Face',
    localFABLabel: 'Добавить локальную модель',
    resetFABLabel: 'Сбросить',
    downloaded: 'Скачано',
    grouped: 'Сгруппировано',
    proceedWithReset: 'Продолжить сброс',
    confirmReset: 'Подтвердить сброс',
    modelSettingsTitle: 'Конфигурация модели',
    autoOffloadLoad: 'Автоматическое выгрузка/загрузка',
    autoOffloadLoadDescription:
      'Выгрузить модель, когда приложение находится в фоне.',
    metal: 'Metal',
    metalDescription: 'API оборудования, ускоренного Apple.',
    layersOnGPU: 'Слои в GPU: {{gpuLayers}}',
    contextSize: 'Размер контекста',
    contextSizePlaceholder:
      'Введите размер контекста (минимум {{minContextSize}})',
    invalidContextSizeError:
      'Введите правильный номер (минимум {{minContextSize}})',
    modelReloadNotice:
      'Необходимо перезагрузить модель, чтобы изменения вступили в силу.',
    autoNavigateToChat: 'Автоматически перейти к конверсации',
    autoNavigateToChatDescription:
      'Перейти к конверсации, когда начнется загрузка.',
    uiSettingsTitle: 'Настройки пользовательского интерфейса',
    darkMode: 'Темный режим',
    darkModeDescription: 'Включить или выключить темный режим.',
    displayMemoryUsage: 'Показать использование памяти',
    displayMemoryUsageDescription:
      'Показать использование памяти на странице чата.',
    tooltipGroupByType: 'Группировать по типу модели',
    tooltipDownloaded: 'Показать только загруженные',
    tooltipHf: 'Показать модели из HuggingFace',
    unknownGroup: 'Неизвестно',
    menuTitleHf: 'Модели Hugging Face',
    menuTitleDownloaded: 'Загруженные модели',
    menuTitleGrouped: 'Группировать по типу модели',
    menuTitleReset: 'Сбросить список моделей',
    iOSBackgroundDownload: 'Фоновая загрузка',
    iOSBackgroundDownloadDescription:
      'Разрешить загрузки в фоновом режиме (это будет медленнее).',
    availableToUse: 'Готов к Использованию',
    availableToDownload: 'Доступен для Скачивания',
    useAddButtonForMore: 'Используйте кнопку + для поиска моделей',
    'modelSettings.grammar':
      'Установить грамматику для выборки на основе грамматики',
    'modelSettings.stop':
      'Вказати стоп-рядки, які не будуть включені в завершення',
    'modelSettings.n_predict':
      'Максимальна кількість токенів для передбачення при генерації тексту',
    'modelSettings.n_probs':
      'Кількість ймовірностей найкращих токенів для повернення на токен',
    'modelSettings.top_k':
      'Обмежити вибір токенів K найбільш ймовірними токенами',
    'modelSettings.top_p':
      'Обмежити вибір токенів тими, у яких кумулятивна ймовірність вище порогу P',
    'modelSettings.min_p':
      'Мінімальна ймовірність для токена відносно найбільш ймовірного токена',
    'modelSettings.xtc_probability': 'Шанс видалення токена через семплер XTC',
    'modelSettings.xtc_threshold':
      'Мінімальний поріг ймовірності для видалення токенів через XTC',
    'modelSettings.typical_p': 'Параметр для локально типової вибірки',
    'modelSettings.temperature': 'Налаштувати випадковість генерованого тексту',
    'modelSettings.penalty_last_n':
      'Кількість токенів для врахування при штрафі за повторення',
    'modelSettings.penalty_repeat':
      'Контролювати повторення послідовностей токенів',
    'modelSettings.penalty_freq': 'Штраф за частоту повторення альфа',
    'modelSettings.penalty_present': 'Штраф за присутність повторення альфа',
    'modelSettings.mirostat':
      'Увімкнути вибірку Mirostat для контролю перплексії',
    'modelSettings.mirostat_tau': 'Цільова ентропія Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Швидкість навчання Mirostat (eta)',
    'modelSettings.dry_multiplier': 'Множник штрафу за повторення DRY',
    'modelSettings.dry_base': 'Базове значення штрафу за повторення DRY',
    'modelSettings.dry_allowed_length':
      'Максимальна допустима довжина перед експоненційним штрафом',
    'modelSettings.dry_penalty_last_n':
      'Кількість токенів для сканування на повторення',
    'modelSettings.dry_sequence_breakers':
      'Переривники послідовності для вибірки DRY',
    'modelSettings.ignore_eos':
      'Ігнорувати токен кінця потоку і продовжувати генерацію',
    'modelSettings.logit_bias': 'Змінити ймовірність певних токенів',
    'modelSettings.seed': 'Зерно генератора випадкових чисел',
    about: {
      screenTitle: 'Информация о приложении',
      description:
        'Приложение, которое позволяет использовать языковые модели прямо на вашем телефоне. Основано на llama.cpp и llama.rn.',
      supportProject: 'Поддержать проект',
      supportProjectDescription:
        'Если вам нравится PocketPal AI, рассмотрите возможность поддержки проекта следующими способами:',
      githubButton: 'Отметить звездой на GitHub',
      orText: 'или',
      orBy: 'или через',
      sponsorButton: 'Стать спонсором',
      versionCopiedTitle: 'Версия скопирована',
      versionCopiedDescription:
        'Информация о версии скопирована в буфер обмена',
    },
    feedback: {
      title: 'Отправить отзыв',
      description:
        'Ваше мнение важно! Расскажите нам, как PocketPal AI помогает вам и что мы можем сделать, чтобы он стал еще более полезным.',
      shareThoughtsButton: 'Поделитесь своими мыслями',
      useCase: {
        label: 'Для чего вы используете PocketPal AI?',
        placeholder: 'например, резюме, ролевые игры и т.д.',
      },
      featureRequests: {
        label: 'Какие функции вы хотели бы видеть в будущем?',
        placeholder: 'Поделитесь своими идеями и предложениями по функциям',
      },
      generalFeedback: {
        label: 'Другие комментарии?',
        placeholder:
          'Поделитесь своими размышлениями. Что вам нравится, что нет, и т.д.',
      },
      usageFrequency: {
        label: 'Как часто вы используете PocketPal AI? (Необязательно)',
        options: {
          daily: 'Ежедневно',
          weekly: 'Еженедельно',
          monthly: 'Ежемесячно',
          rarely: 'Редко',
        },
      },
      email: {
        label: 'Email для связи (Необязательно)',
        placeholder: 'Ваш адрес электронной почты',
      },
      submit: 'Отправить отзыв',
      validation: {
        required: 'Пожалуйста, предоставьте хотя бы один отзыв',
      },
      success: 'Спасибо за ваш отзыв!',
      error: {
        general: 'Ошибка при отправке отзыва. Пожалуйста, попробуйте еще раз.',
      },
    },
  },
  tr: {
    model: 'Model',
    modelSettings: 'Model Ayarları',
    chatGenerationSettings: 'Chat Oluşturma Ayarları',
    save: 'Kaydet',
    generationSettings: 'Oluşturma Ayarları',
    deleteChatTitle: 'Chati Sil',
    deleteChatMessage: 'Chati silmek istediğinizden emin misiniz?',
    duplicateChatHistory: 'Chat Geçmişini Duplica',
    exportChatSession: 'Chat Oturumu İçeri Aktar',
    rename: 'Yeniden Adlandır',
    makeChatTemporary: 'Chati Geçici Olarak Yap',
    attachmentButtonAccessibilityLabel: 'Medya gönder',
    emptyChatPlaceholder: 'Henüz mesaj yok',
    fileButtonAccessibilityLabel: 'Dosya',
    inputPlaceholder: 'Mesaj yazın',
    sendButtonAccessibilityLabel: 'Gönder',
    modelNotLoaded: 'Model yüklenmedi. Modeli başlatın.',
    loadingModel: 'Model yükleniyor...',
    typeYourMessage: 'Mesajınızı buraya yazın',
    conversationReset: 'Konuşma sıfırlandı!',
    networkError: 'Ağ hatası. Lütfen tekrar deneyin.',
    goToModels: 'Modellere git',
    readyToChat: 'Sohbete hazır mısınız? Son kullanılan modeli yükleyin.',
    pleaseLoadModel: 'Sohbet için model yükleyin.',
    shortMemoryWarning: 'Hafıza Uyarısı',
    memoryWarning:
      'Uyarı: Model boyutu kullanılabilir hafızayı aşabilir. Bu, cihazınızın performansını ve kararlılığını etkileyebilir.',
    load: 'Yükle',
    cancel: 'İptal',
    download: 'İndir',
    offload: 'Aç',
    reset: 'Sıfırla',
    saveChanges: 'Kaydet',
    delete: 'Sil',
    dismiss: 'Kapat',
    replace: 'Değiştir',
    keepBoth: 'Her ikisini de koru',
    fileAlreadyExists: 'Dosya zaten var',
    fileAlreadyExistsMessage:
      'Bu ada sahip bir dosya zaten var. Ne yapmak istiyorsunuz?',
    addLocalModel: 'Yerel modeli ekle',
    localModel: 'Yerel',
    hfModel: 'HF',
    hfFABLabel: "HuggingFace'te Ara",
    localFABLabel: 'Yerel Model Ekle',
    resetFABLabel: 'Sıfırla',
    downloaded: 'İndirildi',
    grouped: 'Gruplanmış',
    proceedWithReset: 'Sıfırlamaya devam et',
    confirmReset: 'Sıfırlamayı onayla',
    modelSettingsTitle: 'Konfiguracja modelu',
    autoOffloadLoad: 'Auto Offload/Load',
    autoOffloadLoadDescription: 'Odpowiedz modelu, gdy aplikacja jest w tle.',
    metal: 'Metal',
    metalDescription: 'API sprzętu akcelerowanego przez Apple.',
    layersOnGPU: 'Warstwy w GPU: {{gpuLayers}}',
    contextSize: 'Rozmiar kontekstu',
    contextSizePlaceholder: 'Wpisz rozmiar kontekstu (min {{minContextSize}})',
    invalidContextSizeError: 'Wpisz poprawny numer (min {{minContextSize}})',
    modelReloadNotice:
      'Należy ponownie załadować model, aby zmiany zaczęły obowiązywać.',
    autoNavigateToChat: 'Automatycznie przejdź do konwersacji',
    autoNavigateToChatDescription:
      'Przejdź do konwersacji, gdy rozpocznie się ładowanie.',
    uiSettingsTitle: 'Ustawienia interfejsu użytkownika',
    darkMode: 'Ciemny tryb',
    darkModeDescription: 'Włącz lub wyłącz tryb ciemny.',
    displayMemoryUsage: 'Pokaż użycie pamięci',
    displayMemoryUsageDescription: 'Pokaż użycie pamięci na stronie czatu.',
    tooltipGroupByType: 'Model türüne göre gruplandır',
    tooltipDownloaded: 'Yalnızca indirilenleri göster',
    tooltipHf: "HuggingFace'teki modelleri göster",
    unknownGroup: 'Bilinmeyen',
    menuTitleHf: 'Hugging Face Modelleri',
    menuTitleDownloaded: 'İndirilen Modeller',
    menuTitleGrouped: 'Model Türüne Göre Grupla',
    menuTitleReset: 'Model Listesini Sıfırla',
    iOSBackgroundDownload: 'Arka Plan İndirmesi',
    iOSBackgroundDownloadDescription:
      'İndirmelerin arka planda devam etmesine izin verin (daha yavaş olacaktır).',
    availableToUse: 'Kullanıma Hazır',
    availableToDownload: 'İndirilebilir',
    useAddButtonForMore: 'Daha fazla model bulmak için + düğmesini kullanın',
    'modelSettings.grammar':
      'Dilbilgisi tabanlı örnekleme için dilbilgisi ayarla',
    'modelSettings.stop':
      'Tamamlamaya dahil edilmeyecek durdurma dizelerini belirt',
    'modelSettings.n_predict':
      'Metin oluştururken tahmin edilecek maksimum token sayısı',
    'modelSettings.n_probs':
      'Token başına döndürülecek en yüksek token olasılıkları sayısı',
    'modelSettings.top_k': 'Token seçimini en olası K tokene sınırla',
    'modelSettings.top_p':
      'Token seçimini kümülatif olasılığı P eşiğinin üzerinde olan tokenlere sınırla',
    'modelSettings.min_p':
      'En olası tokene göre bir token için minimum olasılık',
    'modelSettings.xtc_probability': 'XTC örnekleyici ile token kaldırma şansı',
    'modelSettings.xtc_threshold':
      'XTC token kaldırma için minimum olasılık eşiği',
    'modelSettings.typical_p': 'Yerel tipik örnekleme için parametre',
    'modelSettings.temperature': 'Oluşturulan metnin rastgeleliğini ayarla',
    'modelSettings.penalty_last_n':
      'Tekrar cezası için dikkate alınacak token sayısı',
    'modelSettings.penalty_repeat': 'Token dizilerinin tekrarını kontrol et',
    'modelSettings.penalty_freq': 'Tekrar alfa frekans cezası',
    'modelSettings.penalty_present': 'Tekrar alfa varlık cezası',
    'modelSettings.mirostat':
      'Perpleksite kontrolü için Mirostat örneklemeyi etkinleştir',
    'modelSettings.mirostat_tau': 'Mirostat hedef entropi (tau)',
    'modelSettings.mirostat_eta': 'Mirostat öğrenme oranı (eta)',
    'modelSettings.dry_multiplier': 'DRY tekrar cezası çarpanı',
    'modelSettings.dry_base': 'DRY tekrar cezası taban değeri',
    'modelSettings.dry_allowed_length':
      'Üstel ceza öncesi maksimum izin verilen uzunluk',
    'modelSettings.dry_penalty_last_n': 'Tekrarlar için taranacak token sayısı',
    'modelSettings.dry_sequence_breakers': 'DRY örnekleme için dizi kesiciler',
    'modelSettings.ignore_eos':
      'Akış sonu tokenini yoksay ve üretmeye devam et',
    'modelSettings.logit_bias': 'Belirli tokenlerin olasılığını değiştir',
    'modelSettings.seed': 'Rastgele sayı üreteci tohumu',
    about: {
      screenTitle: 'Uygulama Hakkında',
      description:
        'Dil modellerini doğrudan telefonunuzda kullanmanızı sağlayan bir uygulama. llama.cpp ve llama.rn tabanlı.',
      supportProject: 'Projeyi Destekle',
      supportProjectDescription:
        "PocketPal AI'yı beğendiyseniz, aşağıdaki yollarla projeyi desteklemeyi düşünebilirsiniz:",
      githubButton: "GitHub'da Yıldızla",
      orText: 'veya',
      orBy: 'ya da',
      sponsorButton: 'Sponsor Ol',
      versionCopiedTitle: 'Sürüm kopyalandı',
      versionCopiedDescription: 'Sürüm bilgileri panoya kopyalandı',
    },
    feedback: {
      title: 'Geri Bildirim Gönder',
      description:
        "Görüşleriniz önemli! PocketPal AI'ın size nasıl yardımcı olduğunu ve onu daha faydalı hale getirmek için neler yapabileceğimizi bize anlatın.",
      shareThoughtsButton: 'Düşüncelerinizi paylaşın',
      useCase: {
        label: "PocketPal AI'ı ne için kullanıyorsunuz?",
        placeholder: 'örn: özetleme, rol yapma, vb.',
      },
      featureRequests: {
        label: 'Gelecekte hangi özellikleri görmek istersiniz?',
        placeholder: 'Özellik fikirlerinizi ve önerilerinizi paylaşın',
      },
      generalFeedback: {
        label: 'Başka geri bildiriminiz var mı?',
        placeholder:
          'Düşüncelerinizi paylaşın. Neleri beğendiğinizi, beğenmediğinizi vb.',
      },
      usageFrequency: {
        label: "PocketPal AI'ı ne sıklıkla kullanıyorsunuz? (İsteğe bağlı)",
        options: {
          daily: 'Günlük',
          weekly: 'Haftalık',
          monthly: 'Aylık',
          rarely: 'Nadiren',
        },
      },
      email: {
        label: 'İletişim E-postası (İsteğe bağlı)',
        placeholder: 'E-posta adresiniz',
      },
      submit: 'Geri Bildirim Gönder',
      validation: {
        required: 'Lütfen en az bir geri bildirim sağlayın',
      },
      success: 'Geri bildiriminiz için teşekkürler!',
      error: {
        general:
          'Geri bildirim gönderilirken hata oluştu. Lütfen tekrar deneyin.',
      },
    },
  },
  uk: {
    model: 'Модель',
    modelSettings: 'Настройки модели',
    chatGenerationSettings: 'Настройки генерации чата',
    save: 'Зберегти',
    generationSettings: 'Настройки генерации',
    deleteChatTitle: 'Видалити чат',
    deleteChatMessage: 'Ви впевнені, що хочете видалити цей чат?',
    duplicateChatHistory: 'Дублировать историю чата',
    exportChatSession: 'Экспортировать сессию чата',
    rename: 'Переименовать',
    makeChatTemporary: 'Сделать чат временным',
    attachmentButtonAccessibilityLabel: 'Надіслати медіа',
    emptyChatPlaceholder: 'Повідомлень ще немає',
    fileButtonAccessibilityLabel: 'Файл',
    inputPlaceholder: 'Повідомлення',
    sendButtonAccessibilityLabel: 'Надіслати',
    modelNotLoaded: 'Модель не загружена. Пожалуйста, инициализируйте модель.',
    loadingModel: 'Загрузка модели...',
    typeYourMessage: 'Введите ваше сообщение здесь',
    conversationReset: 'Конверсация была сброшена!',
    networkError: 'Ошибка сети. Пожалуйста, попробуйте снова.',
    goToModels: 'Перейти к моделям',
    readyToChat: 'Готовы к общению? Загрузите последний используемый модель.',
    pleaseLoadModel: 'Завантажте модель для спілкування.',
    shortMemoryWarning: 'Предупреждение о памяти',
    memoryWarning:
      "Попередження: Розмір моделі може перевищувати доступну пам'ять. Це може вплинути на продуктивність і стабільність вашого пристрою.",
    load: 'Загрузить',
    cancel: 'Отменить',
    download: 'Скачать',
    offload: 'Отменить',
    reset: 'Сбросить',
    saveChanges: 'Сохранить',
    delete: 'Удалить',
    dismiss: 'Отменить',
    replace: 'Заменить',
    keepBoth: 'Оставить оба',
    fileAlreadyExists: 'Файл уже существует',
    fileAlreadyExistsMessage:
      'Файл с таким названием уже существует. Что вы хотите сделать?',
    addLocalModel: 'Добавить локальную модель',
    localModel: 'Локальний',
    hfModel: 'HF',
    hfFABLabel: 'Пошук у Hugging Face',
    localFABLabel: 'Додати локальну модель',
    resetFABLabel: 'Скинути',
    downloaded: 'Скачано',
    grouped: 'Сгруппировано',
    proceedWithReset: 'Продолжить сброс',
    confirmReset: 'Подтвердить сброс',
    modelSettingsTitle: 'Конфигурация модели',
    autoOffloadLoad: 'Автоматическое выгрузка/загрузка',
    autoOffloadLoadDescription:
      'Выгрузить модель, когда приложение находится в фоне.',
    metal: 'Metal',
    metalDescription: 'API оборудования, ускоренного Apple.',
    layersOnGPU: 'Слои в GPU: {{gpuLayers}}',
    contextSize: 'Размер контекста',
    contextSizePlaceholder:
      'Введите размер контекста (минимум {{minContextSize}})',
    invalidContextSizeError:
      'Введите правильный номер (минимум {{minContextSize}})',
    modelReloadNotice:
      'Необходимо перезагрузить модель, чтобы изменения вступили в силу.',
    autoNavigateToChat: 'Автоматически перейти к конверсации',
    autoNavigateToChatDescription:
      'Перейти к конверсации, когда начнется загрузка.',
    uiSettingsTitle: 'Настройки пользовательского интерфейса',
    darkMode: 'Темный режим',
    darkModeDescription: 'Включить или выключить темный режим.',
    displayMemoryUsage: 'Показать использование памяти',
    displayMemoryUsageDescription:
      'Показать использование памяти на странице чата.',
    tooltipGroupByType: 'Групувати за типом моделі',
    tooltipDownloaded: 'Показати лише завантажені',
    tooltipHf: 'Показати моделі з HuggingFace',
    unknownGroup: 'Невідомо',
    menuTitleHf: 'Моделі Hugging Face',
    menuTitleDownloaded: 'Завантажені моделі',
    menuTitleGrouped: 'Групувати за типом моделі',
    menuTitleReset: 'Скинути список моделей',
    iOSBackgroundDownload: 'Фонове завантаження',
    iOSBackgroundDownloadDescription:
      'Дозволити завантаження у фоновому режимі (це буде повільніше).',
    availableToUse: 'Готовий до Використання',
    availableToDownload: 'Доступний для Завантаження',
    useAddButtonForMore: 'Використовуйте кнопку + для пошуку моделей',
    'modelSettings.grammar':
      'Встановити граматику для вибірки на основі граматики',
    'modelSettings.stop':
      'Вказати стоп-рядки, які не будуть включені в завершення',
    'modelSettings.n_predict':
      'Максимальна кількість токенів для передбачення при генерації тексту',
    'modelSettings.n_probs':
      'Кількість ймовірностей найкращих токенів для повернення на токен',
    'modelSettings.top_k':
      'Обмежити вибір токенів K найбільш ймовірними токенами',
    'modelSettings.top_p':
      'Обмежити вибір токенів тими, у яких кумулятивна ймовірність вище порогу P',
    'modelSettings.min_p':
      'Мінімальна ймовірність для токена відносно найбільш ймовірного токена',
    'modelSettings.xtc_probability': 'Шанс видалення токена через семплер XTC',
    'modelSettings.xtc_threshold':
      'Мінімальний поріг ймовірності для видалення токенів через XTC',
    'modelSettings.typical_p': 'Параметр для локально типової вибірки',
    'modelSettings.temperature': 'Налаштувати випадковість генерованого тексту',
    'modelSettings.penalty_last_n':
      'Кількість токенів для врахування при штрафі за повторення',
    'modelSettings.penalty_repeat':
      'Контролювати повторення послідовностей токенів',
    'modelSettings.penalty_freq': 'Штраф за частоту повторення альфа',
    'modelSettings.penalty_present': 'Штраф за присутність повторення альфа',
    'modelSettings.mirostat':
      'Увімкнути вибірку Mirostat для контролю перплексії',
    'modelSettings.mirostat_tau': 'Цільова ентропія Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Швидкість навчання Mirostat (eta)',
    'modelSettings.dry_multiplier': 'Множник штрафу за повторення DRY',
    'modelSettings.dry_base': 'Базове значення штрафу за повторення DRY',
    'modelSettings.dry_allowed_length':
      'Максимальна допустима довжина перед експоненційним штрафом',
    'modelSettings.dry_penalty_last_n':
      'Кількість токенів для сканування на повторення',
    'modelSettings.dry_sequence_breakers':
      'Переривники послідовності для вибірки DRY',
    'modelSettings.ignore_eos':
      'Ігнорувати токен кінця потоку і продовжувати генерацію',
    'modelSettings.logit_bias': 'Змінити ймовірність певних токенів',
    'modelSettings.seed': 'Зерно генератора випадкових чисел',
    about: {
      screenTitle: 'Інформація про додаток',
      description:
        'Додаток, який дозволяє використовувати мовні моделі прямо на вашому телефоні. Базується на llama.cpp та llama.rn.',
      supportProject: 'Підтримати проект',
      supportProjectDescription:
        'Якщо вам подобається PocketPal AI, розгляньте можливість підтримки проекту наступними способами:',
      githubButton: 'Зірка на GitHub',
      orText: 'або',
      orBy: 'або через',
      sponsorButton: 'Стати спонсором',
      versionCopiedTitle: 'Версію скопійовано',
      versionCopiedDescription:
        'Інформацію про версію скопійовано в буфер обміну',
    },
    feedback: {
      title: 'Надіслати відгук',
      description:
        'Ваша думка важлива! Розкажіть нам, як PocketPal AI допомагає вам і що ми можемо зробити, щоб зробити його ще кориснішим.',
      shareThoughtsButton: 'Поділіться своїми думками',
      useCase: {
        label: 'Для чого ви використовуєте PocketPal AI?',
        placeholder: 'напр: підсумки, рольові ігри тощо',
      },
      featureRequests: {
        label: 'Які функції ви хотіли б побачити в майбутньому?',
        placeholder: 'Поділіться своїми ідеями та пропозиціями щодо функцій',
      },
      generalFeedback: {
        label: 'Інші коментарі?',
        placeholder:
          'Поділіться своїми думками. Що вам подобається, що не подобається тощо',
      },
      usageFrequency: {
        label: "Як часто ви використовуєте PocketPal AI? (Необов'язково)",
        options: {
          daily: 'Щоденно',
          weekly: 'Щотижня',
          monthly: 'Щомісяця',
          rarely: 'Рідко',
        },
      },
      email: {
        label: "Контактна електронна пошта (Необов'язково)",
        placeholder: 'Ваша електронна адреса',
      },
      submit: 'Надіслати відгук',
      validation: {
        required: 'Будь ласка, надайте хоча б один відгук',
      },
      success: 'Дякуємо за ваш відгук!',
      error: {
        general:
          'Під час надсилання відгуку сталася помилка. Будь ласка, спробуйте ще раз.',
      },
    },
  },
  ca: {
    model: 'Model',
    modelSettings: 'Configuració del model',
    chatGenerationSettings: 'Configuració de generació de chat',
    save: 'Guardar',
    generationSettings: 'Configuració de generació',
    duplicateChatHistory: 'Duplicar històric de chat',
    deleteChatTitle: 'Eliminar chat',
    deleteChatMessage: 'Estàs segur de que vols eliminar aquest chat?',
    exportChatSession: 'Exportar sessió de chat',
    rename: 'Renombrar',
    makeChatTemporary: 'Faire chat temporal',
    attachmentButtonAccessibilityLabel: 'Enviar multimèdia',
    emptyChatPlaceholder: 'Encara no hi ha missatges',
    fileButtonAccessibilityLabel: 'Arxiu',
    inputPlaceholder: 'Missatge',
    sendButtonAccessibilityLabel: 'Enviar',
    modelNotLoaded: 'Model no carregat. Si us plau, inicialitzeu el model.',
    loadingModel: 'Carregant model...',
    typeYourMessage: 'Escriviu el vostre missatge aquí',
    conversationReset: 'Conversa reiniciada!',
    networkError: 'Error de xarxa. Torneu-ho a intentar.',
    goToModels: 'Anar a Models',
    readyToChat: "Preparat per xatejar? Carregueu l'últim model utilitzat.",
    pleaseLoadModel: 'Carregueu un model per xatejar.',
    shortMemoryWarning: 'Advertència de memòria',
    memoryWarning:
      "Advertència: La mida del model pot excedir la memòria disponible. Això podria afectar el rendiment i l'estabilitat del vostre dispositiu.",
    load: 'Carregar',
    cancel: 'Cancel·lar',
    download: 'Descarregar',
    offload: 'Alliberar',
    reset: 'Reiniciar',
    saveChanges: 'Guardar canvis',
    delete: 'Eliminar',
    dismiss: 'Descartar',
    replace: 'Substituir',
    keepBoth: 'Mantenir tots dos',
    fileAlreadyExists: "L'arxiu ja existeix",
    fileAlreadyExistsMessage:
      'Ja existeix un arxiu amb aquest nom. Què vols fer?',
    addLocalModel: 'Afegir model local',
    localModel: 'Local',
    hfModel: 'HF',
    hfFABLabel: 'Cercar a Hugging Face',
    localFABLabel: 'Afegir Model Local',
    resetFABLabel: 'Restablir',
    downloaded: 'Descarregat',
    grouped: 'Agrupat',
    proceedWithReset: 'Procedir amb el reinici',
    confirmReset: 'Confirmar reinici',
    modelSettingsTitle: 'Configuració del model',
    autoOffloadLoad: 'Auto Descarregar/Carregar',
    autoOffloadLoadDescription:
      "Descarregar el model quan l'aplicació estigui en segon pla.",
    metal: 'Metal',
    metalDescription: "API accelerada per maquinari d'Apple.",
    layersOnGPU: 'Capes a la GPU: {{gpuLayers}}',
    contextSize: 'Mida del context',
    contextSizePlaceholder:
      'Introduïu la mida del context (mínim {{minContextSize}})',
    invalidContextSizeError:
      'Si us plau, introduïu un número vàlid (mínim {{minContextSize}})',
    modelReloadNotice:
      'Cal recarregar el model perquè els canvis tinguin efecte.',
    autoNavigateToChat: 'Navegar automàticament a la conversa',
    autoNavigateToChatDescription:
      'Navegar a la conversa quan comenci la càrrega.',
    uiSettingsTitle: "Configuració de la interfície d'usuari",
    darkMode: 'Mode fosc',
    darkModeDescription: 'Activa o desactiva el mode fosc.',
    displayMemoryUsage: 'Mostrar ús de memòria',
    displayMemoryUsageDescription: 'Mostrar ús de memòria a la pàgina de xat.',
    tooltipGroupByType: 'Agrupar per tipus de model',
    tooltipDownloaded: 'Mostrar només descarregats',
    tooltipHf: 'Mostrar models de HuggingFace',
    unknownGroup: 'Desconegut',
    menuTitleHf: 'Models Hugging Face',
    menuTitleDownloaded: 'Models Descarregats',
    menuTitleGrouped: 'Agrupar per Tipus de Model',
    menuTitleReset: 'Reiniciar Llista de Models',
    iOSBackgroundDownload: 'Descàrrega en segon pla',
    iOSBackgroundDownloadDescription:
      'Permet que les descàrregues continuïn en segon pla (serà més lent).',
    availableToUse: 'Llest per Usar',
    availableToDownload: 'Disponible per Descarregar',
    useAddButtonForMore: 'Utilitzeu el botó + per trobar més models',
    'modelSettings.grammar':
      'Establecer gramática para el muestreo basado en gramática',
    'modelSettings.stop':
      'Especificar cadenas de parada que no se incluirán en la completación',
    'modelSettings.n_predict':
      'Número máximo de tokens a predecir al generar texto',
    'modelSettings.n_probs':
      'Número de probabilidades de tokens superiores a devolver por token',
    'modelSettings.top_k':
      'Limitar la selección de tokens a los K tokens más probables',
    'modelSettings.top_p':
      'Limitar la selección de tokens a aquellos con probabilidad acumulada superior al umbral P',
    'modelSettings.min_p':
      'Probabilidad mínima para un token en relación al token más probable',
    'modelSettings.xtc_probability':
      'Probabilidad de eliminación de tokens mediante el muestreador XTC',
    'modelSettings.xtc_threshold':
      'Umbral mínimo de probabilidad para la eliminación de tokens mediante XTC',
    'modelSettings.typical_p': 'Parámetro para el muestreo localmente típico',
    'modelSettings.temperature': 'Ajustar la aleatoriedad del texto generado',
    'modelSettings.penalty_last_n':
      'Número de tokens a considerar para la penalización por repetición',
    'modelSettings.penalty_repeat':
      'Controlar la repetición de secuencias de tokens',
    'modelSettings.penalty_freq': 'Penalización de frecuencia alfa repetida',
    'modelSettings.penalty_present': 'Penalización de presencia alfa repetida',
    'modelSettings.mirostat':
      'Habilitar muestreo Mirostat para control de perplejidad',
    'modelSettings.mirostat_tau': 'Entropía objetivo de Mirostat (tau)',
    'modelSettings.mirostat_eta': 'Tasa de aprendizado de Mirostat (eta)',
    'modelSettings.dry_multiplier':
      'Multiplicador de penalización por repetición DRY',
    'modelSettings.dry_base': 'Valor base de penalización por repetición DRY',
    'modelSettings.dry_allowed_length':
      'Longitud máxima permitida antes de penalización exponencial',
    'modelSettings.dry_penalty_last_n':
      'Número de tokens a escanear para repeticiones',
    'modelSettings.dry_sequence_breakers':
      'Rompedores de secuencia para muestreo DRY',
    'modelSettings.ignore_eos':
      'Ignorar token de fin de secuencia y continuar generando',
    'modelSettings.logit_bias': 'Modificar probabilidad de tokens específicos',
    'modelSettings.seed': 'Semilla del generador de números aleatorios',
    about: {
      screenTitle: "Informació sobre l'aplicació",
      description:
        'Una aplicació que porta models de llenguatge directament al teu telèfon. Basat en llama.cpp i llama.rn.',
      supportProject: 'Dona suport al projecte',
      supportProjectDescription:
        "Si t'agrada utilitzar PocketPal AI, considera donar suport al projecte de les següents maneres:",
      githubButton: 'Estrella a GitHub',
      orText: 'o',
      orBy: 'o mitjançant',
      sponsorButton: 'Fes-te patrocinador',
      versionCopiedTitle: 'Versió copiada',
      versionCopiedDescription:
        "La informació de la versió s'ha copiat al porta-retalls",
    },
    feedback: {
      title: 'Enviar Comentaris',
      description:
        "La vostra opinió és important! Explica'ns com PocketPal AI t'està ajudant i què podem fer per fer-lo encara més útil.",
      shareThoughtsButton: 'Comparteix els teus pensaments',
      useCase: {
        label: 'Per a què utilitzes PocketPal AI?',
        placeholder: 'ex: resums, jocs de rol, etc.',
      },
      featureRequests: {
        label: "Quines funcionalitats t'agradaria veure en el futur?",
        placeholder:
          'Comparteix les teves idees i suggeriments de funcionalitats',
      },
      generalFeedback: {
        label: 'Altres comentaris?',
        placeholder:
          "Comparteix els teus pensaments. Què t'agrada, què no t'agrada, etc.",
      },
      usageFrequency: {
        label: 'Amb quina freqüència utilitzes PocketPal AI? (Opcional)',
        options: {
          daily: 'Diàriament',
          weekly: 'Setmanalment',
          monthly: 'Mensualment',
          rarely: 'Rarament',
        },
      },
      email: {
        label: 'Correu electrònic de contacte (Opcional)',
        placeholder: 'La teva adreça de correu electrònic',
      },
      submit: 'Enviar Comentaris',
      validation: {
        required: 'Si us plau, proporciona almenys un comentari',
      },
      success: 'Gràcies pels teus comentaris!',
      error: {
        general:
          "S'ha produït un error en enviar els comentaris. Si us plau, torna-ho a provar.",
      },
    },
  },
  de: {
    model: 'Modell',
    modelSettings: 'Modelleinstellungen',
    chatGenerationSettings: 'Chat-Generierungseinstellungen',
    generationSettings: 'Generierungseinstellungen',
    duplicateChatHistory: 'Chat-Verlauf duplizieren',
    exportChatSession: 'Chat-Sitzung exportieren',
    rename: 'Umbenennen',
    makeChatTemporary: 'Chat temporär machen',
    attachmentButtonAccessibilityLabel: 'Medien senden',
    emptyChatPlaceholder: 'Noch keine Nachrichten',
    fileButtonAccessibilityLabel: 'Datei',
    inputPlaceholder: 'Nachricht',
    sendButtonAccessibilityLabel: 'Senden',
    modelNotLoaded:
      'Modell nicht geladen. Bitte initialisieren Sie das Modell.',
    loadingModel: 'Modell wird geladen...',
    typeYourMessage: 'Schreiben Sie Ihre Nachricht hier',
    conversationReset: 'Konversation zurückgesetzt!',
    networkError: 'Netzwerkfehler. Bitte versuchen Sie es erneut.',
    goToModels: 'Zu Modellen',
    readyToChat: 'Bereit zum Chatten? Laden Sie das zuletzt verwendete Modell.',
    pleaseLoadModel: 'Laden Sie ein Modell zum Chatten.',
    shortMemoryWarning: 'Speicherwarnung',
    memoryWarning:
      'Warnung: Die Modellgröße kann den verfügbaren Speicher überschreiten. Dies könnte die Leistung und Stabilität Ihres Geräts beeinträchtigen.',
    load: 'Laden',
    cancel: 'Abbrechen',
    download: 'Herunterladen',
    offload: 'Entladen',
    reset: 'Zurücksetzen',
    saveChanges: 'Änderungen speichern',
    save: 'Speichern',
    delete: 'Löschen',
    dismiss: 'Schließen',
    replace: 'Ersetzen',
    keepBoth: 'Beide behalten',
    fileAlreadyExists: 'Datei existiert bereits',
    deleteChatTitle: 'Chat löschen',
    deleteChatMessage: 'Sind Sie sicher, dass Sie diesen Chat löschen möchten?',
    fileAlreadyExistsMessage:
      'Eine Datei mit diesem Namen existiert bereits. Was möchten Sie tun?',
    addLocalModel: 'Lokales Modell hinzufügen',
    localModel: 'Lokal',
    hfModel: 'HF',
    hfFABLabel: 'Von Hugging Face hinzufügen',
    localFABLabel: 'Lokales Modell hinzufügen',
    resetFABLabel: 'Zurücksetzen',
    downloaded: 'Heruntergeladen',
    grouped: 'Gruppiert',
    proceedWithReset: 'Mit Zurücksetzen fortfahren',
    confirmReset: 'Zurücksetzen bestätigen',
    modelSettingsTitle: 'Modelleinstellungen',
    autoOffloadLoad: 'Auto Entladen/Laden',
    autoOffloadLoadDescription: 'Modell entladen, wenn App im Hintergrund ist.',
    metal: 'Metal',
    metalDescription: 'Apples hardwarebeschleunigte API.',
    layersOnGPU: 'Schichten auf GPU: {{gpuLayers}}',
    contextSize: 'Kontextgröße',
    contextSizePlaceholder: 'Kontextgröße eingeben (min {{minContextSize}})',
    invalidContextSizeError:
      'Bitte geben Sie eine gültige Zahl ein (mindestens {{minContextSize}})',
    modelReloadNotice:
      'Modell muss neu geladen werden, damit Änderungen wirksam werden.',
    autoNavigateToChat: 'Auto-Navigation zum Chat',
    autoNavigateToChatDescription:
      'Zum Chat navigieren, wenn das Laden beginnt.',
    uiSettingsTitle: 'UI-Einstellungen',
    darkMode: 'Dunkler Modus',
    darkModeDescription: 'Dunklen Modus ein- oder ausschalten.',
    displayMemoryUsage: 'Speichernutzung anzeigen',
    displayMemoryUsageDescription:
      'Speichernutzung in der Chat-Seite anzeigen.',
    tooltipGroupByType: 'Nach Modelltyp gruppieren',
    tooltipDownloaded: 'Nur heruntergeladene anzeigen',
    tooltipHf: 'HuggingFace-Modelle anzeigen',
    unknownGroup: 'Unbekannt',
    menuTitleHf: 'Hugging Face Modelle',
    menuTitleDownloaded: 'Heruntergeladene Modelle',
    menuTitleGrouped: 'Nach Modelltyp gruppieren',
    menuTitleReset: 'Modellliste zurücksetzen',
    iOSBackgroundDownload: 'Hintergrund-Download',
    iOSBackgroundDownloadDescription:
      'Downloads im Hintergrund fortsetzen lassen (langsamer).',
    availableToUse: 'Bereit zur Verwendung',
    availableToDownload: 'Verfügbar zum Herunterladen',
    useAddButtonForMore:
      'Verwenden Sie die +-Schaltfläche, um weitere Modelle zu finden',
    // modelSettings
    'modelSettings.grammar':
      'Spezifische Grammatikregeln erzwingen, um sicherzustellen, dass der generierte Text einer bestimmten Struktur oder einem Format folgt',
    'modelSettings.stop':
      'Bestimmte Phrasen definieren, die die Textgenerierung stoppen',
    'modelSettings.n_predict':
      'Festlegen, wie lang die generierte Antwort sein soll (in Tokens)',
    'modelSettings.n_probs':
      'Wahrscheinlichkeitswerte für alternative Wörter anzeigen.',
    'modelSettings.top_k':
      'Kreativität steuern, indem die Wortauswahl auf die K wahrscheinlichsten Optionen beschränkt wird. Niedrigere Werte führen zu fokussierteren Antworten',
    'modelSettings.top_p':
      'Balance zwischen Kreativität und Kohärenz. Höhere Werte (nahe 1,0) erlauben kreativere, aber potenziell weniger fokussierte Antworten',
    'modelSettings.min_p':
      'Die Mindestwahrscheinlichkeit für ein Token. Unwahrscheinliche Wörter herausfiltern, um unsinnige oder kontextfremde Antworten zu reduzieren',
    'modelSettings.temperature':
      'Kreativität vs. Vorhersehbarkeit steuern. Höhere Werte machen Antworten kreativer, aber weniger fokussiert',
    'modelSettings.penalty_last_n':
      'Wie weit zurück auf Wiederholung geprüft werden soll. Größere Werte helfen, langfristige Wiederholungen zu verhindern',
    'modelSettings.penalty_repeat':
      'Wortwiederholungen vermeiden. Höhere Werte führen zu vielfältigerer Sprache',
    'modelSettings.penalty_freq':
      'Überverwendete Wörter bestrafen. Höhere Werte fördern einen breiteren Wortschatz',
    'modelSettings.penalty_present':
      'Wiederholung von Themen und Ideen reduzieren. Höhere Werte fördern vielfältigere Inhalte',
    'modelSettings.mirostat':
      'Erweiterte Steuerung der Antwortkreativität aktivieren. Setzen Sie den Wert auf 1 oder 2 (gleichmäßiger) für intelligente Echtzeitanpassungen von Zufälligkeit und Kohärenz.',
    'modelSettings.mirostat_tau':
      'Legen Sie die Zielkreativität für Mirostat fest. Höhere Werte ermöglichen vielfältigere und fantasievollere Antworten, während niedrigere Werte fokussiertere Ausgaben gewährleisten.',
    'modelSettings.mirostat_eta':
      'Wie schnell Mirostat die Kreativität anpasst. Höhere Werte bedeuten schnellere Anpassungen',
    'modelSettings.dry_multiplier':
      "Stärke der DRY-Funktion (Don't Repeat Yourself). Höhere Werte verhindern Wiederholungen stark",
    'modelSettings.dry_base':
      'Basisstrafe für Wiederholungen im DRY-Modus. Höhere Werte sind aggressiver bei der Verhinderung von Wiederholungen',
    'modelSettings.dry_allowed_length':
      'Wie viele Wörter sich wiederholen können, bevor die DRY-Strafe greift',
    'modelSettings.dry_penalty_last_n':
      'Wie weit zurück nach Wiederholungen im DRY-Modus gesucht wird',
    'modelSettings.dry_sequence_breakers':
      'Symbole, die den Wiederholungsprüfer im DRY-Modus zurücksetzen',
    'modelSettings.ignore_eos':
      'Weiter generieren, auch wenn das Modell stoppen möchte. Nützlich, um längere Antworten zu erzwingen',
    'modelSettings.logit_bias':
      'Beeinflussen, wie wahrscheinlich bestimmte Wörter in der Antwort erscheinen',
    'modelSettings.seed':
      'Seed des Zufallszahlengenerators festlegen. Nützlich für reproduzierbare Ergebnisse',
    'modelSettings.xtc_probability':
      'Wahrscheinlichkeit für Token-Entfernung über XTC-Sampler festlegen. 0 ist deaktiviert',
    'modelSettings.xtc_threshold':
      'Mindestschwellenwert für die Wahrscheinlichkeit von Tokens, die über den XTC-Sampler entfernt werden sollen. (> 0,5 deaktiviert XTC)',
    'modelSettings.typical_p':
      'Lokal typisches Sampling mit Parameter p aktivieren. 1,0 ist deaktiviert',
    about: {
      screenTitle: 'App-Info',
      description:
        'Eine App, die Sprachmodelle direkt auf Ihr Handy bringt. Basiert auf llama.cpp und llama.rn.',
      supportProject: 'Projekt unterstützen',
      supportProjectDescription:
        'Wenn Ihnen PocketPal AI gefällt, unterstützen Sie das Projekt bitte durch:',
      githubButton: 'Stern auf GitHub',
      orText: 'oder',
      orBy: 'oder durch',
      sponsorButton: 'Sponsor werden',
      versionCopiedTitle: 'Version kopiert',
      versionCopiedDescription:
        'Versionsinformationen wurden in die Zwischenablage kopiert',
    },
    feedback: {
      title: 'Feedback senden',
      description:
        'Ihre Meinung zählt! Teilen Sie uns mit, wie PocketPal AI Ihnen hilft und was wir tun können, um es noch nützlicher zu machen.',
      shareThoughtsButton: 'Ihre Gedanken teilen',
      useCase: {
        label: 'Wofür verwenden Sie PocketPal AI?',
        placeholder: 'z.B. Zusammenfassungen, Rollenspiele usw.',
      },
      featureRequests: {
        label: 'Welche Funktionen würden Sie gerne in Zukunft sehen?',
        placeholder: 'Teilen Sie Ihre Ideen und Funktionsvorschläge mit',
      },
      generalFeedback: {
        label: 'Allgemeines Feedback',
        placeholder: 'Teilen Sie gerne weitere Gedanken mit.',
      },
      usageFrequency: {
        label: 'Wie oft nutzen Sie PocketPal AI? (Optional)',
        options: {
          daily: 'Täglich',
          weekly: 'Wöchentlich',
          monthly: 'Monatlich',
          rarely: 'Selten',
        },
      },
      email: {
        label: 'Kontakt-E-Mail (Optional)',
        placeholder: 'Ihre E-Mail-Adresse',
      },
      submit: 'Feedback senden',
      validation: {
        required: 'Bitte geben Sie mindestens ein Feedback ein',
      },
      success: 'Vielen Dank für Ihr Feedback!',
      error: {
        general:
          'Fehler beim Senden des Feedbacks. Bitte versuchen Sie es erneut.',
      },
    },
  },
  ja: {
    model: 'モデル',
    modelSettings: 'モデル設定',
    chatGenerationSettings: 'チャット生成設定',
    generationSettings: '生成設定',
    duplicateChatHistory: 'チャット履歴を複製',
    exportChatSession: 'チャットセッションをエクスポート',
    rename: '名前変更',
    makeChatTemporary: 'チャットを一時的にする',
    attachmentButtonAccessibilityLabel: 'メディア送信',
    emptyChatPlaceholder: 'まだメッセージはありません',
    fileButtonAccessibilityLabel: 'ファイル',
    inputPlaceholder: 'メッセージ',
    sendButtonAccessibilityLabel: '送信',
    modelNotLoaded:
      'モデルが読み込まれていません。モデルを初期化してください。',
    loadingModel: 'モデルを読み込み中...',
    typeYourMessage: 'メッセージを入力してください',
    conversationReset: '会話がリセットされました！',
    networkError: 'ネットワークエラー。もう一度お試しください。',
    goToModels: 'モデルへ移動',
    readyToChat:
      'チャットの準備はできましたか？最後に使用したモデルを読み込みます。',
    pleaseLoadModel: 'チャットするにはモデルを読み込んでください。',
    shortMemoryWarning: 'メモリ警告',
    memoryWarning:
      '警告：モデルサイズが利用可能なメモリを超える可能性があります。これによりデバイスのパフォーマンスと安定性に影響する可能性があります。',
    load: '読み込み',
    cancel: 'キャンセル',
    download: 'ダウンロード',
    offload: 'オフロード',
    reset: 'リセット',
    saveChanges: '変更を保存',
    save: '保存',
    delete: '削除',
    dismiss: '閉じる',
    replace: '置き換え',
    keepBoth: '両方保持',
    fileAlreadyExists: 'ファイルは既に存在します',
    deleteChatTitle: 'チャットを削除',
    deleteChatMessage: 'このチャットを削除してもよろしいですか？',
    fileAlreadyExistsMessage:
      'この名前のファイルは既に存在します。どうしますか？',
    addLocalModel: 'ローカルモデルを追加',
    localModel: 'ローカル',
    hfModel: 'HF',
    hfFABLabel: 'Hugging Faceから追加',
    localFABLabel: 'ローカルモデルを追加',
    resetFABLabel: 'リセット',
    downloaded: 'ダウンロード済み',
    grouped: 'グループ化',
    proceedWithReset: 'リセットを続行',
    confirmReset: 'リセットを確認',
    modelSettingsTitle: 'モデル設定',
    autoOffloadLoad: '自動オフロード/ロード',
    autoOffloadLoadDescription:
      'アプリがバックグラウンドにあるときにモデルをオフロードします。',
    metal: 'Metal',
    metalDescription: 'Appleのハードウェア加速API。',
    layersOnGPU: 'GPUレイヤー：{{gpuLayers}}',
    contextSize: 'コンテキストサイズ',
    contextSizePlaceholder:
      'コンテキストサイズを入力（最小{{minContextSize}}）',
    invalidContextSizeError:
      '有効な数値を入力してください（最小{{minContextSize}}）',
    modelReloadNotice: '変更を有効にするにはモデルの再読み込みが必要です。',
    autoNavigateToChat: 'チャットへ自動ナビゲート',
    autoNavigateToChatDescription:
      '読み込みが開始されたらチャットへナビゲートします。',
    uiSettingsTitle: 'UI設定',
    darkMode: 'ダークモード',
    darkModeDescription: 'ダークモードの切り替え。',
    displayMemoryUsage: 'メモリ使用量表示',
    displayMemoryUsageDescription: 'チャットページにメモリ使用量を表示します。',
    tooltipGroupByType: 'モデルタイプでグループ化',
    tooltipDownloaded: 'ダウンロード済みのみ表示',
    tooltipHf: 'HuggingFaceソースのモデルを表示',
    unknownGroup: '不明',
    menuTitleHf: 'Hugging Faceモデル',
    menuTitleDownloaded: 'ダウンロード済みモデル',
    menuTitleGrouped: 'モデルタイプでグループ化',
    menuTitleReset: 'モデルリストをリセット',
    iOSBackgroundDownload: 'バックグラウンドダウンロード',
    iOSBackgroundDownloadDescription:
      'バックグラウンドでのダウンロードを継続できるようにします（速度は遅くなります）。',
    availableToUse: '使用可能',
    availableToDownload: 'ダウンロード可能',
    useAddButtonForMore: '+ ボタンを使用して他のモデルを探す',
    // modelSettings
    'modelSettings.grammar':
      '生成されたテキストが特定の構造や形式に従うように、特定の文法ルールを適用する',
    'modelSettings.stop': 'テキスト生成を停止する特定のフレーズを定義する',
    'modelSettings.n_predict': '生成される応答の長さを設定する（トークン単位）',
    'modelSettings.n_probs': '代替単語の確率スコアを表示します。',
    'modelSettings.top_k':
      '最も可能性の高いK個のオプションに単語の選択を制限することで創造性を制御します。値が低いほど応答がより焦点を絞ったものになります',
    'modelSettings.top_p':
      '創造性と一貫性のバランスを取ります。高い値（1.0に近い）では、より創造的だが焦点が少ない可能性のある応答を許可します',
    'modelSettings.min_p':
      'トークンが考慮される最小確率。非現実的または文脈外の応答を減らすために可能性の低い単語をフィルタリングします',
    'modelSettings.temperature':
      '創造性と予測可能性を制御します。値が高いほど応答がより創造的ですが焦点が少なくなります',
    'modelSettings.penalty_last_n':
      '繰り返しをチェックする範囲。大きな値は長期的な繰り返しを防ぐのに役立ちます',
    'modelSettings.penalty_repeat':
      '単語の繰り返しを抑制します。値が高いほど応答はより多様な言語を使用します',
    'modelSettings.penalty_freq':
      '過剰に使用される単語にペナルティを課します。値が高いほどより広い語彙を奨励します',
    'modelSettings.penalty_present':
      'テーマやアイデアの繰り返しを減らします。値が高いほどより多様なコンテンツを奨励します',
    'modelSettings.mirostat':
      '応答の創造性に対する高度な制御を有効にします。ランダム性と一貫性のスマートなリアルタイム調整のためには1または2（よりスムーズ）に設定してください。',
    'modelSettings.mirostat_tau':
      'Mirostatの創造性レベルを設定します。高い値ではより多様で想像力豊かな応答が可能になり、低い値ではより焦点を絞った出力が確保されます。',
    'modelSettings.mirostat_eta':
      'Mirostatが創造性を調整する速さ。高い値は調整がより速いことを意味します',
    'modelSettings.dry_multiplier':
      "DRY（Don't Repeat Yourself）機能の強さ。高い値は繰り返しを強く防ぎます",
    'modelSettings.dry_base':
      'DRYモードでの繰り返しに対する基本ペナルティ。高い値は繰り返しの防止により積極的です',
    'modelSettings.dry_allowed_length':
      'DRYペナルティが適用される前に繰り返し可能な単語数',
    'modelSettings.dry_penalty_last_n': 'DRYモードで繰り返しを探す範囲',
    'modelSettings.dry_sequence_breakers':
      'DRYモードで繰り返しチェッカーをリセットするシンボル',
    'modelSettings.ignore_eos':
      'モデルが停止しようとしても生成を続けます。より長い応答を強制するのに役立ちます',
    'modelSettings.logit_bias': '特定の単語が応答に現れる可能性を調整します',
    'modelSettings.seed':
      '乱数生成器のシードを設定します。再現可能な結果に役立ちます',
    'modelSettings.xtc_probability':
      'XTCサンプラーによるトークン削除の確率を設定します。0は無効',
    'modelSettings.xtc_threshold':
      'XTCサンプラーによって削除されるトークンの最小確率閾値を設定します。（> 0.5はXTCを無効にします）',
    'modelSettings.typical_p':
      'パラメータpを使用してローカルに典型的なサンプリングを有効にします。1.0は無効',
    about: {
      screenTitle: 'アプリ情報',
      description:
        '言語モデルを直接あなたのスマートフォンに提供するアプリです。llama.cppとllama.rnを基盤としています。',
      supportProject: 'プロジェクトをサポート',
      supportProjectDescription:
        'PocketPal AIを楽しんでいただけるなら、次の方法でプロジェクトをサポートすることをご検討ください：',
      githubButton: 'GitHubでスター',
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
        'あなたの声は重要です！PocketPal AIがどのように役立っているか、さらに便利にするために何ができるかをお聞かせください。',
      shareThoughtsButton: '意見を共有する',
      useCase: {
        label: 'PocketPal AIをどのように使用していますか？',
        placeholder: '例：要約、ロールプレイなど',
      },
      featureRequests: {
        label: '今後見たい機能は何ですか？',
        placeholder: 'アイデアや機能の提案を共有してください',
      },
      generalFeedback: {
        label: '一般的なフィードバック',
        placeholder: 'その他の考えがあればぜひ共有してください。',
      },
      usageFrequency: {
        label: 'PocketPal AIをどのくらいの頻度で使用していますか？（任意）',
        options: {
          daily: '毎日',
          weekly: '毎週',
          monthly: '毎月',
          rarely: 'ほとんど使わない',
        },
      },
      email: {
        label: '連絡先メール（任意）',
        placeholder: 'あなたのメールアドレス',
      },
      submit: 'フィードバックを送信',
      validation: {
        required: '少なくともいくつかのフィードバックを提供してください',
      },
      success: 'フィードバックありがとうございます！',
      error: {
        general:
          'フィードバック送信中にエラーが発生しました。もう一度お試しください。',
      },
    },
  },
};
