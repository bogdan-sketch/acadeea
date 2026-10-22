import Foundation

/// Fictional orders for SwiftUI previews, decoded through the app's real
/// decoder so they exercise the same model as the API.
enum OrderPreviewData {
    static let orders: [OrderResponse] = {
        let now = Date()
        let iso = ISO8601DateFormatter()
        func at(_ dayOffset: Int, _ hour: Int, _ minute: Int) -> String {
            var c = Calendar.current.dateComponents([.year, .month, .day], from: now)
            c.hour = hour
            c.minute = minute
            let day = Calendar.current.date(from: c) ?? now
            return iso.string(from: Calendar.current.date(byAdding: .day, value: dayOffset, to: day) ?? day)
        }
        let rows: [(String, String, String, String, Int, Int, Int, String, String, Double, String)] = [
            ("WOO-11643", "IN_PREGATIRE", "PICKUP", "Andreea Mureșan", 0, 11, 30, "Tort Dubai Ø20", "BUCATI", 1, "La mulți ani, Ioana!"),
            ("CMD-0409", "PREGATITA", "DELIVERY", "Hotel Belvedere", 0, 13, 0, "Macarons", "BUCATI", 80, ""),
            ("WOO-11642", "NOUA", "PICKUP", "Radu Ilie", 0, 17, 30, "Tort Red Velvet Ø24", "BUCATI", 1, ""),
            ("CMD-0413", "IN_PREGATIRE", "DELIVERY", "Grădinița Albinuța", 1, 9, 0, "Monoporție Pavlova", "BUCATI", 40, ""),
            ("WOO-11640", "LIVRATA", "PICKUP", "Dan Oprea", 3, 12, 0, "Tort Dubai Ø24", "KILOGRAME", 1.2, ""),
        ]
        let json = rows.enumerated().map { index, r in
            """
            {"id":"o\(index)","orderNumber":"\(r.0)","status":"\(r.1)","fulfillmentType":"\(r.2)",
             "pickupLocationId":null,"deliveryPoint":"Cofetărie Napoca","deliveryAddress":"Str. Napoca 19, Cluj-Napoca",
             "notes":"Fără alune pe margine. Lumânare „30”.","createdById":"u1","assignedToId":null,
             "dueDate":"\(at(r.4, r.5, r.6))","createdAt":"\(at(0, 8, 12))","updatedAt":"\(at(0, 8, 40))",
             "completedAt":null,"createdBy":{"id":"u1","firstName":"Anca","lastName":"Pop"},"assignedTo":null,
             "items":[{"id":"i\(index)","recipeId":null,"recipeName":"\(r.7)","quantity":\(r.9),"unit":"\(r.8)",
                       "status":"IN_PREGATIRE","notes":"\(r.10)"}],
             "deliveryNote":null,"itemCount":1,"hasInvoice":false,"invoiceFileName":null,
             "customerName":"\(r.3)","externalStatus":\(r.0.hasPrefix("WOO") ? "\"processing\"" : "null")}
            """
        }.joined(separator: ",")
        let data = Data("[\(json)]".utf8)
        return (try? APIClient.makeDecoder().decode([OrderResponse].self, from: data)) ?? []
    }()
}
