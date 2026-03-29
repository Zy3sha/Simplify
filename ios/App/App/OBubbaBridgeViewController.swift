import UIKit
import Capacitor

class OBubbaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CareCardPlugin())
        bridge?.registerPluginInstance(DisableBouncePlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(SiriShortcutsPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Kill rubber-band bounce directly
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
    }
}
