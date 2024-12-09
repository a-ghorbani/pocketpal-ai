/** Base chat l10n containing all required properties to provide localized copy. */
export const l10n = {
  en: {
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
      "Warning: Model size is close to or exceeds your device's total memory ({{totalMemory}}). This may cause unexpected behavior such as slow performance or system instability.",
    load: 'Load',
    cancel: 'Cancel',
    download: 'Download',
    offload: 'Offload',
    reset: 'Reset',
    delete: 'Delete',
    dismiss: 'Dismiss',
    replace: 'Replace',
    keepBoth: 'Keep Both',
    fileAlreadyExists: 'File already exists',
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
    'modelSettings.penalize_nl': 'Penalize newline tokens.',
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
  },
  es: {
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
      'Advertencia: El tamaño del modelo está cerca de o excede la memoria total de su dispositivo ({{totalMemory}}). Esto puede causar comportamientos inesperados como rendimiento lento o inestabilidad del sistema.',
    load: 'Cargar',
    cancel: 'Cancelar',
    download: 'Descargar',
    offload: 'Liberar',
    reset: 'Reiniciar',
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
    'modelSettings.penalize_nl':
      'Aplicar penalización por repetición a tokens de nueva línea',
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
  },
  ko: {
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
      '경고: 모델 크기가 또는 장치의 총 메모리를 초과합니다 ({{totalMemory}}). 이는 속도가 느려지거나 시스템 불안정성을 일으킬 수 있는 예기치 않은 동작을 일으켜 초래할 수 있습니다.',
    load: '로드',
    cancel: '취소',
    download: '다운로드',
    offload: '해제',
    reset: '재설정',
    delete: '삭제',
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
    'modelSettings.penalize_nl': '바꿈 토큰에 반복 페널티 적용',
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
  },
  pl: {
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
      'Ostrzeżenie: Rozmiar modelu jest bliski lub przekracza całkowitą pamięć swojego urządzenia ({{totalMemory}}). To może spowodować nieoczekiwane zachowanie, takie jak wolne wydajność lub niestabilność systemu.',
    load: 'Załaduj',
    cancel: 'Anuluj',
    download: 'Pobierz',
    offload: 'Odpowiedz',
    reset: 'Resetuj',
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
    'modelSettings.penalize_nl':
      'Aplicar penalidade de repetição a tokens de nova linha',
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
  },
  pt: {
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
      'Advertência: O tamanho do modelo está próximo ou excede a memória total do seu dispositivo ({{totalMemory}}). Isso pode causar comportamentos inesperados como desempenho lento ou instabilidade do sistema.',
    load: 'Carregar',
    cancel: 'Cancelar',
    download: 'Baixar',
    offload: 'Descarregar',
    reset: 'Reiniciar',
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
    'modelSettings.penalize_nl':
      'Aplicar penalidade de repetição a tokens de nova linha',
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
  },
  ru: {
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
      'Предупреждение: Размер модели близок или превышает общую память вашего устройства ({{totalMemory}}). Это может привести к непредвиденным поведением, таким как медленная производительность или нестабильность системы.',
    load: 'Загрузить',
    cancel: 'Отменить',
    download: 'Скачать',
    offload: 'Отменить',
    reset: 'Сбросить',
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
    'modelSettings.penalize_nl':
      'Застосувати штраф за повторення до токенів нового рядка',
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
  },
  tr: {
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
      'Uyarı: Model boyutu cihazınızın toplam hafızasına yakın veya onu aşıyor ({{totalMemory}}). Bu, beklenmedik davranışlar, örneğin yavaş performans veya sistem istikrarının oluşmasına neden olabilir.',
    load: 'Yükle',
    cancel: 'İptal',
    download: 'İndir',
    offload: 'Aç',
    reset: 'Sıfırla',
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
    'modelSettings.penalize_nl': 'Yeni satır tokenlerine tekrar cezası uygula',
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
  },
  uk: {
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
      'Предупреждение: Размер модели близок или превышает общую память вашего устройства ({{totalMemory}}). Это может привести к непредвиденным поведением, таким как медленная производительность или нестабильность системы.',
    load: 'Загрузить',
    cancel: 'Отменить',
    download: 'Скачать',
    offload: 'Отменить',
    reset: 'Сбросить',
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
    'modelSettings.penalize_nl':
      'Застосувати штраф за повторення до токенів нового рядка',
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
  },
  ca: {
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
      'Advertència: La mida del model està prop o supera la memòria total del dispositiu ({{totalMemory}}). Això pot causar comportaments inesperats com baix rendiment o inestabilitat del sistema.',
    load: 'Carregar',
    cancel: 'Cancel·lar',
    download: 'Descarregar',
    offload: 'Alliberar',
    reset: 'Reiniciar',
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
    'modelSettings.penalize_nl':
      'Aplicar penalización por repetición a tokens de nueva línea',
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
  },
};
