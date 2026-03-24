import Foundation
import Capacitor
import UIKit
import WebKit

/// Renders care card HTML to PDF and provides native print support.
@objc(OBCareCard)
public class CareCardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OBCareCard"
    public let jsName = "OBCareCard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "generatePDF", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printHTML", returnType: CAPPluginReturnPromise),
    ]

    // ── Generate PDF from HTML string ──
    // Returns { filePath: "/tmp/…/CareGuide.pdf" }
    @objc func generatePDF(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("Missing html parameter")
            return
        }
        let fileName = call.getString("fileName") ?? "OBubba-Care-Guide.pdf"

        DispatchQueue.main.async {
            self.renderHTMLToPDF(html: html, fileName: fileName) { result in
                switch result {
                case .success(let path):
                    call.resolve(["filePath": path])
                case .failure(let error):
                    call.reject("PDF generation failed: \(error.localizedDescription)")
                }
            }
        }
    }

    // ── Print HTML using native iOS print dialog ──
    @objc func printHTML(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("Missing html parameter")
            return
        }
        let jobName = call.getString("jobName") ?? "OBubba Care Guide"

        DispatchQueue.main.async {
            let printController = UIPrintInteractionController.shared
            let printInfo = UIPrintInfo(dictionary: nil)
            printInfo.outputType = .general
            printInfo.jobName = jobName
            printController.printInfo = printInfo
            printController.printFormatter = UIMarkupTextPrintFormatter(markupText: html)

            printController.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject("Print failed: \(error.localizedDescription)")
                } else {
                    call.resolve(["printed": completed])
                }
            }
        }
    }

    // ── Private: render HTML → PDF data via UIPrintPageRenderer ──
    private func renderHTMLToPDF(html: String, fileName: String, completion: @escaping (Result<String, Error>) -> Void) {
        let formatter = UIMarkupTextPrintFormatter(markupText: html)

        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(formatter, startingAtPageAt: 0)

        // A4 page size in points (595.28 x 841.89)
        let pageWidth: CGFloat = 595.28
        let pageHeight: CGFloat = 841.89
        let margin: CGFloat = 28.35 // ~1cm

        let pageRect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        let printableRect = pageRect.insetBy(dx: margin, dy: margin)

        renderer.setValue(pageRect, forKey: "paperRect")
        renderer.setValue(printableRect, forKey: "printableRect")

        let pdfData = NSMutableData()
        UIGraphicsBeginPDFContextToData(pdfData, pageRect, nil)

        for pageIndex in 0..<renderer.numberOfPages {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: pageIndex, in: UIGraphicsGetPDFContextBounds())
        }

        UIGraphicsEndPDFContext()

        // Write to temp directory
        let tempDir = FileManager.default.temporaryDirectory
        let filePath = tempDir.appendingPathComponent(fileName)

        do {
            try pdfData.write(to: filePath, options: .atomic)
            completion(.success(filePath.path))
        } catch {
            completion(.failure(error))
        }
    }
}
