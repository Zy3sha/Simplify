import UIKit
import Capacitor

class OBubbaBridgeViewController: CAPBridgeViewController {

    // Called after the Capacitor bridge is fully initialized and ready.
    // This is the correct place to register custom plugin instances.
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CareCardPlugin())
        bridge?.registerPluginInstance(DisableBouncePlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(LiveActivityPlugin())
        bridge?.registerPluginInstance(SiriShortcutsPlugin())
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
