//
//  PalDataProvider.swift
//  PocketPal
//
//  Provides access to Pal data from WatermelonDB for App Intents
//

import Foundation
import SQLite3

/// Provides access to Pal data stored in WatermelonDB
@available(iOS 16.0, *)
class PalDataProvider {
    static let shared = PalDataProvider()
    
    private init() {}
    
    /// Fetch all local pals from the database
    func fetchAllPals() async throws -> [PalEntity] {
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let pals = try self.fetchPalsFromDatabase()
                    continuation.resume(returning: pals)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
    
    /// Fetch a specific pal by ID
    func fetchPal(byId id: String) async throws -> PalEntity? {
        let allPals = try await fetchAllPals()
        return allPals.first { $0.id == id }
    }
    
    /// Fetch a specific pal by name
    func fetchPal(byName name: String) async throws -> PalEntity? {
        let allPals = try await fetchAllPals()
        return allPals.first { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }
    }
    
    // MARK: - Private Database Access
    
    private func fetchPalsFromDatabase() throws -> [PalEntity] {
        guard let dbPath = getDatabasePath() else {
            throw PalDataError.databaseNotFound
        }
        
        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else {
            throw PalDataError.databaseOpenFailed
        }
        defer { sqlite3_close(db) }
        
        let query = """
        SELECT id, name, system_prompt, default_model, generation_settings
        FROM local_pals
        ORDER BY name ASC
        """
        
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
            throw PalDataError.queryFailed
        }
        defer { sqlite3_finalize(statement) }
        
        var pals: [PalEntity] = []
        
        while sqlite3_step(statement) == SQLITE_ROW {
            let id = String(cString: sqlite3_column_text(statement, 0))
            let name = String(cString: sqlite3_column_text(statement, 1))
            let systemPrompt = String(cString: sqlite3_column_text(statement, 2))
            
            // Optional fields
            var defaultModelId: String?
            if let modelText = sqlite3_column_text(statement, 3) {
                let modelJson = String(cString: modelText)
                defaultModelId = parseModelId(from: modelJson)
            }
            
            var completionSettings: [String: Any]?
            if let settingsText = sqlite3_column_text(statement, 4) {
                let settingsJson = String(cString: settingsText)
                completionSettings = parseSettings(from: settingsJson)
            }
            
            let pal = PalEntity(
                id: id,
                name: name,
                systemPrompt: systemPrompt,
                defaultModelId: defaultModelId,
                completionSettings: completionSettings
            )
            pals.append(pal)
        }
        
        return pals
    }
    
    private func getDatabasePath() -> String? {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        
        // WatermelonDB default database name
        let dbPath = documentsPath.appendingPathComponent("watermelon.db").path
        
        if fileManager.fileExists(atPath: dbPath) {
            return dbPath
        }
        
        return nil
    }
    
    private func parseModelId(from json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = dict["id"] as? String else {
            return nil
        }
        return id
    }
    
    private func parseSettings(from json: String) -> [String: Any]? {
        guard let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return dict
    }
}

// MARK: - Errors

enum PalDataError: Error, LocalizedError {
    case databaseNotFound
    case databaseOpenFailed
    case queryFailed
    
    var errorDescription: String? {
        switch self {
        case .databaseNotFound:
            return "PocketPal database not found"
        case .databaseOpenFailed:
            return "Failed to open PocketPal database"
        case .queryFailed:
            return "Failed to query pals from database"
        }
    }
}

