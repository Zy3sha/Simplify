import UIKit
import Capacitor

/// Disables WKWebView rubber-band bounce effect.
/// Auto-registers with Capacitor via CAPBridgedPlugin.
@objc(DisableBounce)
public class DisableBouncePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DisableBounce"
    public let jsName = "DisableBounce"
    public let pluginMethods: [CAPPluginMethod] = []

    override public func load() {
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.webView?.scrollView.bounces = false
            self?.bridge?.webView?.scrollView.alwaysBounceVertical = false
            self?.bridge?.webView?.scrollView.alwaysBounceHorizontal = false
            self?.bridge?.webView?.scrollView.contentInsetAdjustmentBehavior = .never
        }
    }
}
