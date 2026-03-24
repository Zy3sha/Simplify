import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

/// Share Extension: allows sharing photos into OBubba's photo diary from other apps.
class ShareViewController: SLComposeServiceViewController {

    private let appGroupId = "group.com.obubba.app"
    private var sharedImages: [Data] = []

    override func isContentValid() -> Bool {
        return true
    }

    override func didSelectPost() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }

        let group = DispatchGroup()

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }
            for attachment in attachments {
                if attachment.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    group.enter()
                    attachment.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] data, error in
                        defer { group.leave() }
                        guard error == nil else { return }

                        var imageData: Data?
                        if let url = data as? URL {
                            imageData = try? Data(contentsOf: url)
                        } else if let image = data as? UIImage {
                            imageData = image.jpegData(compressionQuality: 0.85)
                        } else if let d = data as? Data {
                            imageData = d
                        }

                        if let d = imageData {
                            self?.sharedImages.append(d)
                        }
                    }
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.saveSharedContent()
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private func saveSharedContent() {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }

        // Convert images to base64 and store as pending shares
        let shares = sharedImages.prefix(5).map { data -> [String: String] in
            return [
                "image": data.base64EncodedString(),
                "caption": contentText ?? "",
                "date": ISO8601DateFormatter().string(from: Date()),
                "source": "share_extension"
            ]
        }

        if let jsonData = try? JSONSerialization.data(withJSONObject: shares),
           let json = String(data: jsonData, encoding: .utf8) {
            defaults.set(json, forKey: "pendingShares")
        }

        // Post notification so app picks it up on next launch
        defaults.set(true, forKey: "hasPendingShares")
    }

    override func configurationItems() -> [Any]! {
        return []
    }
}
