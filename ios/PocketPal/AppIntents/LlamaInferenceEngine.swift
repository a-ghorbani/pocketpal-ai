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
    
    /// Run inference with the loaded model
    func runInference(prompt: String, settings: [String: Any]?) async throws -> String {
        guard let context = currentContext else {
            throw InferenceError.noModelLoaded
        }

        // Prepare completion parameters
        var completionParams: [String: Any] = [
            "prompt": prompt,
            "n_predict": 512,
            "temperature": 0.7,
            "top_p": 0.9,
            "top_k": 40,
            "repeat_penalty": 1.1,
        ]

        // Override with pal-specific settings if provided
        if let settings = settings {
            completionParams.merge(settings) { (_, new) in new }
        }

        // Run completion using our wrapper
        // This is a blocking call that returns when complete
        var fullText = ""
        do {
            let result = try context.completion(
                withParams: completionParams,
                onToken: { token in
                    fullText += token
                }
            )

            // Return the full text
            if let text = result["text"] as? String {
                return text.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
            } else if !fullText.isEmpty {
                return fullText.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
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

