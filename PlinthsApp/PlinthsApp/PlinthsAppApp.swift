//
//  PlinthsAppApp.swift
//  PlinthsApp
//
//  Created by Joaquin W. Mills-Porter Jr.  on 6/24/26.
//

import SwiftUI

@main
struct PlinthsAppApp: App {
    init() {
        FontRegistrar.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            OnboardingFlow()
        }
    }
}
