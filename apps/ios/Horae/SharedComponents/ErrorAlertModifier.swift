import SwiftUI

/// View modifier that shows an alert when an error binding is set.
struct ErrorAlertModifier: ViewModifier {
    @Binding var error: APIError?

    func body(content: Content) -> some View {
        content
            .alert(
                "Eroare",
                isPresented: Binding(
                    get: { error != nil && error?.isCancellation == false },
                    set: { if !$0 { error = nil } }
                )
            ) {
                Button("OK", role: .cancel) { error = nil }
            } message: {
                Text(error?.errorDescription ?? "Eroare necunoscută")
            }
    }
}

extension View {
    func errorAlert(_ error: Binding<APIError?>) -> some View {
        modifier(ErrorAlertModifier(error: error))
    }
}
