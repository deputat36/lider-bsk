import Foundation

struct SMSLengthInfo {
    let characters: Int
    let segments: Int
    let encodingName: String
}

enum SMSLength {
    private static let gsmBasic = Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà")
    private static let gsmExtended = Set("^{}\\[~]|€")

    static func analyze(_ text: String) -> SMSLengthInfo {
        guard !text.isEmpty else {
            return SMSLengthInfo(characters: 0, segments: 0, encodingName: "—")
        }

        var septets = 0
        var isGSM7 = true

        for character in text {
            if gsmBasic.contains(character) {
                septets += 1
            } else if gsmExtended.contains(character) {
                septets += 2
            } else {
                isGSM7 = false
                break
            }
        }

        if isGSM7 {
            let segments = septets <= 160 ? 1 : Int(ceil(Double(septets) / 153.0))
            return SMSLengthInfo(characters: text.count, segments: segments, encodingName: "GSM-7")
        }

        let units = text.utf16.count
        let segments = units <= 70 ? 1 : Int(ceil(Double(units) / 67.0))
        return SMSLengthInfo(characters: text.count, segments: segments, encodingName: "Unicode")
    }
}
