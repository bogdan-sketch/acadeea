import SwiftUI

/// Generic picker for any CaseIterable enum with RawRepresentable String.
struct EnumPicker<E: CaseIterable & Hashable & RawRepresentable>: View where E.AllCases: RandomAccessCollection, E.RawValue == String {
    let title: String
    @Binding var selection: E
    let displayName: (E) -> String

    init(_ title: String, selection: Binding<E>, displayName: @escaping (E) -> String = { $0.rawValue }) {
        self.title = title
        self._selection = selection
        self.displayName = displayName
    }

    var body: some View {
        Picker(title, selection: $selection) {
            ForEach(Array(E.allCases), id: \.self) { value in
                Text(displayName(value)).tag(value)
            }
        }
    }
}

/// Optional variant — includes "All" option.
struct OptionalEnumPicker<E: CaseIterable & Hashable & RawRepresentable>: View where E.AllCases: RandomAccessCollection, E.RawValue == String {
    let title: String
    @Binding var selection: E?
    let allLabel: String
    let displayName: (E) -> String

    init(_ title: String, selection: Binding<E?>, allLabel: String = "Toate", displayName: @escaping (E) -> String = { $0.rawValue }) {
        self.title = title
        self._selection = selection
        self.allLabel = allLabel
        self.displayName = displayName
    }

    var body: some View {
        Picker(title, selection: $selection) {
            Text(allLabel).tag(nil as E?)
            ForEach(Array(E.allCases), id: \.self) { value in
                Text(displayName(value)).tag(value as E?)
            }
        }
    }
}

// MARK: - Unit selector (measure toggle + unit chips)

/// Reusable, HIG-compliant unit-of-measure selector. Two steps:
///   1. A segmented control to pick the measure type (Solid / Lichid / Bucati).
///   2. The units of that family shown as selectable chips.
/// Picking a measure defaults the unit to that family's first unit. Bound to a
/// single `UnitType`. When `lockedMeasure` is true the toggle is hidden and only
/// the bound unit's family is offered (e.g. a recipe ingredient constrained to
/// its raw material's family).
struct UnitSelector: View {
    @Binding var unit: UnitType
    var lockedMeasure: Bool = false
    var title: String?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var measure: UnitType.Measure
    /// Unit stored when the selector appeared — kept in the list even when it
    /// is a legacy (non-metric) unit, so editing never silently drops it.
    private let storedUnit: UnitType

    init(unit: Binding<UnitType>, lockedMeasure: Bool = false, title: String? = nil) {
        self._unit = unit
        self.storedUnit = unit.wrappedValue
        self.lockedMeasure = lockedMeasure
        self.title = title
        self._measure = State(initialValue: unit.wrappedValue.measure)
    }

    private var units: [UnitType] { UnitType.units(for: measure, keeping: storedUnit) }

    var body: some View {
        VStack(alignment: .leading, spacing: AppTheme.Spacing.sm) {
            if let title {
                Text(title).font(.subheadline.weight(.medium))
            }

            if !lockedMeasure {
                Picker("Tip unitate", selection: $measure) {
                    ForEach(UnitType.Measure.allCases) { m in
                        Text(m.shortLabel).tag(m)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: measure) {
                    if unit.measure != measure {
                        unit = UnitType.units(for: measure).first ?? unit
                    }
                }
                .accessibilityLabel("Tip unitate de masura")
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: AppTheme.Spacing.sm) {
                    ForEach(units) { u in
                        UnitChip(label: u.abbreviation, isSelected: u == unit) {
                            if u != unit { unit = u }
                        }
                    }
                }
                .padding(.vertical, AppTheme.Spacing.xxs)
                .padding(.trailing, AppTheme.Spacing.xs)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Unitate de masura")
            .animation(reduceMotion ? nil : .spring(.snappy, blendDuration: 0.2), value: measure)
        }
        .onChange(of: unit) {
            if unit.measure != measure { measure = unit.measure }
        }
    }
}

/// A single selectable unit pill using AppTheme styling.
private struct UnitChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .lineLimit(1)
                .padding(.horizontal, AppTheme.Spacing.md)
                .padding(.vertical, AppTheme.Spacing.sm)
                .frame(minWidth: 44, minHeight: 44)
                .background {
                    if isSelected {
                        Capsule().fill(AppTheme.Colors.primary)
                    } else {
                        Capsule().fill(.thinMaterial)
                    }
                }
                .foregroundStyle(isSelected ? Color.white : AppTheme.Colors.label)
                .overlay {
                    if !isSelected {
                        Capsule().strokeBorder(Color(.separator), lineWidth: 0.5)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .animation(reduceMotion ? nil : .spring(.snappy, blendDuration: 0.2), value: isSelected)
        .sensoryFeedback(.selection, trigger: isSelected)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
