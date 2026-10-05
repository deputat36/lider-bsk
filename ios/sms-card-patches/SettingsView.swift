import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var savedNotice = false

    var body: some View {
        Form {
            Section("Специалист") {
                TextField("Имя и фамилия", text: $store.profile.name)
                TextField("Должность", text: $store.profile.position)
                TextField("Рабочий телефон", text: $store.profile.phone)
                    .keyboardType(.phonePad)
                TextField("Офис / город", text: $store.profile.office)
            }

            Section("Каналы связи") {
                TextField("VK — ссылка или ник", text: $store.profile.vk)
                    .textInputAutocapitalization(.never)
                TextField("MAX — ссылка или ник", text: $store.profile.max)
                    .textInputAutocapitalization(.never)
                TextField("Telegram — необязательно", text: $store.profile.telegram)
                    .textInputAutocapitalization(.never)
                TextField("WhatsApp — необязательно", text: $store.profile.whatsapp)
                    .keyboardType(.phonePad)
                TextField("Email — необязательно", text: $store.profile.email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                TextField("Сайт — необязательно", text: $store.profile.website)
                    .textInputAutocapitalization(.never)
                TextField("Ссылка на визитку — необязательно", text: $store.profile.cardURL)
                    .textInputAutocapitalization(.never)
            }

            Section {
                Button("Сохранить профиль") {
                    store.saveProfile()
                    savedNotice = true
                }
            }

            Section {
                ForEach(SMSTemplate.allCases) { type in
                    NavigationLink(type.title) {
                        TemplateEditorView(type: type)
                    }
                }
            } header: {
                Text("Шаблоны SMS")
            } footer: {
                Text("Весь текст каждого шаблона можно заменить. Приложение не дописывает обязательную подпись автоматически.")
            }

            Section("Повторная отправка") {
                Picker("Предупреждать о повторе", selection: Binding(
                    get: { store.repeatDays },
                    set: { store.setRepeatDays($0) }
                )) {
                    Text("7 дней").tag(7)
                    Text("30 дней").tag(30)
                    Text("90 дней").tag(90)
                }
            }

            Section("Быстрый запуск на iPhone") {
                Text("После установки откройте приложение «Команды» → найдите действие «Открыть СМС Визитку» → добавьте его на экран, виджет или Action Button.")
                    .font(.footnote)
            }
        }
        .navigationTitle("Настройки")
        .alert("Сохранено", isPresented: $savedNotice) {
            Button("ОК", role: .cancel) {}
        } message: {
            Text("Профиль специалиста сохранён на этом iPhone.")
        }
    }
}
