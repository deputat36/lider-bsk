import SwiftUI

@main
struct EtazhiSMSVizitkaApp: App {
    @StateObject private var store = AppStore()

    init() {
        SMSVizitkaShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Color(red: 0.89, green: 0.02, blue: 0.07))
        }
    }
}
