import Foundation
import Capacitor
import HealthKit

/// Bridges HealthKit to store baby growth data (weight/height).
@objc(OBHealthKit)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBHealthKit"
    public let jsName = "OBHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveHeight", returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }

        var readTypes = Set<HKObjectType>()
        var writeTypes = Set<HKSampleType>()

        if let weightType = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            readTypes.insert(weightType)
            writeTypes.insert(weightType)
        }
        if let heightType = HKQuantityType.quantityType(forIdentifier: .height) {
            readTypes.insert(heightType)
            writeTypes.insert(heightType)
        }

        healthStore.requestAuthorization(toShare: writeTypes, read: readTypes) { success, error in
            if success {
                call.resolve(["authorized": true])
            } else {
                call.reject("Authorization failed: \(error?.localizedDescription ?? "unknown")")
            }
        }
    }

    @objc func saveWeight(_ call: CAPPluginCall) {
        guard let kg = call.getDouble("kg") else {
            call.reject("kg is required")
            return
        }
        let dateStr = call.getString("date")
        let date = dateStr != nil ? ISO8601DateFormatter().date(from: dateStr!) ?? Date() : Date()

        guard let weightType = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("Weight type not available")
            return
        }

        let quantity = HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg)
        let sample = HKQuantitySample(type: weightType, quantity: quantity, start: date, end: date)

        healthStore.save(sample) { success, error in
            if success {
                call.resolve(["saved": true])
            } else {
                call.reject("Failed to save: \(error?.localizedDescription ?? "unknown")")
            }
        }
    }

    @objc func saveHeight(_ call: CAPPluginCall) {
        guard let cm = call.getDouble("cm") else {
            call.reject("cm is required")
            return
        }
        let dateStr = call.getString("date")
        let date = dateStr != nil ? ISO8601DateFormatter().date(from: dateStr!) ?? Date() : Date()

        guard let heightType = HKQuantityType.quantityType(forIdentifier: .height) else {
            call.reject("Height type not available")
            return
        }

        let quantity = HKQuantity(unit: .meterUnit(with: .centi), doubleValue: cm)
        let sample = HKQuantitySample(type: heightType, quantity: quantity, start: date, end: date)

        healthStore.save(sample) { success, error in
            if success {
                call.resolve(["saved": true])
            } else {
                call.reject("Failed to save: \(error?.localizedDescription ?? "unknown")")
            }
        }
    }
}
