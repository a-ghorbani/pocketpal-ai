//
//  AuthSessionModule.swift
//  PocketPal
//
//  Native module wrapping ASWebAuthenticationSession to open a web checkout
//  flow and capture its custom-scheme callback URL.
//

import Foundation
import React
import AuthenticationServices

@objc(AuthSessionModule)
class AuthSessionModule: NSObject, RCTBridgeModule {

    // Strong reference so ARC does not deallocate the session mid-flow.
    private var session: ASWebAuthenticationSession?
    private var contextProvider: AuthPresentationContextProvider?

    @objc
    static func moduleName() -> String! {
        return "AuthSessionModule"
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        // Presents UI; must initialize on the main queue.
        return true
    }

    @objc
    func openAuth(
        _ urlString: String,
        callbackScheme: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let url = URL(string: urlString) else {
            reject("invalid_url", "openAuth received an invalid URL", nil)
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.session = nil
                self?.contextProvider = nil
                if let callbackURL = callbackURL {
                    resolve(callbackURL.absoluteString)
                } else {
                    // User dismiss / cancel / session error -> the store maps
                    // a reject to a silent cancel.
                    reject(
                        "auth_cancelled",
                        error?.localizedDescription ?? "auth session cancelled",
                        error
                    )
                }
            }

            session.prefersEphemeralWebBrowserSession = true
            let contextProvider = AuthPresentationContextProvider()
            session.presentationContextProvider = contextProvider

            self.session = session
            self.contextProvider = contextProvider

            // start() returns false when the session cannot be presented
            // (no anchor / already presenting). Without this the completion
            // handler never fires and the JS promise hangs forever.
            if !session.start() {
                self.session = nil
                self.contextProvider = nil
                reject(
                    "auth_start_failed",
                    "ASWebAuthenticationSession failed to start",
                    nil
                )
            }
        }
    }
}

private class AuthPresentationContextProvider: NSObject,
    ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
