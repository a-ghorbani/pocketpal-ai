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
        if #available(iOS 13.0, *) {
            let countryCode = SKPaymentQueue.default().storefront?.countryCode
            resolve(countryCode)
        } else {
            resolve(nil)
        }
    }
}
