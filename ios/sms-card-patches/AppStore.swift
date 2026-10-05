import Foundation
import SwiftUI

@MainActor
final class AppStore: ObservableObject {
    @Published var profile: AgentProfile
    @Published var history: [HistoryEntry]
    @Published var repeatDays: Int

    private let persistence = Persistence.shared

    init() {
        profile = persistence.loadProfile()
        history = persistence.loadHistory()
        repeatDays = persistence.repeatDays
    }

    func saveProfile() {
        persistence.saveProfile(profile)
    }

    func template(_ type: SMSTemplate) -> String {
        persistence.template(type)
    }

    func saveTemplate(_ text: String, type: SMSTemplate) {
        persistence.saveTemplate(text, for: type)
        objectWillChange.send()
    }

    func resetTemplate(_ type: SMSTemplate) {
        persistence.resetTemplate(type)
        objectWillChange.send()
    }

    func addSent(phone: String, template: SMSTemplate, message: String) {
        let item = HistoryEntry(phone: PhoneNormalizer.normalizeRussian(phone), template: template, message: message)
        history.insert(item, at: 0)
        if history.count > 100 { history = Array(history.prefix(100)) }
        persistence.saveHistory(history)
    }

    func clearHistory() {
        history = []
        persistence.saveHistory([])
    }

    func lastSentDate(for phone: String) -> Date? {
        let normalized = PhoneNormalizer.normalizeRussian(phone)
        return history.first(where: { PhoneNormalizer.normalizeRussian($0.phone) == normalized })?.date
    }

    func setRepeatDays(_ days: Int) {
        repeatDays = days
        persistence.repeatDays = days
    }
}
