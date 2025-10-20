//
//  LlamaInferenceEngine.swift
//  PocketPal
//
//  Wrapper for llama.rn inference for use in App Intents
//

import Foundation

/// Manages llama.cpp inference for App Intents
@available(iOS 16.0, *)
actor LlamaInferenceEngine {
    static let shared = LlamaInferenceEngine()

    private var currentContext: LlamaContextWrapper?
    private var currentModelPath: String?

    private init() {}
    
    /// Load a model for inference
    func loadModel(at path: String) async throws {
        // If model is already loaded, skip
        if currentModelPath == path, let context = currentContext, context.isModelLoaded() {
            return
        }

        // Release any existing model
        await releaseModel()

        // Initialize with model
        let params: [String: Any] = [
            "n_ctx": 2048,
            "n_threads": 4,
            "use_mlock": false,
            "use_mmap": true,
            "n_gpu_layers": 0, // CPU only for background tasks to save battery
        ]

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

