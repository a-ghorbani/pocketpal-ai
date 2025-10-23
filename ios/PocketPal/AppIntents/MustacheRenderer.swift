//
//  MustacheRenderer.swift
//  PocketPal
//
//  Mustache template renderer for system prompt parameter substitution
//  Uses GRMustache.swift library (https://github.com/groue/GRMustache.swift)
//  Matches the TypeScript implementation in src/utils/palshub-template-parser.ts
//

import Foundation
import Mustache

/// Renders a Mustache template with provided parameter values
/// Uses GRMustache.swift
@available(iOS 16.0, *)
class MustacheRenderer {

    /// Render a Mustache template with parameter values
    /// - Parameters:
    ///   - template: The Mustache template string
    ///   - parameters: Dictionary of parameter values to substitute
    /// - Returns: Rendered string with parameters substituted
    /// - Throws: MustacheError if template parsing or rendering fails
    static func render(template: String, parameters: [String: Any]) -> String {
        do {
            // Process parameters to handle special cases (datetime, arrays, booleans)
            let processedParams = processParameters(parameters)

            // Compile and render the template using GRMustache
            let mustacheTemplate = try Template(string: template)
            let rendered = try mustacheTemplate.render(processedParams)

            return rendered
        } catch {
            // Log error and return original template as fallback
            NSLog("[MustacheRenderer] Error rendering template: \(error)")
            return template
        }
    }

    /// Process parameters to handle special value types
    /// Matches the TypeScript processParametersForMustache function
    /// - Parameter parameters: Raw parameter dictionary
    /// - Returns: Processed parameter dictionary ready for Mustache rendering
    private static func processParameters(_ parameters: [String: Any]) -> [String: Any] {
        var processed: [String: Any] = [:]

        for (key, value) in parameters {
            processed[key] = processValue(value)
        }

        return processed
    }

    /// Process a parameter value for Mustache rendering
    /// - Parameter value: The parameter value to process
    /// - Returns: Processed value suitable for Mustache rendering
    private static func processValue(_ value: Any) -> Any {
        // Handle datetime_tag parameters
        if let stringValue = value as? String, stringValue == "{{datetime}}" {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .medium
            return formatter.string(from: Date())
        }

        // Handle array values (select) - join with comma separator
        if let arrayValue = value as? [String] {
            return arrayValue.joined(separator: ", ")
        }

        // Handle boolean values - convert to Yes/No
        if let boolValue = value as? Bool {
            return boolValue ? "Yes" : "No"
        }

        // Handle null/nil
        if value is NSNull {
            return ""
        }

        // Return value as-is for GRMustache to handle
        return value
    }

    /// Check if a template contains Mustache placeholders
    /// - Parameter template: The template string to check
    /// - Returns: True if the template contains {{...}} placeholders
    static func isTemplated(_ template: String) -> Bool {
        return template.range(of: "\\{\\{[^}]+\\}\\}", options: .regularExpression) != nil
    }
}

