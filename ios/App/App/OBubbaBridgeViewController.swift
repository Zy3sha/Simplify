import UIKit
import Capacitor
import WebKit

class OBubbaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CareCardPlugin())
        bridge?.registerPluginInstance(DisableBouncePlugin())

        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(SiriShortcutsPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
        bridge?.registerPluginInstance(TravelTimePlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        disableBounce()
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        disableBounce()
    }

    private func disableBounce() {
        guard let wv = webView else { return }
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.alwaysBounceHorizontal = false
        wv.scrollView.isDirectionalLockEnabled = true
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        // Disable back/forward swipe navigation — prevents page "sliding" sideways
        wv.allowsBackForwardNavigationGestures = false
    }
}
