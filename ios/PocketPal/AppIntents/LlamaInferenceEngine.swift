//
//  LlamaInferenceEngine.swift
//  PocketPal
//
//  Wrapper for llama.rn inference for use in App Intents
//

import Foundation
import CommonCrypto

/// Manages llama.cpp inference for App Intents
@available(iOS 16.0, *)
actor LlamaInferenceEngine {
    static let shared = LlamaInferenceEngine()

    private var currentContext: LlamaContextWrapper?
    private var currentModelPath: String?
    private var cachedSystemPrompts: [String: String] = [:] // palId -> systemPrompt hash

    private init() {}

    /// Read a value from AsyncStorage (React Native's persistent storage)
    /// AsyncStorage stores data in Application Support/[bundleID]/RCTAsyncLocalStorage_V1/
    /// Each key is stored as a file with MD5 hash of the key as filename
    private static func readFromAsyncStorage(key: String) -> String? {
        // Get the AsyncStorage directory path
        guard let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
              let bundleID = Bundle.main.bundleIdentifier else {
            return nil
        }

        let storageDir = appSupportDir
            .appendingPathComponent(bundleID)
            .appendingPathComponent("RCTAsyncLocalStorage_V1")

        // Calculate MD5 hash of the key (same as AsyncStorage does)
        let keyHash = md5Hash(key)
        let filePath = storageDir.appendingPathComponent(keyHash)

        // Read the file
        guard let data = try? Data(contentsOf: filePath),
              let content = String(data: data, encoding: .utf8) else {
            return nil
        }

        return content
    }

    /// Calculate MD5 hash of a string (same algorithm as AsyncStorage)
    private static func md5Hash(_ string: String) -> String {
        let data = Data(string.utf8)
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))

        data.withUnsafeBytes { buffer in
            _ = CC_MD5(buffer.baseAddress, CC_LONG(data.count), &digest)
        }

        return digest.map { String(format: "%02hhx", $0) }.joined()
    }
    
    /// Load a model for inference
    func loadModel(at path: String) async throws {
        // If model is already loaded, skip
        if currentModelPath == path, let context = currentContext, context.isModelLoaded() {
            return
        }

        // Release any existing model
        await releaseModel()

        // Get system processor count and calculate recommended thread count
        let processorCount = ProcessInfo.processInfo.activeProcessorCount
        // Use 80% of cores (same logic as React Native side of thing)
        let recommendedThreads = processorCount <= 4 ? processorCount : Int(Double(processorCount) * 0.8)

        // Try to read context size from ModelStore (persisted by MobX via AsyncStorage)
        // AsyncStorage stores data in Application Support/[bundleID]/RCTAsyncLocalStorage_V1/
        // Each key is stored as a file with MD5 hash of the key as filename
        var contextSize = 2048 // Default

        if let modelStoreData = Self.readFromAsyncStorage(key: "ModelStore"),
           let data = modelStoreData.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let contextInitParams = json["contextInitParams"] as? [String: Any],
           let nCtx = contextInitParams["n_ctx"] as? Int {
            contextSize = nCtx
            print("[LlamaInferenceEngine] Using n_ctx from app settings: \(contextSize)")
        } else {
            print("[LlamaInferenceEngine] Could not read n_ctx from app settings, using default: \(contextSize)")
        }

        // Initialize with model
        let params: [String: Any] = [
            "n_ctx": contextSize,
            "n_threads": recommendedThreads,
            "use_mlock": false,
            "use_mmap": true,
            "n_gpu_layers": 0, // CPU only for background tasks to save battery
        ]

        print("[LlamaInferenceEngine] Using \(recommendedThreads) threads (out of \(processorCount) cores) and context size \(contextSize)")
        print("[LlamaInferenceEngine] Initializing model with params: \(params)")

        // Initialize context using our wrapper
        do {
            let context = try LlamaContextWrapper(
                modelPath: path,
                parameters: params,
                onProgress: { progress in
                    print("[LlamaInferenceEngine] Loading progress: \(progress)%")
                }
            )

            guard context.isModelLoaded() else {
                throw InferenceError.modelLoadFailed("Model failed to load")
            }

            currentContext = context
            currentModelPath = path
        } catch {
            throw InferenceError.modelLoadFailed(error.localizedDescription)
        }
    }
    
    /// Run inference with messages array
    func runInference(
        systemPrompt: String,
        userMessage: String,
        completionSettings: [String: Any]?
    ) async throws -> String {
        guard let context = currentContext else {
            throw InferenceError.noModelLoaded
        }

        // Build messages array
        var messages: [[String: Any]] = []

        // Add system prompt if provided
        if !systemPrompt.isEmpty {
            messages.append([
                "role": "system",
                "content": systemPrompt
            ])
        }

        // Add user message
        messages.append([
            "role": "user",
            "content": userMessage
        ])

        // Convert messages to JSON string
        guard let jsonData = try? JSONSerialization.data(withJSONObject: messages, options: []),
              let messagesJson = String(data: jsonData, encoding: .utf8) else {
            throw InferenceError.inferenceFailed("Failed to serialize messages")
        }

        // Format messages using getFormattedChat (matching LlamaManager.mm)
        let formattedPrompt = context.getFormattedChat(messagesJson, withChatTemplate: nil)

        if formattedPrompt.isEmpty {
            throw InferenceError.inferenceFailed("Failed to format chat messages")
        }

        // Prepare completion parameters
        // Start with minimal params - llama.rn will use its defaults
        var completionParams: [String: Any] = [
            "prompt": formattedPrompt
        ]

        // If pal has completion settings, use them
        if let settings = completionSettings {
            // Merge pal settings, excluding app-specific fields
            let excludedKeys = ["version", "include_thinking_in_context", "enable_thinking", "jinja"]
            for (key, value) in settings {
                if !excludedKeys.contains(key) {
                    completionParams[key] = value
                }
            }
        } else {
            // No pal settings - let llama.rn use defaults
            // Only set essential params
            completionParams["n_predict"] = 512
        }

        // Run completion
        do {
            let result = try context.completion(
                withParams: completionParams,
                onToken: { token in
                    // Token callback - we could use this for streaming in the future
                }
            )

            // Extract response (matching LlamaManager.mm pattern)
            if let content = result["content"] as? String {
                return content.trimmingCharacters(in: .whitespacesAndNewlines)
            } else if let text = result["text"] as? String {
                return text.trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                throw InferenceError.invalidResponse
            }
        } catch {
            throw InferenceError.inferenceFailed(error.localizedDescription)
        }
    }
    
    /// Release the current model to free memory
    func releaseModel() async {
        if let context = currentContext {
            context.invalidate()
        }
        currentContext = nil
        currentModelPath = nil
    }

    /// Save session cache for a pal if system prompt changed or cache doesn't exist
    /// @param palId The pal's ID
    /// @param modelPath The model file path
    /// @param systemPrompt The current system prompt
    /// @param tokenSize Number of tokens to save (pass -1 to save all)
    /// @return Number of tokens saved, or 0 if not saved
    func saveSessionCacheIfNeeded(palId: String, modelPath: String, systemPrompt: String, tokenSize: Int = -1) async -> Int {
        guard let context = currentContext else {
            print("[LlamaInferenceEngine] Cannot save session - no model loaded")
            return 0
        }

        // Get the cache path for current model
        let sessionCachePath = Self.getSessionCachePath(
            for: palId,
            modelPath: modelPath
        )

        // Check if cache file exists
        let fileManager = FileManager.default
        let cacheExists = fileManager.fileExists(atPath: sessionCachePath)

        // Check if system prompt changed
        let promptChanged = cachedSystemPrompts[palId] != systemPrompt

        // Save if cache doesn't exist OR system prompt changed
        if !cacheExists || promptChanged {
            do {
                let tokensSaved = Int(context.saveSession(sessionCachePath, size: Int32(tokenSize)))
                let reason = !cacheExists ? "cache missing" : "system prompt changed"
                print("[LlamaInferenceEngine] Saved session cache with \(tokensSaved) tokens (\(reason))")
                // Update cached system prompt
                cachedSystemPrompts[palId] = systemPrompt
                return tokensSaved
            } catch {
                print("[LlamaInferenceEngine] Failed to save session: \(error.localizedDescription)")
                return 0
            }
        } else {
            print("[LlamaInferenceEngine] System prompt unchanged and cache exists, skipping save")
            return 0
        }
    }

    /// Load session cache for a pal
    /// Manages all caching logic internally:
    /// - Checks if cache exists
    /// - Cleans up old caches (from different models)
    /// - Loads existing cache if valid (llama.cpp handles prompt comparison internally)
    /// - Tracks the cached system prompt
    /// - Cleans up corrupted cache files
    /// @param palId The pal's ID
    /// @param modelPath The model file path
    /// @param systemPrompt The current system prompt
    /// @return True if cache was loaded, false if no cache exists or load failed
    func loadSessionCache(palId: String, modelPath: String, systemPrompt: String) async -> Bool {
        guard let context = currentContext else {
            print("[LlamaInferenceEngine] Cannot load session - no model loaded")
            return false
        }

        // Clean up old session caches for this pal (from previous models)
        Self.cleanupOldSessionCaches(
            for: palId,
            keepingModelPath: modelPath
        )

        // Get the cache path for current model
        let sessionCachePath = Self.getSessionCachePath(
            for: palId,
            modelPath: modelPath
        )

        // Check if session file exists
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: sessionCachePath) else {
            print("[LlamaInferenceEngine] No cached session found for pal \(palId)")
            return false
        }

        // Try to load the session
        do {
            let session = try context.loadSession(sessionCachePath)

            if let sessionDict = session as? [String: Any],
               let tokensLoaded = sessionDict["tokens_loaded"] as? Int {
                print("[LlamaInferenceEngine] Loaded cached session with \(tokensLoaded) tokens")
                // Track the system prompt that was cached
                cachedSystemPrompts[palId] = systemPrompt
                return true
            } else {
                print("[LlamaInferenceEngine] Invalid session format, cleaning up")
                try? fileManager.removeItem(atPath: sessionCachePath)
                return false
            }
        } catch {
            print("[LlamaInferenceEngine] Failed to load session: \(error.localizedDescription)")
            print("[LlamaInferenceEngine] Cleaning up corrupted cache file")
            // Delete corrupted cache file so it gets recreated
            try? fileManager.removeItem(atPath: sessionCachePath)
            return false
        }
    }

    /// Get session cache path for a pal
    /// @param palId The pal's ID
    /// @param modelPath The model file path (used to invalidate cache when model changes)
    /// @return File path for the session cache
    static func getSessionCachePath(for palId: String, modelPath: String) -> String {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return ""
        }

        // Store session caches in Documents/session-cache/
        let cacheDir = documentsPath.appendingPathComponent("session-cache")

        // Create directory if it doesn't exist
        if !fileManager.fileExists(atPath: cacheDir.path) {
            try? fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }

        // Create hash of model path to include in the cache filename
        // This ensures cache invalidation when model changes
        // Note: We don't hash system prompt - llama.cpp handles prompt comparison internally
        let modelHash = modelPath.hash

        return cacheDir.appendingPathComponent("\(palId)_\(modelHash).session").path
    }

    /// Clean up old session cache files for a pal (when model changes)
    /// @param palId The pal's ID
    /// @param currentModelPath The current model path
    static func cleanupOldSessionCaches(for palId: String, keepingModelPath currentModelPath: String) {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return
        }

        let cacheDir = documentsPath.appendingPathComponent("session-cache")
        guard fileManager.fileExists(atPath: cacheDir.path) else {
            return
        }

        // Get all cache files for this pal
        do {
            let files = try fileManager.contentsOfDirectory(atPath: cacheDir.path)
            let currentModelHash = currentModelPath.hash

            for file in files {
                // Check if this is a cache file for this pal
                if file.hasPrefix("\(palId)_") && file.hasSuffix(".session") {
                    // Extract the model hash from the filename: {palId}_{modelHash}.session
                    let components = file.dropLast(8).split(separator: "_") // Remove ".session"
                    if components.count >= 2,
                       let fileModelHash = Int(components[1]) {
                        // Delete if model hash doesn't match
                        if fileModelHash != currentModelHash {
                            let filePath = cacheDir.appendingPathComponent(file).path
                            try? fileManager.removeItem(atPath: filePath)
                            print("[LlamaInferenceEngine] Cleaned up old session cache: \(file)")
                        }
                    }
                }
            }
        } catch {
            print("[LlamaInferenceEngine] Error cleaning up session caches: \(error.localizedDescription)")
        }
    }
}

// MARK: - Errors

enum InferenceError: Error, LocalizedError {
    case noModelLoaded
    case modelLoadFailed(String)
    case inferenceFailed(String)
    case invalidResponse
    
    var errorDescription: String? {
        switch self {
        case .noModelLoaded:
            return "No model is currently loaded"
        case .modelLoadFailed(let details):
            return "Failed to load model: \(details)"
        case .inferenceFailed(let details):
            return "Inference failed: \(details)"
        case .invalidResponse:
            return "Received invalid response from model"
        }
    }
}

