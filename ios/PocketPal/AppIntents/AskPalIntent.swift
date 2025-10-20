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
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        // Validate inputs
        guard !message.isEmpty else {
            throw AskPalError.emptyMessage
        }
        
        // Check if model is available
        let modelPath: String
        if let palModelId = pal.defaultModelId,
           let path = ModelDataProvider.shared.getModelPath(modelId: palModelId) {
            modelPath = path
        } else if let defaultPath = ModelDataProvider.shared.getDefaultModelPath() {
            modelPath = defaultPath
        } else {
            throw AskPalError.noModelAvailable
        }
        
        // Initialize inference engine
        let inferenceEngine = LlamaInferenceEngine.shared
        
        do {
            // Load model if not already loaded
            try await inferenceEngine.loadModel(at: modelPath)
            
            // Prepare the prompt with system prompt
            let fullPrompt = preparePrompt(systemPrompt: pal.systemPrompt, userMessage: message)
            
            // Run inference
            let response = try await inferenceEngine.runInference(
                prompt: fullPrompt,
                settings: pal.completionSettings
            )
            
            // Schedule model release after a short delay to save memory
            Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30 seconds
                await inferenceEngine.releaseModel()
            }
            
            return .result(value: response)
            
        } catch {
            throw AskPalError.inferenceFailed(error.localizedDescription)
        }
    }
    
    // MARK: - Helper Methods
    
    private func preparePrompt(systemPrompt: String, userMessage: String) -> String {
        // Simple chat template - this should ideally use the model's chat template
        // For now, using a basic format that works with most models
        return """
        <|system|>
        \(systemPrompt)
        <|user|>
        \(userMessage)
        <|assistant|>
        """
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

