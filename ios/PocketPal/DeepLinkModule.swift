//
//  DeepLinkModule.swift
//  PocketPal
//
//  React Native module for handling deep links from Shortcuts
//

import Foundation
import React

@objc(DeepLinkModule)
class DeepLinkModule: RCTEventEmitter {
    
    private var hasListeners = false
    private var pendingURL: URL?
    
    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOpenURL(_:)),
            name: NSNotification.Name("RCTOpenURLNotification"),
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return ["onDeepLink"]
    }
    
    override func startObserving() {
        hasListeners = true
        
        // Send pending URL if any
        if let url = pendingURL {
            sendDeepLink(url: url)
            pendingURL = nil
        }
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    @objc
    private func handleOpenURL(_ notification: Notification) {
        guard let url = notification.userInfo?["url"] as? URL else {
            return
        }
        
        if hasListeners {
            sendDeepLink(url: url)
        } else {
            // Store for later if no listeners yet
            pendingURL = url
        }
    }
    
    private func sendDeepLink(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }
        
        var params: [String: Any] = [
            "url": url.absoluteString,
            "scheme": components.scheme ?? "",
            "host": components.host ?? "",
        ]
        
        // Parse query parameters
        if let queryItems = components.queryItems {
            var queryParams: [String: String] = [:]
            for item in queryItems {
                if let value = item.value {
                    queryParams[item.name] = value
                }
            }
            params["queryParams"] = queryParams
        }
        
        sendEvent(withName: "onDeepLink", body: params)
    }
    
    @objc
    func getInitialURL(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let url = pendingURL {
            resolve(url.absoluteString)
            pendingURL = nil
        } else {
            resolve(nil)
        }
    }
}

