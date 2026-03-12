//
//  StorefrontModule.swift
//  PocketPal
//
//  Native module for detecting App Store storefront region
//

import Foundation
import React
import StoreKit

@objc(StorefrontModule)
class StorefrontModule: NSObject, RCTBridgeModule {

    @objc
    static func moduleName() -> String! {
        return "StorefrontModule"
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc
    func getCountryCode(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 16.0, *) {
            // StoreKit 2: returns ISO 3166-1 alpha-2 (e.g., 'US', 'GB')
            Task {
                let storefront = await Storefront.current
                let code = storefront?.countryCode
                DispatchQueue.main.async {
                    resolve(code)
                }
            }
        } else if #available(iOS 13.0, *) {
            // StoreKit 1 fallback: returns ISO 3166-1 alpha-3 (e.g., 'USA', 'GBR')
            let countryCode = SKPaymentQueue.default().storefront?.countryCode
            resolve(countryCode)
        } else {
            resolve(nil)
        }
    }
}
