import UIKit
import Capacitor

/// Disables WKWebView rubber-band bounce effect.
/// Add this file to the App target in Xcode.
class DisableBouncePlugin: CAPPlugin {
    override public func load() {
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.webView?.scrollView.bounces = false
            self?.bridge?.webView?.scrollView.alwaysBounceVertical = false
            self?.bridge?.webView?.scrollView.alwaysBounceHorizontal = false
        }
    }
}
