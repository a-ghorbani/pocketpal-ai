//
//  ModelDataProvider.swift
//  PocketPal
//
//  Provides access to Model data for App Intents
//

import Foundation

/// Provides access to downloaded models
@available(iOS 16.0, *)
class ModelDataProvider {
    static let shared = ModelDataProvider()
    
    private init() {}
    
    /// Get the file path for a model by ID
    func getModelPath(modelId: String) -> String? {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        
        // Models are stored in Documents/models/
        let modelsDir = documentsPath.appendingPathComponent("models")
        
        // Try to find the model file
        // Model ID format is typically "author/repo/filename"
        // The filename is the last component
        let components = modelId.split(separator: "/")
        guard let filename = components.last else {
            return nil
        }
        
        let modelPath = modelsDir.appendingPathComponent(String(filename)).path
        
        if fileManager.fileExists(atPath: modelPath) {
            return modelPath
        }
        
        return nil
    }
    
    /// Check if a model is downloaded
    func isModelDownloaded(modelId: String?) -> Bool {
        guard let modelId = modelId else { return false }
        return getModelPath(modelId: modelId) != nil
    }
    
    /// Get default model path from app settings
    func getDefaultModelPath() -> String? {
        // Try to get the active model from UserDefaults or settings
        // This is a fallback if pal doesn't have a default model
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        
        let modelsDir = documentsPath.appendingPathComponent("models")
        
        // Get first available model as fallback
        do {
            let files = try fileManager.contentsOfDirectory(atPath: modelsDir.path)
            let ggufFiles = files.filter { $0.hasSuffix(".gguf") }
            if let firstModel = ggufFiles.first {
                return modelsDir.appendingPathComponent(firstModel).path
            }
        } catch {
            return nil
        }
        
        return nil
    }
}

