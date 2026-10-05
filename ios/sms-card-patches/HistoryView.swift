import MessageUI
import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: AppStore
    @State private var repeatEntry: HistoryEntry?
    @State private var showComposer = false
    @State private var alertText: String?

    private let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        Group {
            if store.history.isEmpty {
                ContentUnavailableView("История пуста", systemImage: "message.badge", description: Text("Здесь появятся отправленные SMS-визитки."))
            } else {
                List {
                    ForEach(store.history) { item in
                        Button {
                            repeatEntry = item
                            guard MFMessageComposeViewController.canSendText() else {
                                alertText = "На этом устройстве системная отправка SMS недоступна."
                                return
                            }
                            showComposer = true
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(PhoneNormalizer.display(item.phone)).font(.headline)
                                Text(item.template.title).font(.subheadline)
                                Text(formatter.string(from: item.date)).font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 3)
                        }
                        .buttonStyle(.plain)
                    }
                    .onDelete { indexes in
                        store.history.remove(atOffsets: indexes)
                        Persistence.shared.saveHistory(store.history)
                    }
                }
            }
        }
        .navigationTitle("История")
        .toolbar {
            if !store.history.isEmpty {
                Button("Очистить", role: .destructive) { store.clearHistory() }
            }
        }
        .sheet(isPresented: $showComposer) {
            if let item = repeatEntry {
                MessageComposeView(recipients: [item.phone], body: item.message) { result in
                    showComposer = false
                    if result == .sent {
                        store.addSent(phone: item.phone, template: item.template, message: item.message)
                    }
                }
            }
        }
        .alert("СМС Визитка", isPresented: Binding(
            get: { alertText != nil },
            set: { if !$0 { alertText = nil } }
        )) {
            Button("ОК", role: .cancel) { alertText = nil }
        } message: {
            Text(alertText ?? "")
        }
    }
}
