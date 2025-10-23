//
//  AskPalIntent.swift
//  PocketPal
//
//  App Intent for asking a Pal a question via Siri
//

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct AskPalIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Pal"
    static var description = IntentDescription("Ask a question to a specific Pal and get an AI response")
    
    static var openAppWhenRun: Bool = false // Run in background
    
    @Parameter(title: "Pal", description: "The Pal to ask")
    var pal: PalEntity
    
    @Parameter(title: "Message", description: "Your question or message")
    var message: String
    
    static var parameterSummary: some ParameterSummary {
        Summary("Ask \(\.$pal) \(\.$message)")
    }
    
    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        // Validate inputs
        guard !message.isEmpty else {
            print("[AskPalIntent] Error: Empty message")
            throw AskPalError.emptyMessage
        }

        // We MUST have a model path from the pal
        guard let palModelPath = pal.defaultModelPath else {
            print("[AskPalIntent] Error: Pal has no default model")
            throw AskPalError.noModelAvailable
        }

        // Verify the file exists
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: palModelPath) else {
            print("[AskPalIntent] Error: Model file not found at path")
            throw AskPalError.noModelAvailable
        }

        // Initialize inference engine
        let inferenceEngine = LlamaInferenceEngine.shared

        do {
            // Load model if not already loaded
            try await inferenceEngine.loadModel(at: palModelPath)

            // Try to load cached session
            var finalSystemPrompt = pal.systemPrompt
            if let params = pal.parameters, !params.isEmpty {
                finalSystemPrompt = MustacheRenderer.render(template: pal.systemPrompt, parameters: params)
                print("[LlamaInferenceEngine] Rendered system prompt: \(finalSystemPrompt)")
            }

            // Use model ID for cache validation
            // Fallback to model path if ID is not available (shouldn't happen though )
            let modelId = pal.defaultModelId ?? palModelPath

            _ = await inferenceEngine.loadSessionCache(
                palId: pal.id,
                modelId: modelId,
                systemPrompt: finalSystemPrompt
            )

            let response = try await inferenceEngine.runInference(
                systemPrompt: finalSystemPrompt,
                userMessage: message,
                completionSettings: pal.completionSettings,
                parameters: pal.parameters
            )

            print("[AskPalIntent] Inference completed. Response length: \(response.count) chars")

            // Schedule model release after a short delay to save memory
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
                print("[AskPalIntent] Releasing model after delay")
                await inferenceEngine.releaseModel()
            }

            // Return with dialog so Siri can speak it
            return .result(
                value: response,
                dialog: IntentDialog(stringLiteral: response)
            )

        } catch {
            print("[AskPalIntent] Error during inference: \(error.localizedDescription)")
            throw AskPalError.inferenceFailed(error.localizedDescription)
        }
    }
}

// MARK: - Errors

enum AskPalError: Error, LocalizedError {
    case emptyMessage
    case noModelAvailable
    case inferenceFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .emptyMessage:
            return "Please provide a message to send to the Pal"
        case .noModelAvailable:
            return "No AI model is available. Please download a model in the PocketPal app first."
        case .inferenceFailed(let details):
            return "Failed to generate response: \(details)"
        }
    }
}

