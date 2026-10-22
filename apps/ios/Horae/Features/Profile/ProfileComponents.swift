import SwiftUI

// MARK: - Section card

/// One card of Profil & setări (web `Section`): title, one-line description,
/// optional tag ("doar root"), content, optional footer (note + action).
struct ProfileSection<Content: View, Footer: View>: View {
    let title: String
    var description: String?
    var tag: String?
    var tone: Tone = .standard
    @ViewBuilder let content: () -> Content
    @ViewBuilder let footer: () -> Footer

    enum Tone { case standard, danger }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(AppFont.body(17, weight: .bold))
                        .foregroundStyle(tone == .danger ? AppTheme.Status.fg(.danger) : AppTheme.Colors.label)
                        .accessibilityAddTraits(.isHeader)
                    if let tag {
                        Text(tag)
                            .font(AppFont.body(11, weight: .bold))
                            .foregroundStyle(AppTheme.Colors.secondaryLabel)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(AppTheme.Colors.appBackground, in: Capsule())
                    }
                }
                if let description {
                    Text(description)
                        .font(AppFont.body(13))
                        .foregroundStyle(AppTheme.Colors.secondaryLabel)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            content()

            footer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.Colors.card, in: shape)
        .overlay(shape.strokeBorder(
            tone == .danger ? AppTheme.Status.fg(.danger).opacity(0.35) : AppTheme.Colors.border,
            lineWidth: 1))
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
    }
}

extension ProfileSection where Footer == EmptyView {
    init(
        _ title: String,
        description: String? = nil,
        tag: String? = nil,
        tone: Tone = .standard,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.description = description
        self.tag = tag
        self.tone = tone
        self.content = content
        self.footer = { EmptyView() }
    }
}

extension ProfileSection {
    init(
        _ title: String,
        description: String? = nil,
        tag: String? = nil,
        tone: Tone = .standard,
        @ViewBuilder content: @escaping () -> Content,
        @ViewBuilder footer: @escaping () -> Footer
    ) {
        self.title = title
        self.description = description
        self.tag = tag
        self.tone = tone
        self.content = content
        self.footer = footer
    }
}

