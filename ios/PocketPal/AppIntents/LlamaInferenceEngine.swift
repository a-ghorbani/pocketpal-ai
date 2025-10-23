//
//  LlamaInferenceEngine.swift
//  PocketPal
//
//  Wrapper for llama.rn inference for use in App Intents
//
//  TODO:
//  - Cancellation Support: Allow users to cancel long-running inference
//  - Memory Pressure Checks: Check available memory before loading models
//

import Foundation
import CryptoKit

/// Manages llama.cpp inference for App Intents
@available(iOS 16.0, *)
actor LlamaInferenceEngine {
    static let shared = LlamaInferenceEngine()

    private var currentContext: LlamaContextWrapper?
    private var currentModelPath: String?

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
    /// Uses CryptoKit (iOS 13+) instead of deprecated CommonCrypto
    private static func md5Hash(_ string: String) -> String {
        let data = Data(string.utf8)
        let digest = Insecure.MD5.hash(data: data)
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
        var contextSize = 2048 // Default

        if let modelStoreData = Self.readFromAsyncStorage(key: "ModelStore"),
           let data = modelStoreData.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let contextInitParams = json["contextInitParams"] as? [String: Any],
           let nCtx = contextInitParams["n_ctx"] as? Int {
            // llama.cpp minimum is typically 200, maximum is model-dependent but 4096 is a safe upper bound for background tasks
            if nCtx < 200 {
                contextSize = 200
                print("[LlamaInferenceEngine] n_ctx from app settings (\(nCtx)) is too small, using minimum: \(contextSize)")
            } else if nCtx > 4096 {
                contextSize = 4096
                print("[LlamaInferenceEngine] n_ctx from app settings (\(nCtx)) is too large, using maximum: \(contextSize)")
            } else {
                contextSize = nCtx
                print("[LlamaInferenceEngine] Using n_ctx from app settings: \(contextSize)")
            }
        } else {
            print("[LlamaInferenceEngine] Could not read n_ctx from app settings, using default: \(contextSize)")
        }

        // Initialize with model
        let params: [String: Any] = [
            "n_ctx": contextSize,
            "n_threads": recommendedThreads,
            "use_mlock": false,
            "use_mmap": true,
            // CPU only for background tasks. 
            // We use caching, so except the first run, we should not notice much of a performance difference
            "n_gpu_layers": 0, 
        ]

        print("[LlamaInferenceEngine] Using \(recommendedThreads) threads (out of \(processorCount) cores) and context size \(contextSize)")
        print("[LlamaInferenceEngine] Initializing model with params: \(params)")
        print("[LlamaInferenceEngine] Model path: \(path)")

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
    
    /// Run inference
    func runInference(
        systemPrompt: String,
        userMessage: String,
        completionSettings: [String: Any]?,
        parameters: [String: Any]? = nil
    ) async throws -> String {
        guard let context = currentContext else {
            throw InferenceError.noModelLoaded
        }
        print("[LlamaInferenceEngine] Running inference with system prompt: \(systemPrompt)")
        print("[LlamaInferenceEngine] Running inference with user message: \(userMessage)")
        print("[LlamaInferenceEngine] Running inference with completion settings: \(String(describing: completionSettings))")
        print("[LlamaInferenceEngine] Running inference with parameters: \(String(describing: parameters))")

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

        print("[LlamaInferenceEngine] Serialized messages: \(messagesJson)")

        // Format messages using getFormattedChatWithJinja to get full result including additional_stops
        // This matches the TypeScript completion method in llama.rn/src/index.ts
        // Set enable_thinking to false for shortcuts
        // Note: Swift auto-renames the Obj-C method from getFormattedChatWithJinja: to getFormattedChat(withJinja:...)
        let enableThinking = false // (completionSettings?["enable_thinking"] as? Bool) ?? false
        let formattedResult = context.getFormattedChat(
            withJinja: messagesJson,
            withChatTemplate: nil,
            withEnableThinking: enableThinking
        )

        guard let formattedPrompt = formattedResult["prompt"] as? String, !formattedPrompt.isEmpty else {
            throw InferenceError.inferenceFailed("Failed to format chat messages")
        }

        // Extract additional_stops from jinja result (if any)
        let additionalStops = formattedResult["additional_stops"] as? [String] ?? []

        // Prepare completion parameters
        // Match the app's pattern: defaultCompletionParams → pal settings → strip app-only keys
        // See: src/utils/completionSettingsVersions.ts and src/utils/completionTypes.ts

        print("[LlamaInferenceEngine] Formatted prompt: \(formattedPrompt)")
        print("[LlamaInferenceEngine] Additional stops from template: \(additionalStops)")
        // Start with default completion params (matching defaultCompletionParams from TypeScript)
        // Store default stop words to merge with pal settings and template stops later
        let defaultStopWords: [String] = [
            "</s>",
            "<|eot_id|>",
            "<|end_of_text|>",
            "<|im_end|>",
            "<|EOT|>",
            "<|END_OF_TURN_TOKEN|>",
            "<|end_of_turn|>",
            "<end_of_turn>",
            "<|endoftext|>",
            "<|return|>",  // gpt-oss
        ]

        var completionParams: [String: Any] = [
            "prompt": formattedPrompt,
            // Default llama.rn API parameters (matching src/utils/completionSettingsVersions.ts)
            "n_predict": 1024,
            "temperature": 0.7,
            "top_k": 40,
            "top_p": 0.95,
            "min_p": 0.05,
            "xtc_threshold": 0.1,
            "xtc_probability": 0.0,
            "typical_p": 1.0,
            "penalty_last_n": 64,
            "penalty_repeat": 1.0,
            "penalty_freq": 0.0,
            "penalty_present": 0.0,
            "mirostat": 0,
            "mirostat_tau": 5,
            "mirostat_eta": 0.1,
            "seed": -1,
            "n_probs": 0,
            // Include all known stop words from src/utils/chat.ts
            // In the main app, these are dynamically filtered based on the model's chat template,
            // but for Shortcuts we include all of them for simplicity
            "stop": defaultStopWords,
            "jinja": true,
            "enable_thinking": enableThinking,
        ]

        // Merge pal-specific settings if available (pal settings override defaults)
        // IMPORTANT: We need to handle 'prompt' and 'stop' specially:
        // - 'prompt' should NOT be overridden (it's always empty in completionSettings)
        // - 'stop' should be MERGED (not replaced) to include all possible stop tokens
        if let settings = completionSettings {
            for (key, value) in settings {
                // Skip 'prompt' - it's always empty in completionSettings and would override our formatted prompt
                if key == "prompt" {
                    continue
                }

                // Skip 'enable_thinking' - it is always false for shortcuts
                if key == "enable_thinking" {
                    continue 
                }

                // Special handling for 'stop' - merge arrays instead of replacing
                if key == "stop", let palStops = value as? [String] {
                    // Merge pal stops with default stops, removing duplicates
                    var mergedStops = Set(defaultStopWords)
                    mergedStops.formUnion(palStops)
                    completionParams[key] = Array(mergedStops)
                } else {
                    // For all other keys, override with pal settings
                    completionParams[key] = value
                }
            }
        }

        // Add additional_stops from jinja template result (matching TypeScript completion method)
        // These are template-specific stop tokens that should be included
        if !additionalStops.isEmpty {
            if var currentStops = completionParams["stop"] as? [String] {
                var mergedStops = Set(currentStops)
                mergedStops.formUnion(additionalStops)
                completionParams["stop"] = Array(mergedStops)
            } else {
                completionParams["stop"] = additionalStops
            }
        }

        // Strip app-specific fields before passing to llama.rn
        // These are PocketPal-only fields that llama.rn doesn't understand
        // See: src/utils/completionTypes.ts - APP_ONLY_KEYS
        let appOnlyKeys = ["version", "include_thinking_in_context"]
        for key in appOnlyKeys {
            completionParams.removeValue(forKey: key)
        }

        print("[LlamaInferenceEngine] Running inference with params: \(completionParams)")

        // Run completion
        do {
            let result = try context.completion(
                withParams: completionParams,
                onToken: { token in
                    // Token callback - we could use this for streaming in the future
                }
            )

            // Extract response
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
        print("[LlamaInferenceEngine] Releasing model")
        if let context = currentContext {
            context.invalidate()
        }
        currentContext = nil
        currentModelPath = nil
    }

    /// Save session cache for a pal
    /// @param palId The pal's ID
    /// @param modelId The model ID
    /// @param systemPrompt The current system prompt
    /// @param tokenSize Number of tokens to save (pass -1 to save all)
    /// @return Number of tokens saved
    func saveSessionCache(palId: String, modelId: String, systemPrompt: String, tokenSize: Int = -1) async -> Int {
        guard let context = currentContext else {
            print("[LlamaInferenceEngine] Cannot save session - no model loaded")
            return 0
        }

        let sessionCachePath = Self.getSessionCachePath(for: palId)

        do {
            let tokensSaved = Int(context.saveSession(sessionCachePath, size: Int32(tokenSize)))
            print("[LlamaInferenceEngine] Saved session cache with \(tokensSaved) tokens")

            // Save metadata for validation
            Self.saveSessionMetadata(for: palId, modelId: modelId, systemPrompt: systemPrompt)

            return tokensSaved
        } catch {
            print("[LlamaInferenceEngine] Failed to save session: \(error.localizedDescription)")
            return 0
        }
    }

    /// Load or regenerate session cache for a pal
    /// Strategy:
    /// 1. Check if cache exists and metadata is valid (model ID + system prompt match)
    /// 2. If valid, load the session
    /// 3. If invalid, run minimal inference (1 char, 1 token) to load system prompt into memory, then save
    /// @param palId The pal's ID
    /// @param modelId The model ID (portable across app updates)
    /// @param systemPrompt The current system prompt
    /// @return True if cache was loaded or regenerated successfully
    func loadSessionCache(palId: String, modelId: String, systemPrompt: String) async -> Bool {
        guard let context = currentContext else {
            print("[LlamaInferenceEngine] Cannot load session - no model loaded")
            return false
        }

        let sessionCachePath = Self.getSessionCachePath(for: palId)
        let fileManager = FileManager.default

        // Check if cache exists and metadata is valid
        let cacheExists = fileManager.fileExists(atPath: sessionCachePath)
        let metadataValid = Self.validateSessionMetadata(for: palId, modelId: modelId, systemPrompt: systemPrompt)

        if cacheExists && metadataValid {
            // Cache is valid, load it
            do {
                let session = try context.loadSession(sessionCachePath)

                if let sessionDict = session as? [String: Any],
                   let tokensLoaded = sessionDict["tokens_loaded"] as? Int {
                    print("[LlamaInferenceEngine] Loaded valid cached session with \(tokensLoaded) tokens")

                    // // Log embd detokenized text for debugging
                    // if let prompt = sessionDict["prompt"] as? String {
                    //     print("[LlamaInferenceEngine] embd detokenized: '\(prompt)'")
                    // }

                    return true
                } else {
                    print("[LlamaInferenceEngine] Invalid session format, will regenerate")
                }
            } catch {
                print("[LlamaInferenceEngine] Failed to load session: \(error.localizedDescription), will regenerate")
            }
        } else {
            let reason = !cacheExists ? "cache missing" : "metadata invalid (model or system prompt changed)"
            print("[LlamaInferenceEngine] Cache invalid: \(reason), regenerating...")
        }

        // Cache is invalid or failed to load - regenerate it
        // Run minimal inference to load system prompt into memory
        print("[LlamaInferenceEngine] Running minimal inference to load system prompt into memory...")

        do {
            // Build messages array with system prompt and minimal user message
            let messages: [[String: String]] = [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": "Hi"]
            ]

            // Convert to JSON string
            guard let messagesJson = try? JSONSerialization.data(withJSONObject: messages),
                  let messagesStr = String(data: messagesJson, encoding: .utf8) else {
                print("[LlamaInferenceEngine] Failed to serialize messages")
                return false
            }

            // Format messages using chat template to get a proper prompt
            let formattedResult = context.getFormattedChat(
                withJinja: messagesStr,
                withChatTemplate: nil,
                withEnableThinking: false
            )

            guard let formattedPrompt = formattedResult["prompt"] as? String, !formattedPrompt.isEmpty else {
                print("[LlamaInferenceEngine] Failed to format chat messages")
                return false
            }

            // Run minimal inference with formatted prompt
            var tokenCount = 0
            _ = try context.completion(withParams: [
                "prompt": formattedPrompt,
                "n_predict": 1  // Generate only 1 token
            ]) { tokenResult in
                tokenCount += 1
            }

            print("[LlamaInferenceEngine] Minimal inference complete, generated \(tokenCount) token(s)")

            // Now save the session with the system prompt loaded
            let tokensSaved = await saveSessionCache(palId: palId, modelId: modelId, systemPrompt: systemPrompt)
            print("[LlamaInferenceEngine] Regenerated session cache with \(tokensSaved) tokens")

            return tokensSaved > 0
        } catch {
            print("[LlamaInferenceEngine] Failed to regenerate session cache: \(error.localizedDescription)")
            return false
        }
    }

    /// Get session cache path for a pal
    /// @param palId The pal's ID
    /// @param modelPath The model file path (used to invalidate cache when model changes)
    /// @return File path for the session cache
    static func getSessionCachePath(for palId: String) -> String {
        let fileManager = FileManager.default
        guard let cachesPath = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return ""
        }

        // Store session caches in Caches/session-cache/
        let cacheDir = cachesPath.appendingPathComponent("session-cache")

        // Create directory if it doesn't exist
        if !fileManager.fileExists(atPath: cacheDir.path) {
            try? fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }

        return cacheDir.appendingPathComponent("\(palId).session").path
    }

    static func getSessionMetadataPath(for palId: String) -> String {
        let sessionPath = getSessionCachePath(for: palId)
        return sessionPath.replacingOccurrences(of: ".session", with: "_metadata.json")
    }

    /// Save session metadata (model ID and system prompt) to validate cache
    static func saveSessionMetadata(for palId: String, modelId: String, systemPrompt: String) {
        let metadataPath = getSessionMetadataPath(for: palId)

        let metadata: [String: String] = [
            "modelId": modelId,
            "systemPrompt": systemPrompt
        ]

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: metadata, options: .prettyPrinted)
            try jsonData.write(to: URL(fileURLWithPath: metadataPath))
        } catch {
            print("[LlamaInferenceEngine] Failed to save session metadata: \(error.localizedDescription)")
        }
    }

    /// Load and validate session metadata
    /// @return true if metadata exists and matches current model ID and system prompt
    static func validateSessionMetadata(for palId: String, modelId: String, systemPrompt: String) -> Bool {
        let metadataPath = getSessionMetadataPath(for: palId)

        guard FileManager.default.fileExists(atPath: metadataPath) else {
            return false
        }

        do {
            let jsonData = try Data(contentsOf: URL(fileURLWithPath: metadataPath))
            guard let metadata = try JSONSerialization.jsonObject(with: jsonData) as? [String: String],
                  let cachedModelId = metadata["modelId"],
                  let cachedSystemPrompt = metadata["systemPrompt"] else {
                return false
            }

            return cachedModelId == modelId && cachedSystemPrompt == systemPrompt
        } catch {
            print("[LlamaInferenceEngine] Failed to load session metadata: \(error.localizedDescription)")
            return false
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

