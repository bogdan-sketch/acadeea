import SwiftUI

struct SignatureCaptureSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var signedByName = ""
    @State private var signatureState = SignatureState()
    let onSign: (String, Data) -> Void

    private let canvasSize = CGSize(width: 350, height: 200)

    var body: some View {
        NavigationStack {
            VStack(spacing: AppTheme.Spacing.lg) {
                Text("Semnatura livrare")
                    .font(.headline)

                TextField("Numele persoanei", text: $signedByName)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal)

                SignatureCanvasView(state: signatureState)
                    .frame(height: canvasSize.height)
                    .padding(.horizontal)

                HStack(spacing: AppTheme.Spacing.lg) {
                    Button("Sterge") {
                        signatureState.clear()
                    }
                    .foregroundStyle(.red)

                    Spacer()

                    Button("Confirma") {
                        if let imageData = signatureState.exportAsPNG(size: canvasSize, lineWidth: 2.5) {
                            onSign(signedByName, imageData)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(signedByName.isEmpty || signatureState.isEmpty)
                }
                .padding(.horizontal)

                Spacer()
            }
            .padding(.top, AppTheme.Spacing.lg)
            .navigationBarBackButtonHidden()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
            }
        }
    }
}
