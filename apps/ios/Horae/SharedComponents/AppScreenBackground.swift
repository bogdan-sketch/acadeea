import SwiftUI

/// Fundalul standard al paginilor principale (din Claude Design):
/// - fundal "aproape negru" in dark mode (nu negru pur), grupat-gri in light;
/// - gradient vertical sus, din culoarea de accent a organizatiei la 30%
///   opacitate, care se pierde in transparent.
struct AppScreenBackground: ViewModifier {
    var showsGradient: Bool = true
    /// Pe iPad, `.readableWidth()` deseneaza deja fundalul pe toata latimea
    /// coloanei de detaliu — aici doar ascundem fundalul listelor, altfel
    /// gradientul s-ar suprapune de doua ori (o banda mai inchisa la mijloc).
    @Environment(\.screenBackgroundHandled) private var handledByAncestor

    func body(content: Content) -> some View {
        if handledByAncestor {
            content.scrollContentBackground(.hidden)
        } else {
            content
                // Listele/Form-urile isi ascund fundalul propriu ca sa se vada
                // fundalul + gradientul paginii (se propaga prin environment).
                .scrollContentBackground(.hidden)
                .background {
                    ZStack(alignment: .top) {
                        AppTheme.Colors.appBackground
                            .ignoresSafeArea()
                        if showsGradient {
                            LinearGradient(
                                colors: [
                                    AppTheme.Colors.primary.opacity(0.30),
                                    .clear,
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .frame(height: 260)
                            .frame(maxHeight: .infinity, alignment: .top)
                            .ignoresSafeArea(edges: .top)
                        }
                    }
                }
        }
    }
}

extension View {
    func appScreenBackground(showsGradient: Bool = true) -> some View {
        modifier(AppScreenBackground(showsGradient: showsGradient))
    }
}


/// Cautare "colapsata": campul NU exista by default — doar lupa din STANGA
/// barei (accent, ca "+"). Tap → apare campul peste continut, cu focus;
/// tap din nou → se inchide si goleste textul. Inlocuieste `.searchable`
/// pe ecranele principale (itemul de search al sistemului nu poate fi nici
/// mutat leading, nici scos — `toolbar(removing: .search)` nu il atinge).
private struct CollapsedSearchBar: ViewModifier {
    @Binding var text: String
    let prompt: String
    /// Titlu mic afisat central (intre lupa si "+"); dispare cand e deschisa
    /// cautarea, ca sa faca loc campului.
    var title: String?
    @State private var open = false
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .toolbar {
                if let title, !open {
                    ToolbarItem(placement: .principal) {
                        Text(title)
                            .font(.headline)
                    }
                }
                // Campul se deschide DIN lupa, expandand spre dreapta in bara
                // (nu peste lista): inchis = doar butonul; deschis = camp +
                // "x" de inchidere, in acelasi item leading.
                ToolbarItem(placement: .topBarLeading) {
                    if open {
                        HStack(spacing: AppTheme.Spacing.sm) {
                            Image(systemName: "magnifyingglass")
                                .foregroundStyle(.secondary)
                            TextField(prompt, text: $text)
                                .textFieldStyle(.plain)
                                .autocorrectionDisabled()
                                .focused($focused)
                                .frame(minWidth: 150, maxWidth: 240)
                            Button {
                                withAnimation(.snappy) { open = false }
                                text = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .accessibilityLabel("Inchide cautarea")
                        }
                        .transition(.move(edge: .leading).combined(with: .opacity))
                    } else {
                        Button {
                            withAnimation(.snappy) { open = true }
                        } label: {
                            Image(systemName: "magnifyingglass")
                        }
                        .accessibilityLabel("Cauta")
                    }
                }
            }
            .onChange(of: open) {
                if open { focused = true }
            }
    }
}

extension View {
    func collapsedSearch(text: Binding<String>, prompt: String, title: String? = nil) -> some View {
        modifier(CollapsedSearchBar(text: text, prompt: prompt, title: title))
    }
}