/// Footer strip of a section: muted note on the left, action on the right.
struct ProfileSectionFooter<Action: View>: View {
    var note: String?
    @ViewBuilder let action: () -> Action

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    noteText
                    action()
                }
            } else {
                HStack(spacing: 12) {
                    noteText
                    Spacer(minLength: 8)
                    action()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { ProfileDivider() }
    }

    @ViewBuilder
    private var noteText: some View {
        if let note {
            Text(note)
                .font(AppFont.body(12))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Row

/// Row inside a section: optional leading view, title + subtitle, trailing
/// actions. At large text sizes the actions move under the text.
struct ProfileRow<Lead: View, Trailing: View>: View {
    let title: String
    var subtitle: String?
    var titleColor: Color = AppTheme.Colors.label
    @ViewBuilder let lead: () -> Lead
    @ViewBuilder let trailing: () -> Trailing

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) { lead(); texts }
                    HStack(spacing: 8) { trailing() }
                }
            } else {
                // The text column takes exactly what is left after the
                // actions (no Spacer): a wrapped subtitle rounds its width up
                // to the pixel, and with a Spacer that third of a point
                // widened the whole page, so it dragged sideways.
                HStack(spacing: 12) {
                    lead()
                    texts.frame(maxWidth: .infinity, alignment: .leading)
                    trailing()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
        .overlay(alignment: .top) { ProfileDivider() }
    }

    private var texts: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(AppFont.body(15, weight: .semibold))
                .foregroundStyle(titleColor)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(AppFont.body(12.5))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension ProfileRow where Lead == EmptyView {
    init(
        _ title: String,
        subtitle: String? = nil,
        titleColor: Color = AppTheme.Colors.label,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.title = title
        self.subtitle = subtitle
        self.titleColor = titleColor
        self.lead = { EmptyView() }
        self.trailing = trailing
    }
}

struct ProfileDivider: View {
    var body: some View {
        Rectangle().fill(AppTheme.Colors.border).frame(height: 1)
    }
}

// MARK: - Word button

/// Worded action of the web (`IconAction` with a word): icon + word, 44pt,
/// bordered on paper; `.primary` filled, `.danger` red text.
struct ProfileWordButton: View {
    enum Tone { case standard, primary, danger }

    let title: String
    let systemImage: String
    var tone: Tone = .standard
    var isBusy = false
    var help: String?
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if isBusy {
                    ProgressView().controlSize(.small).tint(foreground)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 13, weight: .semibold))
                        .accessibilityHidden(true)
                }
                Text(title)
                    .font(AppFont.body(14, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundStyle(foreground)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(background, in: shape)
            .overlay(shape.strokeBorder(border, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel(title)
        .help(help ?? title)
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 12, style: .continuous) }

    private var foreground: Color {
        if !isEnabled && !isBusy { return AppTheme.Colors.secondaryLabel }
        return switch tone {
        case .standard: AppTheme.Colors.label
        case .primary: AppTheme.Colors.onPrimary
        case .danger: AppTheme.Status.fg(.danger)
        }
    }

    private var background: Color {
        tone == .primary ? AppTheme.Colors.primary : AppTheme.Colors.appBackground
    }

    private var border: Color {
        switch tone {
        case .standard: AppTheme.Colors.border
        case .primary: AppTheme.Colors.primary
        case .danger: AppTheme.Status.fg(.danger).opacity(0.45)
        }
    }
}

/// Navigation variant of `ProfileWordButton` (pushes a Route on the
/// enclosing NavigationStack).
struct ProfileWordLink: View {
    let title: String
    let systemImage: String
    let route: Route
    var help: String?

    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 13, weight: .semibold))
                    .accessibilityHidden(true)
                Text(title)
                    .font(AppFont.body(14, weight: .bold))
                    .lineLimit(1)
            }
            .foregroundStyle(AppTheme.Colors.label)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(AppTheme.Colors.appBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .help(help ?? title)
    }
}

// MARK: - Fields

/// Label above a value — editable field or read-only box (web FIELD_RO).
struct ProfileField<Content: View>: View {
    let label: String
    var hint: String?
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(AppFont.body(12.5, weight: .semibold))
                .foregroundStyle(AppTheme.Colors.secondaryLabel)
            content()
            if let hint {
                Text(hint)
                    .font(AppFont.body(12))
                    .foregroundStyle(AppTheme.Colors.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 44pt input / read-only box.
struct ProfileBox: ViewModifier {
    var readOnly = false

    func body(content: Content) -> some View {
        content
            .font(AppFont.body(15))
            .foregroundStyle(readOnly ? AppTheme.Colors.secondaryLabel : AppTheme.Colors.label)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(readOnly ? AppTheme.Colors.appBackground : AppTheme.Colors.card,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(AppTheme.Colors.border, lineWidth: 1))
    }
}

extension View {
    func profileBox(readOnly: Bool = false) -> some View {
        modifier(ProfileBox(readOnly: readOnly))
    }
}

/// Leading 40pt tile with an SF Symbol (Securitate rows).
struct ProfileGlyph: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(AppTheme.Colors.label)
            .frame(width: 40, height: 40)
            .background(AppTheme.Colors.appBackground, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .accessibilityHidden(true)
    }
}

#Preview("Profile components") {
    ScrollView {
        ProfileSection("Securitate", description: "Parola și conturile conectate.") {
            ProfileRow("Parolă", subtitle: "Link pe email, valabil 30 de minute") {
                ProfileWordButton(title: "Schimbă parola", systemImage: "envelope") {}
            }
        } footer: {
            ProfileSectionFooter(note: "Modificări nesalvate") {
                ProfileWordButton(title: "Salvează", systemImage: "checkmark", tone: .primary) {}
            }
        }
        .padding()
    }
    .background(AppTheme.Colors.appBackground)
}
