//
//  PalEntity.swift
//  PocketPal
//
//  App Intents entity representing a Pal for Siri and Shortcuts
//

import Foundation
import AppIntents

/// Represents a Pal entity for use in App Intents
@available(iOS 16.0, *)
struct PalEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Pal"
    
    static var defaultQuery = PalEntityQuery()
    
    var id: String
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
    
    // Pal properties
    var name: String
    var systemPrompt: String
    var defaultModelPath: String? // Full path to the downloaded model file
    var completionSettings: [String: Any]?

    init(id: String, name: String, systemPrompt: String, defaultModelPath: String? = nil, completionSettings: [String: Any]? = nil) {
        self.id = id
        self.name = name
        self.systemPrompt = systemPrompt
        self.defaultModelPath = defaultModelPath
        self.completionSettings = completionSettings
    }
}

/// Query provider for Pal entities
@available(iOS 16.0, *)
struct PalEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [PalEntity] {
        let allPals = try await PalDataProvider.shared.fetchAllPals()
        return allPals.filter { identifiers.contains($0.id) }
    }
    
    func suggestedEntities() async throws -> [PalEntity] {
        // Return all available pals as suggestions
        return try await PalDataProvider.shared.fetchAllPals()
    }
}

/// String query for finding pals by name
@available(iOS 16.0, *)
extension PalEntityQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [PalEntity] {
        let allPals = try await PalDataProvider.shared.fetchAllPals()
        
        if string.isEmpty {
            return allPals
        }
        
        // Case-insensitive search
        return allPals.filter { pal in
            pal.name.localizedCaseInsensitiveContains(string)
        }
    }
}

