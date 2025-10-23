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
            print("[PalDataProvider] Database not found")
            throw PalDataError.databaseNotFound
        }

        var db: OpaquePointer?
        let openResult = sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil)
        guard openResult == SQLITE_OK else {
            let errorMessage = String(cString: sqlite3_errmsg(db))
            print("[PalDataProvider] Failed to open database: \(errorMessage) (code: \(openResult))")
            throw PalDataError.databaseOpenFailed
        }
        defer { sqlite3_close(db) }

        let query = """
        SELECT id, name, system_prompt, default_model, generation_settings, parameters, parameter_schema
        FROM local_pals
        ORDER BY name ASC
        """

        var statement: OpaquePointer?
        let prepareResult = sqlite3_prepare_v2(db, query, -1, &statement, nil)
        guard prepareResult == SQLITE_OK else {
            let errorMessage = String(cString: sqlite3_errmsg(db))
            print("[PalDataProvider] Failed to prepare query: \(errorMessage) (code: \(prepareResult))")
            throw PalDataError.queryFailed
        }
        defer { sqlite3_finalize(statement) }

        var pals: [PalEntity] = []
        var rowCount = 0

        while sqlite3_step(statement) == SQLITE_ROW {
            rowCount += 1
            let id = String(cString: sqlite3_column_text(statement, 0))
            let name = String(cString: sqlite3_column_text(statement, 1))
            let systemPrompt = String(cString: sqlite3_column_text(statement, 2))

            // Optional fields
            var defaultModelPath: String?
            var defaultModelId: String?
            if let modelText = sqlite3_column_text(statement, 3) {
                let modelJson = String(cString: modelText)
                defaultModelPath = parseModelPath(from: modelJson)
                defaultModelId = parseModelId(from: modelJson)
            }

            var completionSettings: [String: Any]?
            if let settingsText = sqlite3_column_text(statement, 4) {
                let settingsJson = String(cString: settingsText)
                completionSettings = parseSettings(from: settingsJson)
            }

            var parameters: [String: Any]?
            if let parametersText = sqlite3_column_text(statement, 5) {
                let parametersJson = String(cString: parametersText)
                parameters = parseSettings(from: parametersJson)
            }

            var parameterSchema: [[String: Any]]?
            if let schemaText = sqlite3_column_text(statement, 6) {
                let schemaJson = String(cString: schemaText)
                if let data = schemaJson.data(using: .utf8),
                   let array = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                    parameterSchema = array
                }
            }

            let pal = PalEntity(
                id: id,
                name: name,
                systemPrompt: systemPrompt,
                defaultModelPath: defaultModelPath,
                defaultModelId: defaultModelId,
                completionSettings: completionSettings,
                parameters: parameters,
                parameterSchema: parameterSchema
            )
            pals.append(pal)
        }

        return pals
    }
    
    private func getDatabasePath() -> String? {
        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("[PalDataProvider] Could not get documents directory")
            return nil
        }

        // WatermelonDB database name (configured in src/database/index.ts)
        let dbPath = documentsPath.appendingPathComponent("pocketpalai.db").path

        if fileManager.fileExists(atPath: dbPath) {
            print("[PalDataProvider] Database found!")
            return dbPath
        }

        print("[PalDataProvider] Database not found at expected path")

        // List all files in documents directory for debugging
        if let files = try? fileManager.contentsOfDirectory(atPath: documentsPath.path) {
            print("[PalDataProvider] Files in documents directory: \(files)")
        }

        return nil
    }
    
    /// Extract model ID from model JSON
    private func parseModelId(from json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        return dict["id"] as? String
    }

    /// Computes the full path for a model file, matching ModelStore.getModelFullPath() logic exactly
    ///
    /// IMPORTANT: This logic MUST stay in sync with TypeScript implementation
    /// See: src/store/ModelStore.ts - getModelFullPath() method (lines ~618-659)
    private func parseModelPath(from json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[PalDataProvider] Failed to parse model JSON")
            return nil
        }

        let fileManager = FileManager.default
        guard let documentsPath = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            print("[PalDataProvider] Could not get documents directory")
            return nil
        }

        // Check isLocal first (for backward compatibility)
        let isLocal = dict["isLocal"] as? Bool ?? false
        let origin = dict["origin"] as? String ?? ""

        // For local models, use the fullPath
        if isLocal || origin == "local" {
            guard let fullPath = dict["fullPath"] as? String else {
                print("[PalDataProvider] Error: Full path is undefined for local model")
                return nil
            }
            return fullPath
        }

        // For non-local models, we need filename
        guard let filename = dict["filename"] as? String else {
            print("[PalDataProvider] Error: Model filename is undefined")
            return nil
        }

        // For preset models, check both old and new paths
        if origin == "preset" {
            let author = dict["author"] as? String ?? "unknown"
            let oldPath = documentsPath.appendingPathComponent(filename).path
            let newPath = documentsPath.appendingPathComponent("models/preset/\(author)/\(filename)").path

            // If the file exists in old path, use that (for backwards compatibility)
            if fileManager.fileExists(atPath: oldPath) {
                print("[PalDataProvider] Found model at old path")
                return oldPath
            }

            // Otherwise use new path
            return newPath
        }

        // For HF models, use author/model structure
        if origin == "hf" {
            let author = dict["author"] as? String ?? "unknown"
            let path = documentsPath.appendingPathComponent("models/hf/\(author)/\(filename)").path
            print("[PalDataProvider] Constructed HF model path: \(path)")
            return path
        }

        // Fallback (shouldn't reach here)
        print("[PalDataProvider] Warning: Unexpected model origin, using fallback path")
        let fallbackPath = documentsPath.appendingPathComponent(filename).path
        print("[PalDataProvider] Fallback path: \(fallbackPath)")
        return fallbackPath
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

