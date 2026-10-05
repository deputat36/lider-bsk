import MessageUI
import SwiftUI

struct SendView: View {
    @EnvironmentObject private var store: AppStore
    @State private var phone = ""
    @State private var clientName = ""
    @State private var selectedTemplate: SMSTemplate = .universal
    @State private var showMessageComposer = false
    @State private var showShare = false
    @State private var alertText: String?
    @FocusState private var phoneFocused: Bool

    private var renderedMessage: String {
        TemplateRenderer.render(store.template(selectedTemplate), profile: store.profile, clientName: clientName)
    }

    private var smsInfo: SMSLengthInfo {
        SMSLength.analyze(renderedMessage)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !store.profile.isReady {
                    warningCard("Сначала заполните имя и рабочий телефон специалиста в «Настройках».")
                }

                GroupBox("Клиент") {
                    VStack(spacing: 12) {
                        HStack(spacing: 8) {
                            TextField("Телефон клиента", text: $phone)
                                .keyboardType(.phonePad)
                                .textContentType(.telephoneNumber)
                                .textFieldStyle(.roundedBorder)
                                .focused($phoneFocused)

                            PasteButton(payloadType: String.self) { values in
                                if let value = values.first {
                                    phone = value
                                    phoneFocused = true
                                }
                            }
                            .labelStyle(.iconOnly)
                            .buttonBorderShape(.roundedRectangle)
                        }

                        TextField("Обращение по имени — необязательно", text: $clientName)
                            .textFieldStyle(.roundedBorder)
                    }
                    .padding(.top, 4)
                }

                GroupBox("Шаблон") {
                    Picker("Шаблон", selection: $selectedTemplate) {
                        ForEach(SMSTemplate.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.menu)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("Предпросмотр") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(renderedMessage.isEmpty ? "Сообщение пустое" : renderedMessage)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                        Divider()
                        Text("\(smsInfo.characters) символов • \(smsInfo.encodingName) • примерно \(smsInfo.segments) SMS")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)
                }

                Button {
                    openSMS()
                } label: {
                    Label("Открыть SMS", systemImage: "message.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!store.profile.isReady || phone.trimmed.isEmpty || renderedMessage.isEmpty)

                Button {
                    showShare = true
                } label: {
                    Label("Поделиться визиткой", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(!store.profile.isReady)

                Text("iPhone не позволяет обычному приложению автоматически узнать момент завершения сотового звонка. Для быстрого запуска добавьте «СМС Визитку» в Shortcuts или на Action Button.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("СМС Визитка")
        .onAppear {
            guard phone.trimmed.isEmpty else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                phoneFocused = true
            }
        }
        .sheet(isPresented: $showMessageComposer) {
            MessageComposeView(recipients: [PhoneNormalizer.normalizeRussian(phone)], body: renderedMessage) { result in
                showMessageComposer = false
                if result == .sent {
                    store.addSent(phone: phone, template: selectedTemplate, message: renderedMessage)
                    phone = ""
                    clientName = ""
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        phoneFocused = true
                    }
                }
            }
        }
        .sheet(isPresented: $showShare) {
            ShareSheet(items: [TemplateRenderer.fullCard(store.profile)])
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

    private func openSMS() {
        let normalized = PhoneNormalizer.normalizeRussian(phone)
        guard normalized.count >= 10 else {
            alertText = "Проверьте номер клиента."
            return
        }

        if let last = store.lastSentDate(for: normalized),
           Date().timeIntervalSince(last) < Double(store.repeatDays * 86_400) {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            alertText = "Для этого номера визитка уже отправлялась \(formatter.string(from: last)). При необходимости её можно отправить повторно из истории."
            return
        }

        guard MFMessageComposeViewController.canSendText() else {
            alertText = "На этом устройстве системная отправка SMS недоступна."
            return
        }

        showMessageComposer = true
    }

    @ViewBuilder
    private func warningCard(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }
}
