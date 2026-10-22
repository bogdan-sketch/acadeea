import SwiftUI

/// View modifier that guards a form against accidental dismissal while it has
/// unsaved changes. Disables the interactive (swipe-down) sheet dismissal and,
/// when the cancel button is tapped on a dirty form, shows a confirmation alert.
///
/// Mirrors `ErrorAlertModifier` in shape. Wire it by having the form's cancel
/// (xmark) button flip `isPresented` to `true` only when `isDirty`, otherwise
/// dismiss directly.
struct UnsavedChangesModifier: ViewModifier {
    let isDirty: Bool
    @Binding var isPresented: Bool
    let onDiscard: () -> Void

    func body(content: Content) -> some View {
        content
            .interactiveDismissDisabled(isDirty)
            .alert("Ai modificări nesalvate", isPresented: $isPresented) {
                Button("Renunță la modificări", role: .destructive) { onDiscard() }
                Button("Continuă editarea", role: .cancel) {}
            } message: {
                Text("Sigur vrei să ieși? Modificările nu vor fi salvate.")
            }
    }
}

extension View {
    /// Guard a form against losing unsaved edits.
    /// - Parameters:
    ///   - isDirty: whether the form currently has unsaved changes.
    ///   - isPresented: drives the confirmation alert (set to `true` by the
    ///     cancel button when `isDirty`).
    ///   - onDiscard: called when the user confirms discarding (usually `dismiss`).
    func unsavedChangesGuard(
        isDirty: Bool,
        isPresented: Binding<Bool>,
        onDiscard: @escaping () -> Void
    ) -> some View {
        modifier(UnsavedChangesModifier(isDirty: isDirty, isPresented: isPresented, onDiscard: onDiscard))
    }
}
