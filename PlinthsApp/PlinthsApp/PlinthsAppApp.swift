//
//  PlinthsAppApp.swift
//  PlinthsApp
//
//  Created by Joaquin W. Mills-Porter Jr.  on 6/24/26.
//

import SwiftUI

@main
struct PlinthsAppApp: App {
    @State private var isSignedIn = false

    init() {
        FontRegistrar.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if isSignedIn {
                    WorkspaceView()
                        .transition(.opacity)
                } else {
                    SplashSignInView(onSignIn: { isSignedIn = true })
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.35), value: isSignedIn)
        }
    }
}
