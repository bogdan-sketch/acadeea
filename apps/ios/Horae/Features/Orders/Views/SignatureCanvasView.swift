import SwiftUI

/// Shared state for signature drawing, accessible from parent views.
@Observable
final class SignatureState {
    var paths: [[CGPoint]] = []
    var currentPath: [CGPoint] = []
    var isEmpty: Bool { paths.isEmpty && currentPath.isEmpty }

    func clear() {
        paths = []
        currentPath = []
    }

    func exportAsPNG(size: CGSize, lineWidth: CGFloat) -> Data? {
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { ctx in
            ctx.cgContext.setFillColor(UIColor.white.cgColor)
            ctx.cgContext.fill(CGRect(origin: .zero, size: size))

            for pathPoints in paths {
                guard pathPoints.count > 1 else { continue }
                let bezierPath = UIBezierPath()
                bezierPath.move(to: pathPoints[0])
                for point in pathPoints.dropFirst() {
                    bezierPath.addLine(to: point)
                }
                bezierPath.lineWidth = lineWidth
                UIColor.black.setStroke()
                bezierPath.stroke()
            }
        }
        return image.pngData()
    }
}

/// Canvas that captures a handwritten signature via drag gestures.
struct SignatureCanvasView: View {
    var state: SignatureState
    let lineWidth: CGFloat = 2.5

    var body: some View {
        Canvas { context, size in
            for path in state.paths {
                drawPath(path, in: &context)
            }
            if !state.currentPath.isEmpty {
                drawPath(state.currentPath, in: &context)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    state.currentPath.append(value.location)
                }
                .onEnded { _ in
                    state.paths.append(state.currentPath)
                    state.currentPath = []
                }
        )
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md))
        .overlay(
            RoundedRectangle(cornerRadius: AppTheme.CornerRadius.md)
                .stroke(Color(.systemGray4), lineWidth: 1)
        )
    }

    private func drawPath(_ points: [CGPoint], in context: inout GraphicsContext) {
        guard points.count > 1 else { return }
        var path = Path()
        path.move(to: points[0])
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        context.stroke(path, with: .color(.black), lineWidth: lineWidth)
    }
}
