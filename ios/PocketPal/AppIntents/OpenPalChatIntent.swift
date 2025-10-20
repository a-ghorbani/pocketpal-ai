//
//  OpenPalChatIntent.swift
//  PocketPal
//
//  App Intent for opening a Pal's chat screen
//

import Foundation
import AppIntents

@available(iOS 16.0, *)
struct OpenPalChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Pal Chat"
    static var description = IntentDescription("Open PocketPal and start chatting with a specific Pal")
    
    static var openAppWhenRun: Bool = true // Open the app
    
    @Parameter(title: "Pal", description: "The Pal to chat with")
    var pal: PalEntity
    
    @Parameter(title: "Message", description: "Optional message to prefill", default: nil)
    var message: String?
    
    static var parameterSummary: some ParameterSummary {
        Summary("Open chat with \(\.$pal)") {
            \.$message
        }
    }
    
    @MainActor
    func perform() async throws -> some IntentResult {
        // Build deep link URL
        var urlComponents = URLComponents()
        urlComponents.scheme = "pocketpal"
        urlComponents.host = "chat"
        
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "palId", value: pal.id),
            URLQueryItem(name: "palName", value: pal.name)
        ]
        
        if let message = message, !message.isEmpty {
            queryItems.append(URLQueryItem(name: "message", value: message))
        }
        
        urlComponents.queryItems = queryItems
        
        guard let url = urlComponents.url else {
            throw OpenPalChatError.invalidURL
        }
        
        // Open the URL
        await UIApplication.shared.open(url)
        
        return .result()
    }
}

// MARK: - Errors

enum OpenPalChatError: Error, LocalizedError {
    case invalidURL
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Failed to create deep link URL"
        }
    }
}

