import SwiftUI

// Single-choice chip rows that replace `Menu` / `Picker(.menu)` pull-downs in
// the forms (owner's rule: no dropdowns — chips or segmented controls).

// MARK: - Choice chips

/// A wrapping row of `HChip`s for one choice out of a short list. Wraps onto
/// more lines instead of clipping at large Dynamic Type sizes.
struct ChoiceChips<Value: Hashable>: View {
    let options: [Value]
    let title: (Value) -> String
    @Binding var selection: Value
    var accessibilityLabel: String = "Opțiuni"

    var body: some View {
        ChipFlowLayout(spacing: 8) {
            ForEach(options, id: \.self) { option in
                HChip(title(option), isSelected: option == selection) {
                    if option != selection { selection = option }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Optional variant: tapping the selected chip keeps it; `noneTitle` adds a
/// leading chip for "nothing selected" when given.
struct OptionalChoiceChips<Value: Hashable>: View {
    let options: [Value]
    let title: (Value) -> String
    @Binding var selection: Value?
    var noneTitle: String?
    var accessibilityLabel: String = "Opțiuni"

    var body: some View {
        ChipFlowLayout(spacing: 8) {
            if let noneTitle {
                HChip(noneTitle, isSelected: selection == nil) { selection = nil }
            }
            ForEach(options, id: \.self) { option in
                HChip(title(option), isSelected: option == selection) {
                    if option != selection { selection = option }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

// MARK: - Flow layout

/// Left-aligned flow layout: places children in rows, wrapping when a row is full.
struct ChipFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.init(width: bounds.width, height: nil))
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: .init(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.init(width: width, height: nil))
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

#Preview("Choice chips") {
    @Previewable @State var pick = "Laborator"
    @Previewable @State var optional: String? = nil
    VStack(alignment: .leading, spacing: 16) {
        ChoiceChips(options: ["Laborator", "Magazin Centru", "Magazin Nord"], title: { $0 }, selection: $pick)
        OptionalChoiceChips(options: ["3 zile", "7 zile"], title: { $0 }, selection: $optional, noneTitle: "Fără")
    }
    .padding()
    .background(AppTheme.Colors.appBackground)
}
