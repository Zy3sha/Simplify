import Foundation
import Capacitor
import WebKit

@objc(DisableBounce)
public class DisableBouncePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DisableBounce"
    public let jsName = "DisableBounce"
    public let pluginMethods: [CAPPluginMethod] = []

    override public func load() {
        DispatchQueue.main.async { [weak self] in
            if let webView = self?.bridge?.webView {
                webView.scrollView.bounces = false
                webView.scrollView.alwaysBounceVertical = false
                webView.scrollView.alwaysBounceHorizontal = false
            }
        }
    }
}
