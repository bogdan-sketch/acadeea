import SwiftUI

/// Numeric quantity field that starts EMPTY instead of rendering an editable
/// "0" — typing 800 over a pre-filled zero used to produce "0800". Accepts
/// both comma and dot as the decimal separator while typing, and reflects
/// external value changes (prefills) only while the field is not focused so
/// the caret position and in-progress input ("1,") are never clobbered.
struct QuantityField: View {
    let title: String
    @Binding var value: Double
    /// Optional external focus driver. `.focused(_:)` on a composite View is a
    /// no-op, so parents that need to programmatically focus this field pass
    /// their own `@FocusState` binding here and it is bridged to the inner
    /// TextField's focus.
    var focusBinding: FocusState<Bool>.Binding? = nil

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.decimalPad)
            .focused($focused)
            .onAppear { text = Self.display(value) }
            .onChange(of: text) { _, t in
                value = Self.parse(t)
            }
            .onChange(of: value) { _, v in
                if !focused, Self.parse(text) != v { text = Self.display(v) }
            }
            .onChange(of: focused) { _, isFocused in
                // Re-format on blur ("1," → "1"); keep raw input while typing.
                if !isFocused { text = Self.display(value) }
                if let focusBinding, focusBinding.wrappedValue != isFocused {
                    focusBinding.wrappedValue = isFocused
                }
            }
            .onChange(of: focusBinding?.wrappedValue) { _, want in
                if let want, want != focused { focused = want }
            }
    }

    /// Editable text keeps the stored precision (0,125 stays 0,125 — the
    /// 2-decimal `qtyFormatted` rounded it to 0,13 and saved that back).
    private static func display(_ v: Double) -> String {
        v == 0 ? "" : RoFormat.inputText(v)
    }

    private static func parse(_ t: String) -> Double {
        RoFormat.parseDecimal(t) ?? 0
    }
}

/// Optional-value variant — empty text means nil (used for optional inputs
/// like the finished-batch weight).
struct OptionalQuantityField: View {
    let title: String
    @Binding var value: Double?

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.decimalPad)
            .focused($focused)
            .onAppear { text = Self.display(value) }
            .onChange(of: text) { _, t in
                let trimmed = t.trimmingCharacters(in: .whitespaces)
                value = trimmed.isEmpty
                    ? nil
                    : RoFormat.parseDecimal(trimmed)
            }
            .onChange(of: value) { _, v in
                // Reflect async prefills (edit mode loads the value after appear)
                // while not focused, so the field never shows stale empty text.
                guard !focused else { return }
                let parsed = RoFormat.parseDecimal(text)
                if parsed != v { text = Self.display(v) }
            }
            .onChange(of: focused) { _, isFocused in
                if !isFocused { text = Self.display(value) }
            }
    }

    private static func display(_ v: Double?) -> String {
        v.map { $0 == 0 ? "" : RoFormat.inputText($0) } ?? ""
    }
}
