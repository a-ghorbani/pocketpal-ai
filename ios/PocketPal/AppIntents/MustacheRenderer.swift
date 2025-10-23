//
//  MustacheRenderer.swift
//  PocketPal
//
//  Simple Mustache template renderer for system prompt parameter substitution
//  Matches the TypeScript implementation in src/utils/palshub-template-parser.ts
//

import Foundation

/// Renders a Mustache template with provided parameter values
/// This is a simplified implementation that handles basic variable substitution
/// and matches the behavior of the TypeScript generateFinalSystemPrompt function
@available(iOS 16.0, *)
class MustacheRenderer {
    
    /// Render a Mustache template with parameter values
    /// - Parameters:
    ///   - template: The Mustache template string
    ///   - parameters: Dictionary of parameter values to substitute
    /// - Returns: Rendered string with parameters substituted
    static func render(template: String, parameters: [String: Any]) -> String {
        var result = template
        
        // Process each parameter
        for (key, value) in parameters {
            let placeholder = "{{\(key)}}"
            let processedValue = processValue(value)
            result = result.replacingOccurrences(of: placeholder, with: processedValue)
        }
        
        return result
    }
    
    /// Process a parameter value for Mustache rendering
    /// Matches the TypeScript processParametersForMustache function
    /// - Parameter value: The parameter value to process
    /// - Returns: String representation of the value
    private static func processValue(_ value: Any) -> String {
        // Handle datetime_tag parameters
        if let stringValue = value as? String, stringValue == "{{datetime}}" {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .medium
            return formatter.string(from: Date())
        }
        
        // Handle array values (select)
        if let arrayValue = value as? [String] {
            return arrayValue.joined(separator: ", ")
        }
        
        // Handle boolean values
        if let boolValue = value as? Bool {
            return boolValue ? "Yes" : "No"
        }
        
        // Handle null/nil
        if value is NSNull {
            return ""
        }
        
        // Default: convert to string
        return String(describing: value)
    }
    
    /// Check if a template contains Mustache placeholders
    /// - Parameter template: The template string to check
    /// - Returns: True if the template contains {{...}} placeholders
    static func isTemplated(_ template: String) -> Bool {
        return template.range(of: "\\{\\{[^}]+\\}\\}", options: .regularExpression) != nil
    }
}

