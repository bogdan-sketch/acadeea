import SwiftUI
import UIKit

/// One-tap printing of an HTML document via AirPrint.
/// Usage: `HTMLPrinter.present(html: myHtml, jobName: "Fisa de trasabilitate")`.
enum HTMLPrinter {
    static func present(html: String, jobName: String) {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName

        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)

        // iPad presents the print UI as a popover and needs a source anchor —
        // the anchorless variant lands nowhere. Anchor to the key window.
        if UIDevice.current.userInterfaceIdiom == .pad,
           let window = UIApplication.shared.connectedScenes
               .compactMap({ $0 as? UIWindowScene })
               .flatMap({ $0.windows })
               .first(where: { $0.isKeyWindow }) {
            let anchor = CGRect(x: window.bounds.midX, y: window.safeAreaInsets.top + 22, width: 1, height: 1)
            controller.present(from: anchor, in: window, animated: true, completionHandler: nil)
        } else {
            controller.present(animated: true)
        }
    }

    /// Shared A4-ish document skeleton with sane print typography.
    static func document(title: String, body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8"><style>
        body { font-family: -apple-system, Helvetica, sans-serif; font-size: 12px; color: #000; margin: 24px; }
        h1 { font-size: 16px; text-align: center; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        th, td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; text-align: left; vertical-align: top; }
        th { background: #f0f0f0; }
        .meta { margin: 2px 0; }
        .row { display: flex; justify-content: space-between; }
        .sig { margin-top: 36px; display: flex; justify-content: space-between; }
        .box { display: inline-block; border: 1px solid #000; min-width: 60px; min-height: 16px; vertical-align: middle; }
        .sq { display: inline-block; border: 1px solid #000; width: 12px; height: 12px; vertical-align: middle; margin-left: 4px; }
        .small { font-size: 10px; color: #333; }
        </style></head><body>
        \(body)
        </body></html>
        """
    }
}
